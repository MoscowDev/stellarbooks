/**
 * Pure domain logic for StellarBooks:
 * - exact amounts and asset identity
 * - chart of accounts
 * - normalized economic events
 * - journal entries with per-asset balancing
 * - deterministic posting keys
 * - reversing entries
 * - configurable mapping rules and built-in templates
 * - balance aggregation
 *
 * This package performs no I/O and has no runtime dependencies (ADR-0002).
 *
 * @packageDocumentation
 */
export {
  isAccountAddress,
  isContractAddress,
  isMuxedAddress,
  isCounterpartyAddress,
} from './address.js';
export {
  assetId,
  parseAssetId,
  isAssetId,
  protocolScale,
  NATIVE_ASSET,
  STELLAR_CLASSIC_SCALE,
  type AssetDescriptor,
  type AssetId,
} from './asset.js';
export {
  amount,
  negate,
  formatUnits,
  parseUnits,
  INT64_MAX,
  I128_MAX,
  I128_MIN,
  type Amount,
} from './amount.js';
export {
  createChart,
  validateChart,
  findAccount,
  normalBalance,
  ACCOUNT_TYPES,
  type Account,
  type AccountType,
  type ChartOfAccounts,
  type SystemAccounts,
} from './account.js';
export { StellarBooksValidationError, throwIfIssues, type ValidationIssue } from './errors.js';
export {
  validateEvent,
  isUtcTimestamp,
  ECONOMIC_EVENT_KINDS,
  TRANSFER_VIAS,
  EXCHANGE_VIAS,
  ESCROW_ACTIONS,
  type EconomicEvent,
  type EconomicEventBase,
  type FeeEvent,
  type FeeRefundEvent,
  type TransferEvent,
  type TransferVia,
  type ExchangeEvent,
  type ExchangeVia,
  type EscrowEvent,
  type EscrowAction,
  type UnclassifiedChangeEvent,
  type Memo,
} from './events.js';
export {
  validateEntry,
  assertValidEntry,
  totalsByAsset,
  canonicalEntryJson,
  type JournalEntry,
  type JournalLine,
} from './journal.js';
export {
  chainSourceKey,
  postingKey,
  reversalKey,
  manualSourceKey,
  isKeyToken,
} from './posting-key.js';
export { reverseEntry, type ReverseOptions } from './reversal.js';
export {
  mapEvents,
  defineRule,
  createRuleSet,
  extendRuleSet,
  type MappingContext,
  type MappingRule,
  type RuleSet,
  type MappingResult,
  type MappingFailure,
} from './rules.js';
export {
  standardRules,
  freelancerTemplate,
  merchantTemplate,
  payrollTemplate,
  type BookTemplate,
  type StandardPolicy,
} from './templates.js';
export { computeBalances, type BalanceRow, type BalanceOptions } from './balances.js';
export {
  compareSourcePositions,
  validateSourcePosition,
  type SourcePosition,
  type SourceStage,
} from './source.js';
