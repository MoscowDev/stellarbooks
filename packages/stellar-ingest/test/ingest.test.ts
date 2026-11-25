import { readFileSync } from 'node:fs';
import { Networks, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { freelancerTemplate, mapEvents } from '@stellarbooks/core';
import { SYNTHETIC_CASES } from '../../../fixtures/data/synthetic-cases.js';
import {
  decodeNativePayment,
  extractEvents,
  extractLedgerCloseMetaRecord,
  FixtureLedgerSource,
  inspectLedgerHeader,
  matchLedgerTransactions,
  normalizeAsset,
} from '../src/index.js';

it('posts independently specified payment and fee lines from the captured XDR', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('../../../fixtures/data/testnet-ledger.json', import.meta.url), 'utf8'),
  ) as { ledger: { metadataXdr: string } };
  const metadata = fixture.ledger.metadataXdr;
  const payment = decodeNativePayment(metadata, 'testnet', Networks.TESTNET, 6);
  const trackedWallets = new Set(['GDXLZDZE6MZ2VRUZALNXXDYVFOES7DUIOOVLGRYGXK7EVIBXTXRYRQFG']);
  const { chart, ruleSet } = freelancerTemplate();
  const { entries, failures, unmatched } = mapEvents(
    extractEvents(payment, trackedWallets),
    ruleSet,
    {
      chart,
      trackedWallets,
    },
  );
  expect(failures).toEqual([]);
  expect(unmatched).toEqual([]);
  expect(
    entries.map(({ lines }) => lines.map(({ account, amount }) => [account, amount.units])),
  ).toEqual([
    [
      ['6900', 100n],
      ['1100', -100n],
    ],
    [
      ['6100', 10000000n],
      ['1100', -10000000n],
    ],
  ]);
  expect(() => decodeNativePayment(metadata, 'testnet', Networks.TESTNET, 1)).toThrow(
    'Expected a successful single native payment',
  );
});

it('rejects unknown assets and missing charged fees in normalized data', () => {
  expect(() => normalizeAsset(undefined)).toThrow('Unrecognized asset');
  expect(() =>
    extractLedgerCloseMetaRecord('testnet', {
      sequence: 100,
      ledgerCloseTime: '2026-11-18T00:00:00Z',
      transactions: [{ txHash: 'a'.repeat(64) }],
    }),
  ).toThrow('Expected integer minor units');
});

it('rejects raw RPC ledger responses instead of treating them as empty', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('../../../fixtures/data/testnet-ledger.json', import.meta.url), 'utf8'),
  ) as { ledger: { sequence: number; metadataXdr: string; hash: string; ledgerCloseTime: string } };
  expect(fixture.ledger.sequence).toBe(5796891);
  expect(xdr.LedgerCloseMeta.fromXdr(fixture.ledger.metadataXdr, 'base64').type).toBe('v2');
  const header = inspectLedgerHeader(fixture.ledger.metadataXdr);
  expect(header.sequence).toBe(fixture.ledger.sequence);
  expect(header.hash).toBe(fixture.ledger.hash);
  expect(Date.parse(header.closeTime) / 1000).toBe(Number(fixture.ledger.ledgerCloseTime));
  expect(header.protocolVersion).toBe(30);
  expect(header.transactionHashes.length).toBeGreaterThan(0);
  const transactions = matchLedgerTransactions(fixture.ledger.metadataXdr, Networks.TESTNET);
  expect(transactions.map(({ hash }) => hash)).toEqual(header.transactionHashes);
  expect(transactions.map(({ index }) => index)).toEqual(
    header.transactionHashes.map((_, index) => index),
  );
  expect(() => matchLedgerTransactions(fixture.ledger.metadataXdr, Networks.PUBLIC)).toThrow(
    'No transaction envelope matches result',
  );
  expect(() => extractLedgerCloseMetaRecord('testnet', fixture.ledger)).toThrow(
    'Ledger transaction metadata must be decoded before journal ingestion',
  );
});

// Synthetic cases exercise classifier control flow only. Their ledgers are invented and their
// journal expectations come from the mapper, so they do not prove agreement with the chain (Q-035).
describe('stellar-ingest synthetic classifier cases', () => {
  for (const fixture of SYNTHETIC_CASES) {
    it(`classifies synthetic case: ${fixture.id} (${fixture.operationType})`, async () => {
      expect(fixture.provenance).toBe('synthetic');
      const tmpl = freelancerTemplate();
      const source = new FixtureLedgerSource([fixture]);
      const tracked = new Set(fixture.trackedWallets);

      let extractedEvents: ReturnType<typeof extractEvents> = [];
      for await (const ledger of source.ledgers(fixture.ledgerRecord.sequence)) {
        extractedEvents = extractEvents(ledger, tracked);
      }

      // Check extracted events length and kinds
      expect(extractedEvents.length).toBe(fixture.expectedEvents.length);
      for (let i = 0; i < extractedEvents.length; i++) {
        expect(extractedEvents[i]?.kind).toBe(fixture.expectedEvents[i]?.kind);
        expect(extractedEvents[i]?.wallet).toBe(fixture.expectedEvents[i]?.wallet);
      }

      // Map with standard rules and verify balanced entries
      const mapping = mapEvents(extractedEvents, tmpl.ruleSet, {
        chart: tmpl.chart,
        trackedWallets: tracked,
      });

      if (mapping.failures.length > 0) {
        console.error(
          'FAILURES:',
          mapping.failures.map((f) => f.issues),
        );
      }
      expect(mapping.failures).toHaveLength(0);
      expect(mapping.unmatched).toHaveLength(0);
      expect(mapping.entries.length).toBe(fixture.expectedJournal.length);
    });
  }
});
