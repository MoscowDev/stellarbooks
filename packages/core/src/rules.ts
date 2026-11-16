/**
 * Mapping rules: configurable, pure functions from economic events to journal entries.
 *
 * A {@link RuleSet} is an ordered list of rules with a version. For each event, the **first** rule
 * whose `matches` returns true produces the entry's lines. Events that no rule matches are
 * returned in {@link MappingResult.unmatched} and never silently dropped.
 *
 * Mapping is deterministic. The same events, in any order, with the same rule set and context
 * produce identical entries in an identical order.
 *
 * @module
 */
import type { ChartOfAccounts } from './account.js';
import { StellarBooksValidationError, type ValidationIssue } from './errors.js';
import { validateEvent, type EconomicEvent } from './events.js';
import { validateEntry, type JournalEntry, type JournalLine } from './journal.js';
import { chainSourceKey, isKeyToken, postingKey } from './posting-key.js';
import { compareSourcePositions } from './source.js';

/** Information available to rules besides the event itself. */
export interface MappingContext {
  /** The book's chart of accounts. */
  readonly chart: ChartOfAccounts;
  /** Base addresses (`G...`) of all wallets tracked by the book. Used to detect internal transfers. */
  readonly trackedWallets: ReadonlySet<string>;
}

/** A mapping rule. Keep `matches` and `lines` pure: no I/O, randomness or clock access. */
export interface MappingRule {
  /** Unique ID within the rule set, `[A-Za-z0-9._-]{1,64}`. Becomes part of the source key. */
  readonly id: string;
  /** What the rule does, for documentation and audit. */
  readonly description: string;
  /** Returns true if this rule handles the event. */
  matches(event: EconomicEvent, context: MappingContext): boolean;
  /** Produces the entry's lines. They must balance per asset. */
  lines(event: EconomicEvent, context: MappingContext): readonly JournalLine[];
  /** Optional entry description. Defaults to the rule description. */
  describe?(event: EconomicEvent): string;
}

/** An ordered, versioned list of rules. */
export interface RuleSet {
  /** Rule set ID, for example `freelancer`. */
  readonly id: string;
  /** Version, `[A-Za-z0-9._-]{1,64}`. Bump it whenever any rule's output could change. */
  readonly version: string;
  /** Rules, in priority order. */
  readonly rules: readonly MappingRule[];
}

/** An event that a rule matched but could not be turned into a valid entry. */
export interface MappingFailure {
  /** The event. */
  readonly event: EconomicEvent;
  /** The matching rule, if one matched. */
  readonly ruleId?: string;
  /** What was wrong. */
  readonly issues: readonly ValidationIssue[];
}

/** Result of {@link mapEvents}. */
export interface MappingResult {
  /** Valid entries, ordered by source position. */
  readonly entries: readonly JournalEntry[];
  /** Valid events that no rule matched, ordered by source position. */
  readonly unmatched: readonly EconomicEvent[];
  /** Invalid events, or rules that produced invalid entries, ordered by source position. */
  readonly failures: readonly MappingFailure[];
}

/**
 * Validates and freezes a rule.
 *
 * @param rule - Rule definition.
 * @throws {@link StellarBooksValidationError} if the ID is invalid or the description is empty.
 */
export function defineRule(rule: MappingRule): MappingRule {
  const issues: ValidationIssue[] = [];
  if (!isKeyToken(rule.id))
    issues.push({
      code: 'RULE_ID_INVALID',
      message: `rule id "${rule.id}" must match [A-Za-z0-9._-]{1,64}`,
    });
  if (rule.description.trim() === '')
    issues.push({
      code: 'RULE_DESCRIPTION_EMPTY',
      message: `rule "${rule.id}" needs a description`,
    });
  if (issues.length > 0) throw new StellarBooksValidationError('invalid rule', issues);
  return Object.freeze({ ...rule });
}

/**
 * Validates and freezes a rule set.
 *
 * @param ruleSet - Rule set definition.
 * @throws {@link StellarBooksValidationError} for invalid IDs, an invalid version or duplicate rule IDs.
 */
