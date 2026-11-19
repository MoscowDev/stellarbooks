import { rpc } from '@stellar/stellar-sdk';
import { expect, it, vi } from 'vitest';
import { RpcLedgerSource } from '../src/index.js';

it('rejects a truncated RPC range and a requested end beyond the provider tip', async () => {
  const page = vi.spyOn(rpc.Server.prototype, 'getLedgers').mockResolvedValue({
    ledgers: [],
    latestLedger: 105,
    latestLedgerCloseTime: 0,
    oldestLedger: 90,
    oldestLedgerCloseTime: 0,
    cursor: '',
  });
  try {
    const source = new RpcLedgerSource({ rpcUrl: 'https://example.invalid', network: 'testnet' });
    await expect(source.ledgers(100)[Symbol.asyncIterator]().next()).rejects.toThrow(
      'Missing ledger 100',
    );
    await expect(source.ledgers(100, 106)[Symbol.asyncIterator]().next()).rejects.toThrow(
      'beyond the RPC tip',
    );
  } finally {
    page.mockRestore();
  }
});
