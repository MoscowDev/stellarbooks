import { readFileSync } from 'node:fs';
import { Networks, rpc, xdr } from '@stellar/stellar-sdk';
import { afterEach, expect, it, vi } from 'vitest';
import { RpcLedgerSource, type LedgerCloseMetaRecord } from '../src/index.js';

const fixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/data/testnet-ledger.json', import.meta.url), 'utf8'),
) as {
  ledger: { hash: string; sequence: number; ledgerCloseTime: string; metadataXdr: string };
};

function mockNetwork(passphrase: string = Networks.TESTNET) {
  const response: rpc.Api.GetNetworkResponse = { passphrase, protocolVersion: '25' };
  return vi.spyOn(rpc.Server.prototype, 'getNetwork').mockResolvedValue(response);
}

function source(): RpcLedgerSource {
  return new RpcLedgerSource({
    rpcUrl: 'https://example.invalid',
    network: 'testnet',
    networkPassphrase: Networks.TESTNET,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('rejects a truncated RPC range and a requested end beyond the provider tip', async () => {
  mockNetwork();
  vi.spyOn(rpc.Server.prototype, 'getLedgers').mockResolvedValue({
    ledgers: [],
    latestLedger: 105,
    latestLedgerCloseTime: 0,
    oldestLedger: 90,
    oldestLedgerCloseTime: 0,
    cursor: '',
  });
  await expect(source().ledgers(100)[Symbol.asyncIterator]().next()).rejects.toThrow(
    'Missing ledger 100',
  );
  await expect(source().ledgers(100, 106)[Symbol.asyncIterator]().next()).rejects.toThrow(
    'beyond the RPC tip',
  );
});

it('refuses an RPC server on a different network', async () => {
  mockNetwork(Networks.PUBLIC);
  const getLedgers = vi.spyOn(rpc.Server.prototype, 'getLedgers');
  await expect(source().ledgers(1)[Symbol.asyncIterator]().next()).rejects.toThrow(
    'network passphrase does not match',
  );
  expect(getLedgers).not.toHaveBeenCalled();
});

it('decodes a real ledger served through getLedgers', async () => {
  mockNetwork();
  const { ledger } = fixture;
  vi.spyOn(rpc.Server.prototype, 'getLedgers').mockResolvedValue({
    ledgers: [
      {
        hash: ledger.hash,
        sequence: ledger.sequence,
        ledgerCloseTime: ledger.ledgerCloseTime,
        headerXdr: {} as xdr.LedgerHeaderHistoryEntry,
        metadataXdr: xdr.LedgerCloseMeta.fromXdr(ledger.metadataXdr, 'base64'),
      },
    ],
    latestLedger: ledger.sequence,
    latestLedgerCloseTime: Number(ledger.ledgerCloseTime),
    oldestLedger: ledger.sequence,
    oldestLedgerCloseTime: Number(ledger.ledgerCloseTime),
    cursor: '',
  });
  const records: LedgerCloseMetaRecord[] = [];
  for await (const record of source().ledgers(ledger.sequence, ledger.sequence)) {
    records.push(record);
  }
  expect(records).toHaveLength(1);
  expect(records[0]?.transactions).toHaveLength(25);
  expect(records[0]?.rawMetaXdr).toBe(ledger.metadataXdr);
});
