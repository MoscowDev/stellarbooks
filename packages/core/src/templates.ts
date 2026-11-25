/**
 * Built-in chart-of-accounts templates with matching default rule sets.
 *
 * The templates are **starting points, not accounting advice**. Account choices such as "incoming
 * payments are income" are policy decisions that you must review for your situation and
 * jurisdiction (docs/research/accounting.md). Override behaviour with
 * {@link extendRuleSet}, or build your own rule set from {@link standardRules}.
 *
 * Every template rule set handles every {@link EconomicEvent} kind (tested), so events never fall
 * through unmapped.
 *
 * @module
 */
import { createChart, type Account, type ChartOfAccounts, type SystemAccounts } from './account.js';
import { negate, type Amount } from './amount.js';
import type { EconomicEvent, TransferEvent } from './events.js';
import type { JournalLine } from './journal.js';
import {
  createRuleSet,
  defineRule,
  type MappingContext,
  type MappingRule,
  type RuleSet,
} from './rules.js';

/** Accounts used by {@link standardRules} in addition to the system accounts. */
export interface StandardPolicy {
  /** Credited when value arrives from an external party (for example income or sales). */
  readonly inflow: string;
  /** Debited when value is sent to an external party (for example an expense). */
  readonly outflow: string;
  /** Debited when value is destroyed: clawbacks, burns, clawed-back claimable balances. */
  readonly writeOff: string;
}

/** A chart of accounts together with the rule set designed for it. */
export interface BookTemplate {
  /** Template name. */
  readonly name: string;
  /** The chart of accounts. */
  readonly chart: ChartOfAccounts;
  /** The default rule set. */
  readonly ruleSet: RuleSet;
}

const DESTRUCTIVE_VIAS = new Set<TransferEvent['via']>([
  'clawback',
  'contract_clawback',
  'contract_burn',
]);

function line(
  account: string,
  value: Amount,
  extra: Omit<JournalLine, 'account' | 'amount'> = {},
): JournalLine {
  return { account, amount: value, ...extra };
}

function walletFields(event: EconomicEvent): { wallet: string } {
  return { wallet: event.wallet };
}

function counterpartyFields(counterparty: string | undefined): { counterparty?: string } {
  return counterparty === undefined ? {} : { counterparty };
}

/** A transfer is internal when the other side is a tracked wallet, including the wallet itself (a self-payment). */
function isInternal(event: TransferEvent, ctx: MappingContext): boolean {
  return (
    event.counterparty !== undefined &&
    (event.counterparty === event.wallet || ctx.trackedWallets.has(event.counterparty))
  );
}

/**
 * Builds the standard rule list:
 * - fees and refunds against `networkFees`
 * - transfers between tracked wallets through `internalTransfers`
 * - other incoming transfers to `policy.inflow`
 * - outgoing transfers to `policy.outflow`
 * - clawbacks and burns to `policy.writeOff`
 * - exchanges through `conversion`
 * - claimable balances through `escrow`
 * - unclassified changes to `suspense`
 *
 * @param system - System accounts of the chart.
 * @param policy - Policy accounts.
 */
export function standardRules(system: SystemAccounts, policy: StandardPolicy): MappingRule[] {
  return [
    defineRule({
      id: 'fee',
      description: 'Network fee',
      matches: (e) => e.kind === 'fee',
      lines: (e) => {
        if (e.kind !== 'fee') return [];
        return [
          line(system.networkFees, e.amount),
          line(system.wallets, negate(e.amount), walletFields(e)),
        ];
      },
    }),
    defineRule({
      id: 'fee-refund',
      description: 'Network fee refund',
      matches: (e) => e.kind === 'fee_refund',
      lines: (e) => {
        if (e.kind !== 'fee_refund') return [];
        return [
          line(system.wallets, e.amount, walletFields(e)),
          line(system.networkFees, negate(e.amount)),
        ];
      },
    }),
    defineRule({
      id: 'transfer-write-off',
      description: 'Asset clawed back or burned',
      matches: (e) => e.kind === 'transfer' && e.direction === 'out' && DESTRUCTIVE_VIAS.has(e.via),
      lines: (e) => {
        if (e.kind !== 'transfer') return [];
        return [
          line(policy.writeOff, e.amount, counterpartyFields(e.counterparty)),
          line(system.wallets, negate(e.amount), {
            ...walletFields(e),
            ...counterpartyFields(e.counterparty),
          }),
        ];
      },
    }),
    defineRule({
      id: 'transfer-internal',
      description: 'Transfer between tracked wallets',
      matches: (e, ctx) => e.kind === 'transfer' && isInternal(e, ctx),
      lines: (e) => {
        if (e.kind !== 'transfer') return [];
        const signed = e.direction === 'in' ? e.amount : negate(e.amount);
        return [
          line(system.wallets, signed, {
            ...walletFields(e),
            ...counterpartyFields(e.counterparty),
          }),
          line(system.internalTransfers, negate(signed), counterpartyFields(e.counterparty)),
        ];
      },
    }),
    defineRule({
      id: 'transfer-in',
      description: 'Incoming transfer from an external party',
      matches: (e) => e.kind === 'transfer' && e.direction === 'in',
      lines: (e) => {
        if (e.kind !== 'transfer') return [];
        return [
          line(system.wallets, e.amount, {
            ...walletFields(e),
            ...counterpartyFields(e.counterparty),
          }),
          line(policy.inflow, negate(e.amount), counterpartyFields(e.counterparty)),
        ];
      },
    }),
    defineRule({
      id: 'transfer-out',
      description: 'Outgoing transfer to an external party',
      matches: (e) => e.kind === 'transfer' && e.direction === 'out',
      lines: (e) => {
        if (e.kind !== 'transfer') return [];
        return [
          line(policy.outflow, e.amount, counterpartyFields(e.counterparty)),
          line(system.wallets, negate(e.amount), {
            ...walletFields(e),
            ...counterpartyFields(e.counterparty),
          }),
        ];
      },
    }),
    defineRule({
      id: 'exchange',
      description: 'Exchange of assets through the conversion account',
      matches: (e) => e.kind === 'exchange',
      lines: (e) => {
        if (e.kind !== 'exchange') return [];
        return [
          ...e.given.flatMap((a) => [
            line(system.wallets, negate(a), walletFields(e)),
            line(system.conversion, a),
          ]),
          ...e.received.flatMap((a) => [
            line(system.wallets, a, walletFields(e)),
            line(system.conversion, negate(a)),
          ]),
        ];
      },
    }),
    defineRule({
      id: 'escrow',
      description: 'Claimable balance created by a tracked wallet',
      matches: (e) => e.kind === 'escrow',
      lines: (e) => {
        if (e.kind !== 'escrow') return [];
        const w = walletFields(e);
        const cp = counterpartyFields(e.counterparty);
        switch (e.action) {
          case 'lock':
            return [line(system.escrow, e.amount, w), line(system.wallets, negate(e.amount), w)];
          case 'reclaim':
            return [line(system.wallets, e.amount, w), line(system.escrow, negate(e.amount), w)];
          case 'release':
            return [
              line(policy.outflow, e.amount, cp),
              line(system.escrow, negate(e.amount), { ...w, ...cp }),
            ];
          case 'clawed_back':
            return [
              line(policy.writeOff, e.amount, cp),
              line(system.escrow, negate(e.amount), { ...w, ...cp }),
            ];
        }
      },
    }),
    defineRule({
      id: 'unclassified',
      description: 'Unexplained balance change (needs review)',
      matches: (e) => e.kind === 'unclassified_change',
      lines: (e) => {
        if (e.kind !== 'unclassified_change') return [];
        return [
          line(system.wallets, e.delta, walletFields(e)),
          line(system.suspense, negate(e.delta)),
        ];
      },
    }),
  ];
}