export function createRuleSet(ruleSet: RuleSet): RuleSet {
  const issues: ValidationIssue[] = [];
  if (!isKeyToken(ruleSet.id))
    issues.push({ code: 'RULESET_ID_INVALID', message: `rule set id "${ruleSet.id}" is invalid` });
  if (!isKeyToken(ruleSet.version))
    issues.push({
      code: 'RULESET_VERSION_INVALID',
      message: `version "${ruleSet.version}" is invalid`,
    });
  const seen = new Set<string>();
  for (const rule of ruleSet.rules) {
    if (seen.has(rule.id))
      issues.push({ code: 'RULE_ID_DUPLICATE', message: `duplicate rule id "${rule.id}"` });
    seen.add(rule.id);
  }
  if (issues.length > 0) throw new StellarBooksValidationError('invalid rule set', issues);
  return Object.freeze({ ...ruleSet, rules: Object.freeze(ruleSet.rules.map(defineRule)) });
}

/**
 * Returns a new rule set whose rules are `rules` followed by the base set's rules. Use it to
 * override template behaviour with custom rules that take priority.
 *
 * @param base - Rule set to extend.
 * @param extension - New ID and version, plus the rules to place first.
 */
export function extendRuleSet(
  base: RuleSet,
  extension: {
    readonly id: string;
    readonly version: string;
    readonly rules: readonly MappingRule[];
  },
): RuleSet {
  return createRuleSet({
    id: extension.id,
    version: extension.version,
    rules: [...extension.rules, ...base.rules],
  });
}

function eventMeta(event: EconomicEvent): Record<string, string> {
  const meta: Record<string, string> = { eventKind: event.kind, wallet: event.wallet };
  if ('via' in event) meta['via'] = event.via;
  if ('action' in event) meta['escrowAction'] = event.action;
  if (event.muxedId !== undefined) meta['muxedId'] = event.muxedId;
  if (event.memo !== undefined) {
    meta['memoType'] = event.memo.type;
    meta['memo'] = event.memo.value;
  }
  if (event.kind === 'transfer' && event.counterpartyMuxedId !== undefined)
    meta['counterpartyMuxedId'] = event.counterpartyMuxedId;
  if (event.kind === 'unclassified_change') meta['unclassifiedReason'] = event.reason;
  return meta;
}

/**
 * Maps economic events to journal entries using the first matching rule for each event.
 * Each event is validated first, and each produced entry is validated against the chart.
 *
 * @param events - Events, in any order.
 * @param ruleSet - Rules to apply.
 * @param context - Chart and tracked wallets.
 */
export function mapEvents(
  events: Iterable<EconomicEvent>,
  ruleSet: RuleSet,
  context: MappingContext,
): MappingResult {
  const sorted = [...events].sort((a, b) => compareSourcePositions(a.source, b.source));
  const entries: JournalEntry[] = [];
  const unmatched: EconomicEvent[] = [];
  const failures: MappingFailure[] = [];
  const seenPostingKeys = new Set<string>();
  for (const event of sorted) {
    const eventIssues = validateEvent(event);
    if (eventIssues.length > 0) {
      failures.push({ event, issues: eventIssues });
      continue;
    }
    let rule: MappingRule | undefined;
    let entry: JournalEntry;
    try {
      rule = ruleSet.rules.find((r) => r.matches(event, context));
      if (rule === undefined) {
        unmatched.push(event);
        continue;
      }
      const sourceKey = chainSourceKey(event.source, rule.id);
      entry = {
        postingKey: postingKey(sourceKey, ruleSet.version),
        sourceKey,
        date: event.closeTime,
        description: rule.describe?.(event) ?? rule.description,
        lines: rule.lines(event, context),
        source: event.source,
        ruleId: rule.id,
        ruleSetVersion: ruleSet.version,
        meta: eventMeta(event),
      };
    } catch (error: unknown) {
      // A rule threw. Report it as a failure for this event instead of aborting the whole batch.
      const issues: readonly ValidationIssue[] =
        error instanceof StellarBooksValidationError
          ? error.issues
          : [
              {
                code: 'RULE_THREW',
                message: error instanceof Error ? error.message : String(error),
              },
            ];
      failures.push(rule === undefined ? { event, issues } : { event, ruleId: rule.id, issues });
      continue;
    }
    const entryIssues = validateEntry(entry, context.chart);
    if (seenPostingKeys.has(entry.postingKey)) {
      entryIssues.push({
        code: 'ENTRY_KEY_DUPLICATE',
        message: `posting key ${entry.postingKey} was already produced in this batch; source positions must be unique`,
        path: 'postingKey',
      });
    }
    if (entryIssues.length > 0) {
      failures.push({ event, ruleId: rule.id, issues: entryIssues });
      continue;
    }
    seenPostingKeys.add(entry.postingKey);
    entries.push(entry);
  }
  return { entries, unmatched, failures };
}
