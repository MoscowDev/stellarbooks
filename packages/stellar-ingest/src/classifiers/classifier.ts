/**
 * Classifies Stellar transactions, operations, and balance deltas into EconomicEvents.
 *
 * @module
 */
import { MuxedAccount } from '@stellar/stellar-sdk';
import { readText, readUnits } from '../deltas/normalized-fields.js';
import {
  amount,
  assetId,
  NATIVE_ASSET,
  type AssetId,
  type EconomicEvent,
  type SourcePosition,
} from '@stellarbooks/core';
import { normalizeAsset } from '../deltas/meta-deltas.js';
import { isTracked, type TrackedSet, type TransactionRecord } from '../types.js';

interface ClassifyContext {
  readonly network: string;
  readonly ledger: number;
  readonly closeTime: string;
  readonly tracked: TrackedSet;
}

/** The muxed ID of an `M...` address as `{ muxedId }`, or nothing for an absent value. */
function muxedIdOf(address: unknown): { muxedId?: string } {
  if (typeof address !== 'string' || !address.startsWith('M')) return {};
  return { muxedId: MuxedAccount.fromAddress(address, '0').id() };
}

/** Deltas of one wallet, limited to one operation when the decoder recorded operation indexes. */
function opDeltas(tx: TransactionRecord, wallet: string, opIndex: number) {
  return tx.deltas.filter(
    (d) => d.wallet === wallet && (d.opIndex === undefined || d.opIndex === opIndex),
  );
}

/**
 * Classifies a single transaction into economic events for tracked wallets.
 */
