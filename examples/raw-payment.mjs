import { readFileSync } from 'node:fs';
import {
  amount,
  defineRule,
  extendRuleSet,
  freelancerTemplate,
  mapEvents,
  NATIVE_ASSET,
  negate,
  reconcileBalances,
} from '../packages/core/dist/index.js';
import { toJson, trialBalance } from '../packages/reports/dist/index.js';
import { decodeNativePayment, extractEvents } from '../packages/stellar-ingest/dist/index.js';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/data/testnet-ledger.json', import.meta.url), 'utf8'),
);
const ledger = decodeNativePayment(
  fixture.ledger.metadataXdr,
  'testnet',
  'Test SDF Network ; September 2015',
  6,
);
const [transaction] = ledger.transactions;
const wallet = transaction.feePayer;
const trackedWallets = new Set([wallet]);
const { chart, ruleSet } = freelancerTemplate();
const rules = process.argv.includes('--custom-rule')
  ? extendRuleSet(ruleSet, {
      id: 'example-books',
      version: 'example-1',
      rules: [
        defineRule({
          id: 'supplier-payment',
          description: 'Payment to the example supplier',
          matches: (event) =>
            event.kind === 'transfer' &&
            event.direction === 'out' &&
            event.counterparty === 'GC22XZWWC4ILTDFSUQIZLMU2I2MCZY2GW2ZONOQEAAXDLGZTI6LNSHOZ',
          lines: (event) =>
            event.kind === 'transfer'
              ? [
                  { account: '6100', amount: event.amount, note: 'Supplier payment' },
                  {
                    account: chart.system.wallets,
                    wallet: event.wallet,
                    amount: negate(event.amount),
                  },
                ]
              : [],
        }),
      ],
    })
  : ruleSet;
const mapped = mapEvents(extractEvents(ledger, trackedWallets), rules, { chart, trackedWallets });
if (mapped.failures.length || mapped.unmatched.length || mapped.entries.length !== 2) {
  throw new Error('Expected a balanced payment and fee');
}
const opening = {
  postingKey: 'manual/example-opening',
  sourceKey: 'manual/example-opening',
  date: '2026-11-17T00:00:00Z',
  description: 'Synthetic opening balance',
  lines: [
    { account: chart.system.wallets, wallet, amount: amount(NATIVE_ASSET, 20000000n) },
    { account: '3000', amount: amount(NATIVE_ASSET, -20000000n) },
  ],
};
const entries = [opening, ...mapped.entries];
const reconciliation = reconcileBalances(entries, chart.system.wallets, {
  network: ledger.network,
  ledger: ledger.sequence,
  closeTime: ledger.ledgerCloseTime,
  source: 'Synthetic balance for a single selected transaction',
  balances: [{ wallet, asset: NATIVE_ASSET, units: 9999900n }],
});
if (!reconciliation.matched) throw new Error('Offline reconciliation failed');
console.log(
  toJson({
    transactionHash: transaction.txHash,
    entries,
    trialBalance: trialBalance(entries),
    reconciliation,
  }),
);
