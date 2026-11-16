/**
 * Normalized economic events: what happened to a tracked wallet, independent of how Stellar
 * encoded it. `@stellarbooks/stellar-ingest` produces them from ledger data (ADR-0008), and
 * mapping rules turn them into journal entries.
 *
 * Every event concerns exactly one tracked wallet (`wallet`). A payment between two tracked
 * wallets produces two events, one per side.
 *
 * @module
 */
import { isCounterpartyAddress, isAccountAddress } from './address.js';
import type { Amount } from './amount.js';
import { isAssetId } from './asset.js';
import type { ValidationIssue } from './errors.js';
import { validateSourcePosition, type SourcePosition } from './source.js';

/** A transaction memo. Values are kept as strings so that uint64 IDs are exact. */
export type Memo =
  | {
      /** Text memo, up to 28 bytes. */
      readonly type: 'text';
      /** Memo text as decoded by the extractor. */
      readonly value: string;
    }
  | {
      /** ID memo (uint64). */
      readonly type: 'id';
      /** Decimal string of the uint64 value. */
      readonly value: string;
    }
  | {
      /** Hash or return-hash memo. */
      readonly type: 'hash' | 'return';
      /** 64 lowercase hex characters. */
      readonly value: string;
    };

/** Fields shared by all economic events. */
export interface EconomicEventBase {
  /** Where the event came from. */
  readonly source: SourcePosition;
  /** Ledger close time, ISO 8601 UTC, for example `2026-11-16T10:00:00Z` (fractional seconds allowed). */
  readonly closeTime: string;
  /** The tracked wallet (`G...`) this event concerns. */
  readonly wallet: string;
  /** Muxed sub-account ID of the wallet side, if a muxed address was used (decimal uint64 string). */
  readonly muxedId?: string;
  /** Transaction memo, if any. */
  readonly memo?: Memo;
}

/** Network fee charged to the wallet (the fee-paying account, the outer one for fee-bumps). */
export interface FeeEvent extends EconomicEventBase {
  /** Discriminator. */
  readonly kind: 'fee';
  /** Fee charged, positive, in the native asset. */
  readonly amount: Amount;
}

/** Refund of part of a previously charged fee (Soroban refundable resource fee). */
export interface FeeRefundEvent extends EconomicEventBase {
  /** Discriminator. */
  readonly kind: 'fee_refund';
  /** Amount refunded, positive, in the native asset. */
  readonly amount: Amount;
}

/** How a transfer happened on chain. */
export type TransferVia =
  | 'payment'
  | 'path_payment'
  | 'create_account'
  | 'account_merge'
  | 'claimable_balance'
  | 'clawback'
  | 'contract_transfer'
  | 'contract_mint'
  | 'contract_burn'
  | 'contract_clawback';

/** All {@link TransferVia} values. */
export const TRANSFER_VIAS: readonly TransferVia[] = [
  'payment',
  'path_payment',
  'create_account',
  'account_merge',
  'claimable_balance',
  'clawback',
  'contract_transfer',
  'contract_mint',
  'contract_burn',
  'contract_clawback',
];

/** Value moving into or out of the wallet, in a single asset. */
export interface TransferEvent extends EconomicEventBase {
  /** Discriminator. */
  readonly kind: 'transfer';
  /** `in` if the wallet received value, `out` if it sent value. */
  readonly direction: 'in' | 'out';
  /** Quantity moved, positive. */
  readonly amount: Amount;
  /** The other party's base address (`G...` or `C...`), when there is one. Mints and burns may have none. */
  readonly counterparty?: string;
  /** Muxed ID of the other party, if it used a muxed address (decimal uint64 string). */
  readonly counterpartyMuxedId?: string;
  /** Mechanism. */
  readonly via: TransferVia;
}

/** How an exchange happened on chain. */
export type ExchangeVia =
  'path_payment' | 'offer' | 'liquidity_pool_deposit' | 'liquidity_pool_withdraw';

/** All {@link ExchangeVia} values. */
export const EXCHANGE_VIAS: readonly ExchangeVia[] = [
  'path_payment',
  'offer',
  'liquidity_pool_deposit',
  'liquidity_pool_withdraw',
];