export function classifyTransaction(tx: TransactionRecord, ctx: ClassifyContext): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const handledDeltaKeys = new Set<string>();

  // 1. Fee handling
  if (isTracked(ctx.tracked, tx.feePayer) && tx.feeCharged > 0n) {
    const feeSource: SourcePosition = {
      network: ctx.network,
      ledger: ctx.ledger,
      txIndex: tx.txIndex,
      txHash: tx.txHash,
      stage: 'fee',
      opIndex: null,
      eventIndex: 0,
    };
    events.push({
      kind: 'fee',
      source: feeSource,
      closeTime: ctx.closeTime,
      wallet: tx.feePayer,
      amount: amount(NATIVE_ASSET, tx.feeCharged),
      ...(tx.memo ? { memo: tx.memo } : {}),
    });
  }

  // If transaction failed, operations did not apply; only the fee was charged
  if (!tx.successful) {
    return events;
  }

  // 2. Soroban smart contract events
  if (tx.contractEvents && tx.contractEvents.length > 0) {
    tx.contractEvents.forEach((ev, evIdx) => {
      const asset = ev.asset ?? assetId({ kind: 'sep41', contract: ev.contractId });
      const qty = amount(asset, ev.amountUnits);
      const source: SourcePosition = {
        network: ctx.network,
        ledger: ctx.ledger,
        txIndex: tx.txIndex,
        txHash: tx.txHash,
        stage: 'operation',
        opIndex: 0,
        eventIndex: 2 * evIdx,
      };

      if (ev.type === 'transfer') {
        if (ev.to && isTracked(ctx.tracked, ev.to)) {
          events.push({
            kind: 'transfer',
            source: { ...source, eventIndex: 2 * evIdx + 1 },
            closeTime: ctx.closeTime,
            wallet: ev.to,
            direction: 'in',
            amount: qty,
            via: 'contract_transfer',
            ...(ev.from ? { counterparty: ev.from } : {}),
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          handledDeltaKeys.add(`${ev.to}:${asset}`);
        }
        if (ev.from && isTracked(ctx.tracked, ev.from)) {
          events.push({
            kind: 'transfer',
            source,
            closeTime: ctx.closeTime,
            wallet: ev.from,
            direction: 'out',
            amount: qty,
            via: 'contract_transfer',
            ...(ev.to ? { counterparty: ev.to } : {}),
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          handledDeltaKeys.add(`${ev.from}:${asset}`);
        }
      } else if (ev.type === 'mint' && ev.to && isTracked(ctx.tracked, ev.to)) {
        events.push({
          kind: 'transfer',
          source,
          closeTime: ctx.closeTime,
          wallet: ev.to,
          direction: 'in',
          amount: qty,
          via: 'contract_mint',
          ...(tx.memo ? { memo: tx.memo } : {}),
        });
        handledDeltaKeys.add(`${ev.to}:${asset}`);
      } else if (ev.type === 'burn' && ev.from && isTracked(ctx.tracked, ev.from)) {
        events.push({
          kind: 'transfer',
          source,
          closeTime: ctx.closeTime,
          wallet: ev.from,
          direction: 'out',
          amount: qty,
          via: 'contract_burn',
          ...(tx.memo ? { memo: tx.memo } : {}),
        });
        handledDeltaKeys.add(`${ev.from}:${asset}`);
      } else if (ev.type === 'clawback' && ev.from && isTracked(ctx.tracked, ev.from)) {
        events.push({
          kind: 'transfer',
          source,
          closeTime: ctx.closeTime,
          wallet: ev.from,
          direction: 'out',
          amount: qty,
          via: 'contract_clawback',
          ...(tx.memo ? { memo: tx.memo } : {}),
        });
        handledDeltaKeys.add(`${ev.from}:${asset}`);
      }
    });
  }

  // 3. Classic operations
  tx.operations.forEach((op) => {
    const opSource: SourcePosition = {
      network: ctx.network,
      ledger: ctx.ledger,
      txIndex: tx.txIndex,
      txHash: tx.txHash,
      stage: 'operation',
      opIndex: op.index,
      eventIndex: 0,
    };
    // The sender and receiver sides of one transfer are separate facts with fixed indexes, so
    // both can be posted when both wallets are tracked (ADR-0010).
    const receiverSource: SourcePosition = { ...opSource, eventIndex: 1 };
    const detail = op.detail ?? {};

    switch (op.type) {
      case 'payment': {
        const dest = readText(detail['destination'] ?? '');
        const src = op.sourceAccount ?? tx.feePayer;
        const rawAsset = detail['asset'] ?? 'native';
        const opAsset = normalizeAsset(rawAsset);
        const units = readUnits(detail['amount'] ?? '0');

        if (isTracked(ctx.tracked, dest)) {
          events.push({
            kind: 'transfer',
            source: receiverSource,
            closeTime: ctx.closeTime,
            wallet: dest,
            ...muxedIdOf(detail['destinationMuxed']),
            direction: 'in',
            amount: amount(opAsset, units),
            counterparty: src,
            via: 'payment',
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          handledDeltaKeys.add(`${dest}:${opAsset}`);
        }
        if (isTracked(ctx.tracked, src)) {
          events.push({
            kind: 'transfer',
            source: opSource,
            closeTime: ctx.closeTime,
            wallet: src,
            ...muxedIdOf(detail['sourceMuxed']),
            direction: 'out',
            amount: amount(opAsset, units),
            counterparty: dest,
            via: 'payment',
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          handledDeltaKeys.add(`${src}:${opAsset}`);
        }
        break;
      }

      case 'path_payment_strict_send':
      case 'path_payment_strict_receive': {
        const src = op.sourceAccount ?? tx.feePayer;
        if (isTracked(ctx.tracked, src)) {
          const walletDeltas = opDeltas(tx, src, op.index);
          const givenDeltas = walletDeltas.filter((d) => d.deltaUnits < 0n);
          const recDeltas = walletDeltas.filter((d) => d.deltaUnits > 0n);

          if (givenDeltas.length > 0 && recDeltas.length > 0) {
            const givenAmounts = givenDeltas.map((d) => amount(d.asset, -d.deltaUnits));
            const recAmounts = recDeltas.map((d) => amount(d.asset, d.deltaUnits));

            events.push({
              kind: 'exchange',
              source: opSource,
              closeTime: ctx.closeTime,
              wallet: src,
              given: givenAmounts,
              received: recAmounts,
              via: 'path_payment',
              ...(tx.memo ? { memo: tx.memo } : {}),
            });
            walletDeltas.forEach((d) => handledDeltaKeys.add(`${d.wallet}:${d.asset}`));
          }
        }
        break;
      }

      case 'create_account': {
        const dest = readText(detail['destination'] ?? '');
        const src = op.sourceAccount ?? tx.feePayer;
        const units = readUnits(detail['startingBalance'] ?? detail['amount'] ?? '0');
        // Sponsored accounts can start with 0 XLM; no value moves, so no transfer is booked.
        if (units === 0n) break;

        if (isTracked(ctx.tracked, dest)) {
          events.push({
            kind: 'transfer',
            source: receiverSource,
            closeTime: ctx.closeTime,
            wallet: dest,
            direction: 'in',
            amount: amount(NATIVE_ASSET, units),
            counterparty: src,
            via: 'create_account',
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          handledDeltaKeys.add(`${dest}:${NATIVE_ASSET}`);
        }
        if (isTracked(ctx.tracked, src)) {
          events.push({
            kind: 'transfer',
            source: opSource,
            closeTime: ctx.closeTime,
            wallet: src,
            direction: 'out',
            amount: amount(NATIVE_ASSET, units),
            counterparty: dest,
            via: 'create_account',
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          handledDeltaKeys.add(`${src}:${NATIVE_ASSET}`);
        }
        break;
      }

      case 'account_merge': {
        const dest = readText(detail['destination'] ?? '');
        const src = op.sourceAccount ?? tx.feePayer;
        const destDelta = opDeltas(tx, dest, op.index).find((d) => d.asset === NATIVE_ASSET);
        const units = destDelta ? destDelta.deltaUnits : 0n;
        // Merging an account that holds no XLM moves no value.
        if (units <= 0n) break;

        if (isTracked(ctx.tracked, dest)) {
          events.push({
            kind: 'transfer',
            source: receiverSource,
            closeTime: ctx.closeTime,
            wallet: dest,
            direction: 'in',
            amount: amount(NATIVE_ASSET, units),
            counterparty: src,
            via: 'account_merge',
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          handledDeltaKeys.add(`${dest}:${NATIVE_ASSET}`);
        }
        if (isTracked(ctx.tracked, src)) {
          events.push({
            kind: 'transfer',
            source: opSource,
            closeTime: ctx.closeTime,
            wallet: src,
            direction: 'out',
            amount: amount(NATIVE_ASSET, units),
            counterparty: dest,
            via: 'account_merge',
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          handledDeltaKeys.add(`${src}:${NATIVE_ASSET}`);
        }
        break;
      }

      case 'create_claimable_balance': {
        const src = op.sourceAccount ?? tx.feePayer;
        const balanceId = readText(detail['balanceId'] ?? '');
        const rawAsset = detail['asset'] ?? 'native';
        const opAsset = normalizeAsset(rawAsset);
        const units = readUnits(detail['amount'] ?? '0');

        if (isTracked(ctx.tracked, src)) {
          events.push({
            kind: 'escrow',
            source: opSource,
            closeTime: ctx.closeTime,
            wallet: src,
            action: 'lock',
            amount: amount(opAsset, units),
            balanceId,
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          handledDeltaKeys.add(`${src}:${opAsset}`);
        }
        break;
      }

      case 'claim_claimable_balance': {
        // A ClaimableBalanceEntry does not record its creator, so a stateless classifier cannot
        // tell a creator's `reclaim` from a `release` to someone else (Q-042). No escrow event is
        // emitted here; the claimant's balance change falls through to `unclassified_change`
        // (suspense) until claims are resolved against the book's own `lock` by balance ID.
        break;
      }

      case 'liquidity_pool_deposit': {
        const src = op.sourceAccount ?? tx.feePayer;
        if (isTracked(ctx.tracked, src)) {
          const walletDeltas = opDeltas(tx, src, op.index);
          const given = walletDeltas
            .filter((d) => d.deltaUnits < 0n)
            .map((d) => amount(d.asset, -d.deltaUnits));
          const received = walletDeltas
            .filter((d) => d.deltaUnits > 0n)
            .map((d) => amount(d.asset, d.deltaUnits));

          events.push({
            kind: 'exchange',
            source: opSource,
            closeTime: ctx.closeTime,
            wallet: src,
            given,
            received,
            via: 'liquidity_pool_deposit',
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          walletDeltas.forEach((d) => handledDeltaKeys.add(`${d.wallet}:${d.asset}`));
        }
        break;
      }

      case 'liquidity_pool_withdraw': {
        const src = op.sourceAccount ?? tx.feePayer;
        if (isTracked(ctx.tracked, src)) {
          const walletDeltas = opDeltas(tx, src, op.index);
          const given = walletDeltas
            .filter((d) => d.deltaUnits < 0n)
            .map((d) => amount(d.asset, -d.deltaUnits));
          const received = walletDeltas
            .filter((d) => d.deltaUnits > 0n)
            .map((d) => amount(d.asset, d.deltaUnits));

          events.push({
            kind: 'exchange',
            source: opSource,
            closeTime: ctx.closeTime,
            wallet: src,
            given,
            received,
            via: 'liquidity_pool_withdraw',
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          walletDeltas.forEach((d) => handledDeltaKeys.add(`${d.wallet}:${d.asset}`));
        }
        break;
      }

      case 'clawback': {
        const from = readText(detail['from'] ?? '');
        const issuer = op.sourceAccount ?? tx.feePayer;
        const rawAsset = detail['asset'] ?? 'native';
        const opAsset = normalizeAsset(rawAsset);
        const units = readUnits(detail['amount'] ?? '0');

        if (isTracked(ctx.tracked, from)) {
          events.push({
            kind: 'transfer',
            source: opSource,
            closeTime: ctx.closeTime,
            wallet: from,
            direction: 'out',
            amount: amount(opAsset, units),
            counterparty: issuer,
            via: 'clawback',
            ...(tx.memo ? { memo: tx.memo } : {}),
          });
          handledDeltaKeys.add(`${from}:${opAsset}`);
        }
        break;
      }

      default:
        break;
    }
  });

  // 4. Unexplained balance changes on tracked wallets go to suspense (ADR-0008)
  const unclassified = (wallet: string, asset: AssetId, units: bigint, reason: string): void => {
    events.push({
      kind: 'unclassified_change',
      source: {
        network: ctx.network,
        ledger: ctx.ledger,
        txIndex: tx.txIndex,
        txHash: tx.txHash,
        stage: 'operation',
        opIndex: 0,
        eventIndex: events.length,
      },
      closeTime: ctx.closeTime,
      wallet,
      delta: amount(asset, units),
      reason,
      ...(tx.memo ? { memo: tx.memo } : {}),
    });
  };

  if (tx.deltasComplete === true) {
    // Deltas list every non-fee balance change, so compare amounts: whatever the events do not
    // explain, per wallet and asset, is posted as a residual.
    const residual = new Map<string, { wallet: string; asset: AssetId; units: bigint }>();
    const add = (wallet: string, asset: AssetId, units: bigint): void => {
      const key = `${wallet}:${asset}`;
      const row = residual.get(key) ?? { wallet, asset, units: 0n };
      residual.set(key, { ...row, units: row.units + units });
    };
    for (const d of tx.deltas) {
      if (isTracked(ctx.tracked, d.wallet)) add(d.wallet, d.asset, d.deltaUnits);
    }
    for (const e of events) {
      if (e.kind === 'transfer') {
        add(e.wallet, e.amount.asset, e.direction === 'in' ? -e.amount.units : e.amount.units);
      } else if (e.kind === 'exchange') {
        for (const a of e.given) add(e.wallet, a.asset, a.units);
        for (const a of e.received) add(e.wallet, a.asset, -a.units);
      } else if (e.kind === 'escrow' && (e.action === 'lock' || e.action === 'reclaim')) {
        add(e.wallet, e.amount.asset, e.action === 'lock' ? e.amount.units : -e.amount.units);
      }
    }
    for (const row of [...residual.values()].sort((a, b) =>
      a.wallet === b.wallet ? (a.asset < b.asset ? -1 : 1) : a.wallet < b.wallet ? -1 : 1,
    )) {
      if (row.units !== 0n) {
        unclassified(
          row.wallet,
          row.asset,
          row.units,
          'On-chain balance change not explained by a classified operation',
        );
      }
    }
    return events;
  }

  // Normalized input without complete deltas: report deltas whose wallet and asset no event
  // touched. A native delta equal to the charged fee on the fee payer is treated as the fee.
  tx.deltas.forEach((d) => {
    if (!isTracked(ctx.tracked, d.wallet)) return;
    if (d.asset === NATIVE_ASSET && d.wallet === tx.feePayer && d.deltaUnits === -tx.feeCharged) {
      return;
    }
    if (!handledDeltaKeys.has(`${d.wallet}:${d.asset}`)) {
      unclassified(
        d.wallet,
        d.asset,
        d.deltaUnits,
        d.reason ?? 'Unclassified on-chain balance delta',
      );
    }
  });

  return events;
}
