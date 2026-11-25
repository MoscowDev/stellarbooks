import { Networks, rpc } from '@stellar/stellar-sdk';
import { expect, it } from 'vitest';
import { freelancerTemplate, mapEvents } from '@stellarbooks/core';
import { extractEvents, RpcLedgerSource } from '../src/index.js';

// Opt-in: set STELLARBOOKS_TESTNET_RPC_URL (for example https://soroban-testnet.stellar.org).
// Reads recent public testnet ledgers only. No keys are used.
const RPC_URL = process.env['STELLARBOOKS_TESTNET_RPC_URL'];
const LEDGERS = Number(process.env['STELLARBOOKS_TESTNET_LEDGERS'] ?? 20);

it.skipIf(RPC_URL === undefined)(
  'decodes, classifies and books recent testnet ledgers without loss',
  async () => {
    const url = RPC_URL ?? '';
    const latest = await new rpc.Server(url).getLatestLedger();
    const end = latest.sequence - 2;
    const source = new RpcLedgerSource({
      rpcUrl: url,
      network: 'testnet',
      networkPassphrase: Networks.TESTNET,
    });
    const { chart, ruleSet } = freelancerTemplate();
    const chain = new Map<string, bigint>();
    const books = new Map<string, bigint>();
    const add = (map: Map<string, bigint>, key: string, units: bigint): void => {
      map.set(key, (map.get(key) ?? 0n) + units);
    };
    let ledgers = 0;

    for await (const record of source.ledgers(end - LEDGERS + 1, end)) {
      ledgers += 1;
      // Track every wallet that appears so every classifier path runs on real data.
      const wallets = new Set(
        record.transactions.flatMap((t) => [t.feePayer, ...t.deltas.map((d) => d.wallet)]),
      );
      const mapped = mapEvents(extractEvents(record, wallets), ruleSet, {
        chart,
        trackedWallets: wallets,
      });
      expect(mapped.failures).toEqual([]);
      expect(mapped.unmatched).toEqual([]);
      for (const t of record.transactions) {
        add(chain, `${t.feePayer} native`, -t.feeCharged);
        for (const d of t.deltas) add(chain, `${d.wallet} ${d.asset}`, d.deltaUnits);
      }
      for (const entry of mapped.entries) {
        for (const line of entry.lines) {
          if (line.account === chart.system.wallets) {
            add(books, `${line.wallet ?? ''} ${line.amount.asset}`, line.amount.units);
          }
        }
      }
    }

    expect(ledgers).toBe(LEDGERS);
    // ADR-0008: every on-chain balance change of a tracked wallet reaches the journal.
    const keys = new Set([...chain.keys(), ...books.keys()]);
    const mismatched = [...keys].filter((k) => (chain.get(k) ?? 0n) !== (books.get(k) ?? 0n));
    expect(mismatched).toEqual([]);
  },
  120_000,
);