const COMMON_ACCOUNTS: readonly Account[] = [
  { code: '1000', name: 'Assets', type: 'asset' },
  { code: '1100', name: 'Stellar wallets', type: 'asset', parent: '1000' },
  { code: '1150', name: 'Claimable balances (escrow)', type: 'asset', parent: '1000' },
  { code: '1190', name: 'Internal transfers clearing', type: 'asset', parent: '1000' },
  { code: '2000', name: 'Liabilities', type: 'liability' },
  { code: '2990', name: 'Suspense (needs review)', type: 'liability', parent: '2000' },
  { code: '3000', name: 'Equity', type: 'equity' },
  { code: '3800', name: 'Retained earnings', type: 'equity', parent: '3000' },
  { code: '3900', name: 'Conversion (trading)', type: 'equity', parent: '3000' },
  { code: '4000', name: 'Income', type: 'income' },
  { code: '6000', name: 'Expenses', type: 'expense' },
  { code: '6900', name: 'Network fees', type: 'expense', parent: '6000' },
  { code: '6950', name: 'Asset write-offs (clawback, burn)', type: 'expense', parent: '6000' },
];

const COMMON_SYSTEM: SystemAccounts = {
  wallets: '1100',
  escrow: '1150',
  internalTransfers: '1190',
  suspense: '2990',
  retainedEarnings: '3800',
  conversion: '3900',
  networkFees: '6900',
};

function buildTemplate(
  name: string,
  extra: readonly Account[],
  policy: StandardPolicy,
): BookTemplate {
  const chart = createChart([...COMMON_ACCOUNTS, ...extra], COMMON_SYSTEM);
  const ruleSet = createRuleSet({
    id: name,
    version: '1',
    rules: standardRules(chart.system, policy),
  });
  return Object.freeze({ name, chart, ruleSet });
}

/**
 * Freelancer template:
 * - incoming external transfers → client income (4100)
 * - outgoing transfers → business expenses (6100)
 */
export function freelancerTemplate(): BookTemplate {
  return buildTemplate(
    'freelancer',
    [
      { code: '4100', name: 'Client income', type: 'income', parent: '4000' },
      { code: '6100', name: 'Business expenses', type: 'expense', parent: '6000' },
    ],
    { inflow: '4100', outflow: '6100', writeOff: '6950' },
  );
}

/**
 * Merchant template:
 * - incoming external transfers → sales (4100)
 * - outgoing transfers → supplier payments and refunds (6100)
 *
 * Refunds are booked as expenses by default. Add a custom rule if you need contra-revenue
 * treatment.
 */
export function merchantTemplate(): BookTemplate {
  return buildTemplate(
    'merchant',
    [
      { code: '4100', name: 'Sales', type: 'income', parent: '4000' },
      { code: '6100', name: 'Supplier payments and refunds', type: 'expense', parent: '6000' },
    ],
    { inflow: '4100', outflow: '6100', writeOff: '6950' },
  );
}

/**
 * Payroll template:
 * - incoming external transfers → employer funding (equity, 3100)
 * - outgoing transfers → salaries and wages (6100)
 */
export function payrollTemplate(): BookTemplate {
  return buildTemplate(
    'payroll',
    [
      { code: '3100', name: 'Employer funding', type: 'equity', parent: '3000' },
      { code: '6100', name: 'Salaries and wages', type: 'expense', parent: '6000' },
    ],
    { inflow: '3100', outflow: '6100', writeOff: '6950' },
  );
}
