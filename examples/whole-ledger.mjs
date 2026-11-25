// Books three wallets' activity from a whole captured testnet ledger, offline.
//
//   pnpm run build && node examples/whole-ledger.mjs
//
// Ledger 5796891 was captured from the public testnet RPC (fixtures/README.md). The same
// pipeline reads live ledgers when `RpcLedgerSource` replaces the file read below.
import { readFileSync } from 'node:fs';
import { computeBalances, freelancerTemplate, mapEvents } from '../packages/core/dist/index.js';
import { toCsv, trialBalance } from '../packages/reports/dist/index.js';
import { decodeLedger, extractEvents } from '../packages/stellar-ingest/dist/index.js';

const TESTNET = 'Test SDF Network ; September 2015';
const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/data/testnet-ledger.json', import.meta.url), 'utf8'),
);

// 1. Decode every transaction in the ledger.
const ledger = decodeLedger(fixture.ledger.metadataXdr, 'testnet', TESTNET);

// 2. Classify the activity of the wallets you track.
const tracked = new Set([
  'GDXLZDZE6MZ2VRUZALNXXDYVFOES7DUIOOVLGRYGXK7EVIBXTXRYRQFG', // sends an XLM payment
  'GAUAZT3ONH7S66SXB6HLFFV47RSK5SXYB5R3OTHQWR6RJNS4LC7VNTTH', // swaps XLM for USDC
  'GBTQA6F4QWMC4IK7L4NO5H57J336NM7UB4GGZEZTGSGKWPX2DYVPBRY6', // calls a Soroban contract
]);
const events = extractEvents(ledger, tracked);

// 3. Map events to balanced journal entries with a built-in template.
const { chart, ruleSet } = freelancerTemplate();
const { entries, unmatched, failures } = mapEvents(events, ruleSet, {
  chart,
  trackedWallets: tracked,
});
if (unmatched.length > 0 || failures.length > 0) throw new Error('Mapping failed');

// 4. Report. Every wallet balance change in the journal equals its change on chain.
const kinds = {};
for (const event of events) kinds[event.kind] = (kinds[event.kind] ?? 0) + 1;
console.log(
  `Ledger ${String(ledger.sequence)}: ${String(ledger.transactions.length)} transactions, ` +
    `${String(events.length)} events for ${String(tracked.size)} wallets, ` +
    `${String(entries.length)} journal entries`,
);
console.log('Events by kind:', kinds);
console.log('\nTrial balance (minor units):');
process.stdout.write(toCsv(trialBalance(entries), ['account', 'asset', 'debit', 'credit']));

const onChain = new Map();
for (const tx of ledger.transactions) {
  const add = (key, units) => onChain.set(key, (onChain.get(key) ?? 0n) + units);
  if (tracked.has(tx.feePayer)) add(`${tx.feePayer} native`, -tx.feeCharged);
  for (const d of tx.deltas) if (tracked.has(d.wallet)) add(`${d.wallet} ${d.asset}`, d.deltaUnits);
}
const booked = computeBalances(entries, { byWallet: true }).filter(
  (row) => row.account === chart.system.wallets,
);
const matched =
  booked.length === onChain.size &&
  booked.every((row) => onChain.get(`${row.wallet} ${row.asset}`) === row.units);
console.log(`\nJournal wallet balances match on-chain changes: ${String(matched)}`);
if (!matched) process.exitCode = 1;
