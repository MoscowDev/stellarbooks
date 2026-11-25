import { readFileSync } from 'node:fs';
import { Networks } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { amount, assetId, freelancerTemplate, mapEvents, NATIVE_ASSET } from '@stellarbooks/core';
import {
  classifyTransaction,
  decodeLedger,
  inspectLedgerHeader,
  type LedgerCloseMetaRecord,
  type TransactionRecord,
} from '../src/index.js';

// Unmodified public testnet ledgers captured on 2026-11-25 by tools/fixture-gen (capture.js).
// Expected values were read from each ledger and, where possible, cross-checked between the
// operation body and the ledger-entry changes in the same XDR.
interface Captured {
  readonly txIndex: number;
  readonly txHash: string;
  readonly ledger: { hash: string; sequence: number; metadataXdr: string };
}

function load(name: string): {
  file: Captured;
  ledger: LedgerCloseMetaRecord;
  tx: TransactionRecord;
} {
  const file = JSON.parse(
    readFileSync(new URL(`../../../fixtures/data/captured/${name}.json`, import.meta.url), 'utf8'),
  ) as Captured;
  const ledger = decodeLedger(file.ledger.metadataXdr, 'testnet', Networks.TESTNET);
  const tx = ledger.transactions[file.txIndex];
  if (tx === undefined) throw new Error(`Missing transaction ${String(file.txIndex)}`);
  return { file, ledger, tx };
}

function classify(ledger: LedgerCloseMetaRecord, tx: TransactionRecord, tracked: string[]) {
  return classifyTransaction(tx, {
    network: 'testnet',
    ledger: ledger.sequence,
    closeTime: ledger.ledgerCloseTime,
    tracked: new Set(tracked),
  });
}

const USDC = assetId({
  kind: 'classic',
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
});