/**
 * The wallet gave some assets and received others: a trade, the conversion leg of a path payment,
 * or a liquidity pool deposit or withdrawal (pool shares are an asset).
 */
export interface ExchangeEvent extends EconomicEventBase {
  /** Discriminator. */
  readonly kind: 'exchange';
  /** Amounts that left the wallet, positive, one per asset. */
  readonly given: readonly Amount[];
  /** Amounts that entered the wallet, positive, one per asset. */
  readonly received: readonly Amount[];
  /** Mechanism. */
  readonly via: ExchangeVia;
}

/**
 * Claimable balance lifecycle for balances **created by the tracked wallet**:
 * - `lock`: wallet funds moved into a new claimable balance.
 * - `reclaim`: the wallet claimed its own balance back.
 * - `release`: another account claimed it, so the value left the books.
 * - `clawed_back`: the issuer clawed it back.
 */
export type EscrowAction = 'lock' | 'reclaim' | 'release' | 'clawed_back';

/** All {@link EscrowAction} values. */
export const ESCROW_ACTIONS: readonly EscrowAction[] = [
  'lock',
  'reclaim',
  'release',
  'clawed_back',
];

/** A change to value held in a claimable balance created by the wallet. */
export interface EscrowEvent extends EconomicEventBase {
  /** Discriminator. */
  readonly kind: 'escrow';
  /** What happened. */
  readonly action: EscrowAction;
  /** Quantity, positive. */
  readonly amount: Amount;
  /** Claimable balance ID as lowercase hex. */
  readonly balanceId: string;
  /** For `release`: the claimant. For `clawed_back`: the issuer. */
  readonly counterparty?: string;
}

/**
 * A balance change on a tracked wallet that no extractor rule explains. It is posted to suspense
 * for review and never dropped (ADR-0008, Q-016).
 */
export interface UnclassifiedChangeEvent extends EconomicEventBase {
  /** Discriminator. */
  readonly kind: 'unclassified_change';
  /** Signed change in the wallet balance. */
  readonly delta: Amount;
  /** Why the extractor could not classify the change. */
  readonly reason: string;
}

/** Any normalized economic event. */
export type EconomicEvent =
  FeeEvent | FeeRefundEvent | TransferEvent | ExchangeEvent | EscrowEvent | UnclassifiedChangeEvent;

/** All {@link EconomicEvent} `kind` values. */
export const ECONOMIC_EVENT_KINDS: readonly EconomicEvent['kind'][] = [
  'fee',
  'fee_refund',
  'transfer',
  'exchange',
  'escrow',
  'unclassified_change',
];

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const HEX_RE = /^[0-9a-f]+$/;
const UINT64_MAX = 2n ** 64n - 1n;

/**
 * Returns true if `value` is an ISO 8601 UTC timestamp in the form used by StellarBooks
 * (`YYYY-MM-DDTHH:mm:ss[.fraction]Z`) and denotes a real date.
 *
 * @param value - Candidate timestamp.
 */
export function isUtcTimestamp(value: string): boolean {
  return ISO_UTC_RE.test(value) && !Number.isNaN(Date.parse(value));
}

function checkPositive(issues: ValidationIssue[], value: Amount, path: string): void {
  if (!isAssetId(value.asset))
    issues.push({
      code: 'EVENT_ASSET_INVALID',
      message: `invalid asset "${String(value.asset)}"`,
      path: `${path}.asset`,
    });
  if (value.units <= 0n)
    issues.push({
      code: 'EVENT_AMOUNT_NOT_POSITIVE',
      message: 'amount must be positive',
      path: `${path}.units`,
    });
}

function isUint64String(value: string): boolean {
  return /^\d{1,20}$/.test(value) && BigInt(value) <= UINT64_MAX;
}

/**
 * Validates an economic event's structure and invariants.
 *
 * @param event - Event to check.
 * @param path - Path prefix used in issue locations.
 * @returns Every issue found (empty if valid).
 */
