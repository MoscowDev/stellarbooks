import { describe, expect, it } from 'vitest';
import { amount, NATIVE_ASSET, type JournalEntry } from '@stellarbooks/core';
import { createInMemoryRepository } from '../src/index.js';

describe('storage-postgres in-memory repository', () => {
  const sampleEntry: JournalEntry = {
    postingKey: 'chain/testnet/100/1111/operation/0/0/fee@1',
    sourceKey: 'chain/testnet/100/1111/operation/0/0/fee',
    date: '2026-11-17T12:00:00Z',
    description: 'Test fee entry',
    lines: [
      { account: '6900', amount: amount(NATIVE_ASSET, 100n) },
      {
        account: '1100',
        amount: amount(NATIVE_ASSET, -100n),
        wallet: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
      },
    ],
  };

  it('posts entries and reports counts', async () => {
    const repo = createInMemoryRepository();
    const result = await repo.postEntries(1, [sampleEntry]);

    expect(result.posted).toBe(1);
    expect(result.duplicates).toBe(0);

    const fetched = await repo.getEntries(1);
    expect(fetched).toHaveLength(1);
    expect(fetched[0]?.postingKey).toBe(sampleEntry.postingKey);
  });

  it('idempotently ignores duplicate entries without error', async () => {
    const repo = createInMemoryRepository();
    await repo.postEntries(1, [sampleEntry]);

    // Post again
    const secondResult = await repo.postEntries(1, [sampleEntry]);
    expect(secondResult.posted).toBe(0);
    expect(secondResult.duplicates).toBe(1);

    const fetched = await repo.getEntries(1);
    expect(fetched).toHaveLength(1);
  });

  it('filters entries by date, account, and wallet', async () => {
    const repo = createInMemoryRepository();
    await repo.postEntries(1, [sampleEntry]);

    const byAccount = await repo.getEntries(1, { accountCode: '6900' });
    expect(byAccount).toHaveLength(1);

    const wrongAccount = await repo.getEntries(1, { accountCode: '9999' });
    expect(wrongAccount).toHaveLength(0);

    const byWallet = await repo.getEntries(1, {
      wallet: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
    });
    expect(byWallet).toHaveLength(1);
  });

  it('tracks checkpoints per book', async () => {
    const repo = createInMemoryRepository();
    expect(await repo.getCheckpoint(1)).toBeNull();

    await repo.setCheckpoint(1, 105);
    expect(await repo.getCheckpoint(1)).toBe(105);
  });

  it('rejects posting into closed periods', async () => {
    const repo = createInMemoryRepository();
    await repo.closePeriod(1, '2026-Q3', '2026-09-30T23:59:59Z');
    await expect(repo.closePeriod(1, '2026-Q3', '2026-09-30T23:59:59Z')).resolves.toBeUndefined();
    await expect(repo.closePeriod(1, '2026-Q3', '2026-10-01T00:00:00Z')).rejects.toThrow(
      'Period name already has a different close cutoff',
    );

    const oldEntry: JournalEntry = {
      ...sampleEntry,
      postingKey: 'chain/testnet/50/old/fee@1',
      sourceKey: 'chain/testnet/50/old/fee',
      date: '2026-08-15T12:00:00Z',
    };

    await expect(repo.postEntries(1, [oldEntry])).rejects.toThrow(
      'Cannot post into closed period "2026-Q3"',
    );
  });

  it('advances the checkpoint atomically and keeps it monotonic on replay', async () => {
    const repo = createInMemoryRepository();
    await repo.closePeriod(1, '2026-Q3', '2026-09-30T23:59:59Z');
    await repo.setCheckpoint(1, 98);
    const oldEntry = { ...sampleEntry, postingKey: 'old', date: '2026-09-30T23:59:59Z' };
    await expect(repo.postEntries(1, [sampleEntry, oldEntry], 100)).rejects.toThrow(
      'Cannot post into closed period',
    );
    expect(await repo.getEntries(1)).toEqual([]);
    expect(await repo.getCheckpoint(1)).toBe(98);

    expect(await repo.postEntries(1, [sampleEntry], 100)).toEqual({ posted: 1, duplicates: 0 });
    expect(await repo.postEntries(1, [sampleEntry], 99)).toEqual({ posted: 0, duplicates: 1 });
    expect(await repo.getEntries(1)).toHaveLength(1);
    expect(await repo.getCheckpoint(1)).toBe(100);
  });
});