describe('captured testnet ledgers', () => {
  it.each([
    'claimable_balance-5919620',
    'clawback-5918543',
    'clawback_claimable_balance-5918066',
    'liquidity_pool_deposit-5918402',
    'muxed_payment-5917783',
    'path_payment_strict_receive-5919962',
    'path_payment_strict_send_to_other-5919253',
    'trustline_removal-5919140',
  ])('%s decodes completely and matches its header', (name) => {
    const { file, ledger, tx } = load(name);
    const header = inspectLedgerHeader(file.ledger.metadataXdr);
    expect(header.hash).toBe(file.ledger.hash);
    expect(ledger.transactions.map((t) => t.txHash)).toEqual(header.transactionHashes);
    expect(tx.txHash).toBe(file.txHash);
    expect(tx.successful).toBe(true);
  });

  it('keeps muxed IDs and the issued asset of a payment to a muxed address', () => {
    const { ledger, tx } = load('muxed_payment-5917783');
    const asset = assetId({
      kind: 'classic',
      code: 'USDC',
      issuer: 'GCZC3VUBR5SJSBTC5LNOBCL6YXEHORPVN3NWYT4MSBTJJ25VYM2X66YU',
    });
    const sender = 'GATL3BX27JDZZLJOSKLRA4ACM5ZLOS4HID5HUUEHEFQSSY23ZPHPF53U';
    const receiver = 'GAI6RTDRFHNIJ2UQQNS4H4HLE2JRDATZHEY5A5OSL2YP3VHDBS7NV774';
    expect(tx.operations[0]?.detail).toEqual({
      destination: receiver,
      destinationMuxed: 'MAI6RTDRFHNIJ2UQQNS4H4HLE2JRDATZHEY5A5OSL2YP3VHDBS7NUAAAAAAAOVA26JFMW',
      asset,
      amount: 65_069_200_000n,
    });
    expect(tx.deltas).toEqual([
      { wallet: sender, asset, deltaUnits: -65_069_200_000n, opIndex: 0 },
      { wallet: receiver, asset, deltaUnits: 65_069_200_000n, opIndex: 0 },
    ]);
    const events = classify(ledger, tx, [sender, receiver]);
    expect(events).toEqual([
      expect.objectContaining({ wallet: receiver, direction: 'in', muxedId: '122952434' }),
      expect.objectContaining({
        wallet: sender,
        direction: 'out',
        counterparty: receiver,
        counterpartyMuxedId: '122952434',
      }),
    ]);
    const { chart, ruleSet } = freelancerTemplate();
    const mapped = mapEvents(events, ruleSet, {
      chart,
      trackedWallets: new Set([sender, receiver]),
    });
    expect(mapped.failures).toEqual([]);
    expect(
      mapped.entries.map((e) => e.meta?.['muxedId'] ?? e.meta?.['counterpartyMuxedId']),
    ).toEqual(['122952434', '122952434']);
  });

  it('books a clawback out of the holder for the clawed amount', () => {
    const { ledger, tx } = load('clawback-5918543');
    const holder = 'GABNZS22YH5K4KESLEYUV3XL2SA7KX6OF543NN3AGG5NYTAZ3QACY5FI';
    const asset = assetId({
      kind: 'classic',
      code: 'CDRY',
      issuer: 'GCGGSHMK4QIHLUQFG57DEUOMWYIREKR3PIEWWJYZLPNFLSGWGSUHXZ7J',
    });
    expect(tx.memo).toEqual({ type: 'text', value: 'CDRY:CLAWBACK:KYC' });
    expect(tx.operations[0]?.detail).toMatchObject({ from: holder, amount: 402_600_000n });
    expect(tx.deltas).toEqual([{ wallet: holder, asset, deltaUnits: -402_600_000n, opIndex: 0 }]);
    expect(classify(ledger, tx, [holder])).toEqual([
      expect.objectContaining({
        kind: 'transfer',
        direction: 'out',
        via: 'clawback',
        amount: amount(asset, 402_600_000n),
      }),
    ]);
  });

  it('locks a created claimable balance and sends an unmatched claim to suspense', () => {
    const { ledger } = load('claimable_balance-5919620');
    const create = ledger.transactions[1];
    const claim = ledger.transactions[7];
    if (create === undefined || claim === undefined) throw new Error('Missing transactions');
    const creator = 'GDES54WTI6UAVS6HQGRAFQTJ3KGC6YNO7HYO7ZZEYD6ANBPKPKA67H4L';
    const claimant = 'GDKYN3E5DRQA37SE72FVIIXCKIS3N4AWHI65UQIYUOMWWQOGOBIDXSBJ';
    expect(classify(ledger, create, [creator])).toEqual([
      expect.objectContaining({ kind: 'fee', amount: amount(NATIVE_ASSET, 100n) }),
      expect.objectContaining({
        kind: 'escrow',
        action: 'lock',
        amount: amount(USDC, 5_000_000n),
        balanceId: '00000000e5dd7372b8c9dec7093074063ebd938d5ba71ca59c49ac2f1bb3b427e008050f',
      }),
    ]);
    // The claimant is not the fee payer here, so only the claimed USDC reaches suspense (Q-042).
    expect(claim.feePayer).not.toBe(claimant);
    expect(classify(ledger, claim, [claimant])).toEqual([
      expect.objectContaining({ kind: 'unclassified_change', delta: amount(USDC, 5_000_000n) }),
    ]);
  });

  it('derives the amount sent by a strict-receive path payment from metadata (Q-021)', () => {
    const { ledger, tx } = load('path_payment_strict_receive-5919962');
    const trader = 'GCRIXGN4BD4FWYTQZBUR2HAMZKSL6A3IKTSOCZW3MC5IXONWP5JKJAP3';
    const detail = tx.operations[1]?.detail ?? {};
    expect(detail['destAmount']).toBe(31_300_000n);
    expect(tx.deltas).toEqual([
      { wallet: trader, asset: NATIVE_ASSET, deltaUnits: -47_938_184n, opIndex: 1 },
      { wallet: trader, asset: USDC, deltaUnits: 31_300_000n, opIndex: 1 },
    ]);
    expect(47_938_184n).toBeLessThanOrEqual(detail['sendMax'] as bigint);
    expect(classify(ledger, tx, [trader])).toEqual([
      expect.objectContaining({ kind: 'fee' }),
      expect.objectContaining({
        kind: 'exchange',
        given: [amount(NATIVE_ASSET, 47_938_184n)],
        received: [amount(USDC, 31_300_000n)],
      }),
    ]);
  });

  it('sends both legs of a path payment to another account to suspense', () => {
    const { ledger, tx } = load('path_payment_strict_send_to_other-5919253');
    const sender = 'GDQHUVPSX4O4LTOMENICUUQ2X2UEP5PLCH5JYCWPO2FPJL4FYLJLLN5R';
    const receiver = 'GBRVJFXHDJ23AKQVXAQLAFJWJKC42U6SSXQNPE5ORNF6DNUKNZICOICB';
    expect(tx.operations[0]?.detail).toMatchObject({
      destination: receiver,
      sendAmount: 10_000_000n,
    });
    expect(classify(ledger, tx, [sender, receiver]).map((e) => e.kind)).toEqual([
      'fee',
      'unclassified_change',
      'unclassified_change',
    ]);
  });

  it('books a pool deposit as an exchange for pool shares', () => {
    const { ledger, tx } = load('liquidity_pool_deposit-5918402');
    const depositor = 'GAX3FETKU76GGFEXRUJGZRNOBYX4BDB4KBGVMMH2KB2EOKFGFJNDYX2X';
    const shares = assetId({
      kind: 'pool',
      poolId: 'bd3a1e474373851d397e32fd12ae591f4f5eaf41b261f60ff1a063037419b20e',
    });
    // Only XLM leaves the depositor's balances. The other pool asset shows no trustline change,
    // which is consistent with the depositor issuing it (Q-031).
    expect(classify(ledger, tx, [depositor])).toEqual([
      expect.objectContaining({ kind: 'fee' }),
      expect.objectContaining({
        kind: 'exchange',
        via: 'liquidity_pool_deposit',
        given: [amount(NATIVE_ASSET, 2_000_000_000n)],
        received: [amount(shares, 2_000_000_000n)],
      }),
    ]);
  });

  it('reports no balance change for a trustline removal or a claimable-balance clawback', () => {
    expect(load('trustline_removal-5919140').tx.deltas).toEqual([]);
    const clawback = load('clawback_claimable_balance-5918066').tx;
    expect(clawback.operations.map((o) => o.type)).toEqual(['clawback_claimable_balance']);
    expect(clawback.deltas).toEqual([]);
  });
});