export function validateEvent(event: EconomicEvent, path = 'event'): ValidationIssue[] {
  const issues = validateSourcePosition(event.source, `${path}.source`);
  if (!isUtcTimestamp(event.closeTime)) {
    issues.push({
      code: 'EVENT_TIME_INVALID',
      message: `closeTime "${event.closeTime}" is not ISO 8601 UTC`,
      path: `${path}.closeTime`,
    });
  }
  if (!isAccountAddress(event.wallet)) {
    issues.push({
      code: 'EVENT_WALLET_INVALID',
      message: 'wallet must be a G... address',
      path: `${path}.wallet`,
    });
  }
  if (event.muxedId !== undefined && !isUint64String(event.muxedId)) {
    issues.push({
      code: 'EVENT_MUXED_ID_INVALID',
      message: 'muxedId must be a decimal uint64',
      path: `${path}.muxedId`,
    });
  }
  if (event.memo !== undefined) {
    const m = event.memo;
    const ok =
      m.type === 'text'
        ? true
        : m.type === 'id'
          ? isUint64String(m.value)
          : m.value.length === 64 && HEX_RE.test(m.value);
    if (!ok)
      issues.push({
        code: 'EVENT_MEMO_INVALID',
        message: `invalid ${m.type} memo`,
        path: `${path}.memo`,
      });
  }
  const checkCounterparty = (cp: string | undefined): void => {
    if (cp !== undefined && !isCounterpartyAddress(cp)) {
      issues.push({
        code: 'EVENT_COUNTERPARTY_INVALID',
        message: `invalid counterparty "${cp}"`,
        path: `${path}.counterparty`,
      });
    }
  };
  switch (event.kind) {
    case 'fee':
    case 'fee_refund':
      checkPositive(issues, event.amount, `${path}.amount`);
      if (event.amount.asset !== 'native') {
        issues.push({
          code: 'EVENT_FEE_NOT_NATIVE',
          message: 'fees are paid in the native asset',
          path: `${path}.amount.asset`,
        });
      }
      break;
    case 'transfer':
      checkPositive(issues, event.amount, `${path}.amount`);
      checkCounterparty(event.counterparty);
      if (event.counterpartyMuxedId !== undefined && !isUint64String(event.counterpartyMuxedId)) {
        issues.push({
          code: 'EVENT_MUXED_ID_INVALID',
          message: 'counterpartyMuxedId must be a decimal uint64',
          path: `${path}.counterpartyMuxedId`,
        });
      }
      break;
    case 'exchange': {
      if (event.given.length === 0 || event.received.length === 0) {
        issues.push({
          code: 'EVENT_EXCHANGE_EMPTY',
          message: 'an exchange needs given and received amounts',
          path,
        });
      }
      event.given.forEach((a, i) => {
        checkPositive(issues, a, `${path}.given[${i}]`);
      });
      event.received.forEach((a, i) => {
        checkPositive(issues, a, `${path}.received[${i}]`);
      });
      const givenAssets = event.given.map((a) => a.asset);
      const receivedAssets = event.received.map((a) => a.asset);
      if (
        new Set(givenAssets).size !== givenAssets.length ||
        new Set(receivedAssets).size !== receivedAssets.length
      ) {
        issues.push({
          code: 'EVENT_EXCHANGE_DUPLICATE_ASSET',
          message: 'each asset may appear once per side',
          path,
        });
      }
      break;
    }
    case 'escrow':
      checkPositive(issues, event.amount, `${path}.amount`);
      checkCounterparty(event.counterparty);
      if (!HEX_RE.test(event.balanceId)) {
        issues.push({
          code: 'EVENT_BALANCE_ID_INVALID',
          message: 'balanceId must be lowercase hex',
          path: `${path}.balanceId`,
        });
      }
      break;
    case 'unclassified_change':
      if (!isAssetId(event.delta.asset))
        issues.push({
          code: 'EVENT_ASSET_INVALID',
          message: 'invalid asset',
          path: `${path}.delta.asset`,
        });
      if (event.delta.units === 0n)
        issues.push({
          code: 'EVENT_DELTA_ZERO',
          message: 'delta must not be zero',
          path: `${path}.delta.units`,
        });
      if (event.reason.trim() === '')
        issues.push({
          code: 'EVENT_REASON_EMPTY',
          message: 'reason must not be empty',
          path: `${path}.reason`,
        });
      break;
  }
  return issues;
}
