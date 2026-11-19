import {
  amount,
  canonicalEntryJson,
  freelancerTemplate,
  mapEvents,
  NATIVE_ASSET,
  reconcileBalances,
  type JournalEntry,
} from '@stellarbooks/core';
import { toJson, trialBalance } from '@stellarbooks/reports';
import { extractEvents, type LedgerCloseMetaRecord } from '@stellarbooks/stellar-ingest';

export function runPaymentDemo(mismatch: boolean): { output: string; matched: boolean } {
  const wallet = 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';
  const recipient = 'GCO2IP3MJNUOKS45KWBHI2YK2FCGW2EK7EB6KSKGOWIC3G3SDOXX6ABE';
  const trackedWallets = new Set([wallet]);
  const { chart, ruleSet } = freelancerTemplate();
  const ledger: LedgerCloseMetaRecord = {
    network: 'offline-demo',
    sequence: 100,
    ledgerCloseTime: '2026-11-18T00:00:00Z',
    transactions: [
      {
        txHash: 'a'.repeat(64),
        txIndex: 0,
        feeBump: false,
        feePayer: wallet,
        feeCharged: 100n,
        successful: true,
        operations: [
          {
            index: 0,
            type: 'payment',
            sourceAccount: wallet,
            detail: { destination: recipient, asset: NATIVE_ASSET, amount: 3000000n },
          },
        ],
        deltas: [
          { wallet, asset: NATIVE_ASSET, deltaUnits: -3000000n },
          { wallet: recipient, asset: NATIVE_ASSET, deltaUnits: 3000000n },
        ],
      },
    ],
  };
  const context = { chart, trackedWallets };
  const mapped = mapEvents(extractEvents(ledger, trackedWallets), ruleSet, context);
  const replay = mapEvents(extractEvents(ledger, trackedWallets), ruleSet, context);
  if (mapped.failures.length || mapped.unmatched.length || mapped.entries.length !== 2) {
    throw new Error('Expected one payment and one fee entry');
  }
  const deterministic =
    toJson(mapped.entries.map(canonicalEntryJson)) ===
    toJson(replay.entries.map(canonicalEntryJson));
  if (!deterministic) throw new Error('Replay output differs');

  const opening: JournalEntry = {
    postingKey: 'manual/demo-opening',
    sourceKey: 'manual/demo-opening',
    date: '2026-11-17T00:00:00Z',
    description: 'Synthetic opening balance',
    lines: [
      { account: chart.system.wallets, wallet, amount: amount(NATIVE_ASSET, 10000000n) },
      { account: '3000', amount: amount(NATIVE_ASSET, -10000000n) },
    ],
  };
  const entries = [opening, ...mapped.entries];
  const reconciliation = reconcileBalances(entries, chart.system.wallets, {
    network: ledger.network,
    ledger: ledger.sequence,
    closeTime: ledger.ledgerCloseTime,
    source: 'synthetic fixture',
    balances: [{ wallet, asset: NATIVE_ASSET, units: mismatch ? 6999899n : 6999900n }],
  });
  return {
    output: toJson({ entries, deterministic, trialBalance: trialBalance(entries), reconciliation }),
    matched: reconciliation.matched,
  };
}
