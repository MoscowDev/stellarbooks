/**
 * Classifies Stellar transactions, operations, and balance deltas into EconomicEvents.
 *
 * @module
 */
import { readText, readUnits } from '../deltas/normalized-fields.js';
import {
  amount,
  assetId,
  NATIVE_ASSET,
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
        eventIndex: evIdx,
      };

      if (ev.type === 'transfer') {
        if (ev.to && isTracked(ctx.tracked, ev.to)) {
          events.push({
            kind: 'transfer',
            source,
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
            source: opSource,
            closeTime: ctx.closeTime,
            wallet: dest,
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
          const walletDeltas = tx.deltas.filter((d) => d.wallet === src);
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

        if (isTracked(ctx.tracked, dest)) {
          events.push({
            kind: 'transfer',
            source: opSource,
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
        const destDelta = tx.deltas.find((d) => d.wallet === dest && d.asset === NATIVE_ASSET);
        const units = destDelta ? destDelta.deltaUnits : 0n;

        if (isTracked(ctx.tracked, dest)) {
          events.push({
            kind: 'transfer',
            source: opSource,
            closeTime: ctx.closeTime,
            wallet: dest,
            direction: 'in',
            amount: amount(NATIVE_ASSET, units > 0n ? units : 0n),
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
            amount: amount(NATIVE_ASSET, units > 0n ? units : 0n),
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
        const claimant = op.sourceAccount ?? tx.feePayer;
        const balanceId = readText(detail['balanceId'] ?? '');
        const rawAsset = detail['asset'] ?? 'native';
        const opAsset = normalizeAsset(rawAsset);
        const units = readUnits(detail['amount'] ?? '0');

        if (typeof ctx.tracked === 'object' && 'has' in ctx.tracked) {
          for (const w of ctx.tracked) {
            if (w !== claimant) {
              events.push({
                kind: 'escrow',
                source: opSource,
                closeTime: ctx.closeTime,
                wallet: w,
                action: 'release',
                amount: amount(opAsset, units),
                balanceId,
                counterparty: claimant,
                ...(tx.memo ? { memo: tx.memo } : {}),
              });
            }
          }
        }
        break;
      }

      case 'liquidity_pool_deposit': {
        const src = op.sourceAccount ?? tx.feePayer;
        if (isTracked(ctx.tracked, src)) {
          const walletDeltas = tx.deltas.filter((d) => d.wallet === src);
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
          const walletDeltas = tx.deltas.filter((d) => d.wallet === src);
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

  // 4. Any remaining unclassified balance deltas on tracked wallets (ADR-0008)
  tx.deltas.forEach((d) => {
    if (isTracked(ctx.tracked, d.wallet)) {
      const key = `${d.wallet}:${d.asset}`;
      if (d.asset === NATIVE_ASSET && d.wallet === tx.feePayer && d.deltaUnits === -tx.feeCharged) {
        return;
      }
      if (!handledDeltaKeys.has(key)) {
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
          wallet: d.wallet,
          delta: amount(d.asset, d.deltaUnits),
          reason: d.reason ?? 'Unclassified on-chain balance delta',
          ...(tx.memo ? { memo: tx.memo } : {}),
        });
      }
    }
  });

  return events;
}
