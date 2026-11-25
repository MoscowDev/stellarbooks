import { readFileSync } from 'node:fs';
import { Account, MuxedAccount, Networks } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  amount,
  assetId,
  freelancerTemplate,
  mapEvents,
  NATIVE_ASSET,
  type EconomicEvent,
} from '@stellarbooks/core';
import {
  classifyTransaction,
  decodeLedger,
  decodeNativePayment,
  extractEvents,
  inspectLedgerHeader,
  type TransactionRecord,
} from '../src/index.js';

// Public testnet ledger 5796891, captured 2026-11-18 (fixtures/README.md). Every expected value
// below was read from that ledger and is cross-checked against a second source in the same XDR.
const fixture = JSON.parse(
  readFileSync(new URL('../../../fixtures/data/testnet-ledger.json', import.meta.url), 'utf8'),
) as { ledger: { metadataXdr: string } };
const META = fixture.ledger.metadataXdr;
const ledger = decodeLedger(META, 'testnet', Networks.TESTNET);
const tx = (index: number): TransactionRecord => {
  const found = ledger.transactions[index];
  if (found === undefined) throw new Error(`Missing transaction ${String(index)}`);
  return found;
};

const USDC = assetId({
  kind: 'classic',
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
});
const PATH_TRADER = 'GAUAZT3ONH7S66SXB6HLFFV47RSK5SXYB5R3OTHQWR6RJNS4LC7VNTTH';
const FUNDER = 'GAIH3ULLFQ4DGSECF2AR555KZ4KNDGEKN4AFI4SU2M7B43MGK3QJZNSR';
const NEW_ACCOUNT = 'GDG55FOMNLGZVHO7ISZXEZ64PNJFCXV6NUTKUDPOGRAOC2AH2JGTXX25';
const MERGED = 'GBJPBK6PHPZKOL3KLQVG7RNB6NOSASSS6KUPEIMV7VVF6X6LXG3K6WGA';
const MERGE_DEST = 'GABVVTMTYYDWNCSGPGFAK6FA456TZ2MP752WYXWRIXCQJ2BMTNCCXKNJ';
const PAYER = 'GDXLZDZE6MZ2VRUZALNXXDYVFOES7DUIOOVLGRYGXK7EVIBXTXRYRQFG';
const PAYEE = 'GC22XZWWC4ILTDFSUQIZLMU2I2MCZY2GW2ZONOQEAAXDLGZTI6LNSHOZ';
const SOROBAN_USER = 'GBTQA6F4QWMC4IK7L4NO5H57J336NM7UB4GGZEZTGSGKWPX2DYVPBRY6';

describe('decodeLedger on captured testnet ledger 5796891', () => {
  it('decodes every transaction in apply order', () => {
    expect(ledger.sequence).toBe(5796891);
    expect(ledger.ledgerCloseTime).toBe('2026-11-18T13:21:34.000Z');
    expect(ledger.transactions.map((t) => t.txHash)).toEqual(
      inspectLedgerHeader(META).transactionHashes,
    );
    expect(ledger.transactions).toHaveLength(25);
    expect(ledger.transactions.every((t) => t.deltasComplete === true)).toBe(true);
  });

  it('agrees with the single-payment decoder on the captured XLM payment', () => {
    const single = decodeNativePayment(META, 'testnet', Networks.TESTNET, 6).transactions[0];
    const whole = tx(6);
    expect(whole.feePayer).toBe(single?.feePayer);
    expect(whole.feeCharged).toBe(single?.feeCharged);
    expect(
      whole.deltas.map(({ wallet, asset, deltaUnits }) => ({ wallet, asset, deltaUnits })),
    ).toEqual(single?.deltas);
    expect(whole.operations[0]?.detail).toEqual({
      destination: PAYEE,
      asset: NATIVE_ASSET,
      amount: 10_000_000n,
    });
  });

  it('matches operation amounts to metadata balance changes', () => {
    expect(tx(4).operations[0]).toEqual({
      index: 0,
      type: 'create_account',
      sourceAccount: FUNDER,
      detail: { destination: NEW_ACCOUNT, startingBalance: 100_000_000_000n },
    });
    expect(tx(4).feePayer).not.toBe(FUNDER);
    expect(tx(4).deltas).toEqual([
      { wallet: FUNDER, asset: NATIVE_ASSET, deltaUnits: -100_000_000_000n, opIndex: 0 },
      { wallet: NEW_ACCOUNT, asset: NATIVE_ASSET, deltaUnits: 100_000_000_000n, opIndex: 0 },
    ]);
    expect(tx(5).deltas).toEqual([
      { wallet: MERGED, asset: NATIVE_ASSET, deltaUnits: -10_000_000n, opIndex: 0 },
      { wallet: MERGE_DEST, asset: NATIVE_ASSET, deltaUnits: 10_000_000n, opIndex: 0 },
    ]);
    expect(tx(2).deltas).toEqual([
      { wallet: PATH_TRADER, asset: USDC, deltaUnits: 35_768_014n, opIndex: 0 },
      { wallet: PATH_TRADER, asset: NATIVE_ASSET, deltaUnits: -50_000_000n, opIndex: 0 },
    ]);
  });

  it('charges fees on failed transactions without applying their operations', () => {
    for (const index of [1, 3]) {
      expect(tx(index).successful).toBe(false);
      expect(tx(index).feeCharged).toBe(100n);
      expect(tx(index).deltas).toEqual([]);
    }
    expect(tx(1).memo).toEqual({ type: 'id', value: '8649876487544395062' });
  });

  it('attributes a fee-bump fee to the outer fee source', () => {
    expect(tx(9).feeBump).toBe(true);
    expect(tx(9).feePayer).toBe('GBV7JB2GKDTXWYJDFPL23XRFMLURGY62JJSEQITPARUKKMKIQ4ESOFYS');
    expect(tx(9).operations[0]?.sourceAccount).toBe(
      'GAZVISCPFN5C7FIXKMONAPGXWTVCM5K3MZ2QIISGMY2NFKLCGFJ3QWDH',
    );
    expect(tx(9).feeCharged).toBe(41_509n);
  });
});

describe('classification of the decoded ledger', () => {
  const tracked = new Set([PATH_TRADER, NEW_ACCOUNT, MERGE_DEST, PAYER, SOROBAN_USER]);
  const events = extractEvents(ledger, tracked);
  const byWallet = (wallet: string): EconomicEvent[] => events.filter((e) => e.wallet === wallet);

  it('classifies classic operations and fees for tracked wallets', () => {
    expect(byWallet(PATH_TRADER).map((e) => e.kind)).toEqual(['fee', 'exchange']);
    expect(byWallet(PATH_TRADER)[1]).toMatchObject({
      given: [amount(NATIVE_ASSET, 50_000_000n)],
      received: [amount(USDC, 35_768_014n)],
    });
    expect(byWallet(NEW_ACCOUNT)).toEqual([
      expect.objectContaining({
        kind: 'transfer',
        direction: 'in',
        amount: amount(NATIVE_ASSET, 100_000_000_000n),
        counterparty: FUNDER,
        via: 'create_account',
      }),
    ]);
    expect(byWallet(MERGE_DEST).map((e) => e.kind)).toEqual(['fee', 'transfer']);
    expect(byWallet(PAYER).map((e) => e.kind)).toEqual(['fee', 'transfer']);
  });

  it('posts Soroban token movements it cannot classify yet to suspense', () => {
    const soroban = byWallet(SOROBAN_USER);
    expect(soroban.map((e) => e.kind)).toEqual([
      'fee',
      'unclassified_change',
      'unclassified_change',
    ]);
    expect(soroban.filter((e) => e.kind === 'unclassified_change')).toEqual([
      expect.objectContaining({ delta: amount(USDC, 112_607_668n) }),
      expect.objectContaining({ delta: amount(NATIVE_ASSET, -800_000_000n) }),
    ]);
  });

  it('maps every event to balanced entries, with exact lines for the payment', () => {
    const { chart, ruleSet } = freelancerTemplate();
    const result = mapEvents(events, ruleSet, { chart, trackedWallets: tracked });
    expect(result.failures).toEqual([]);
    expect(result.unmatched).toEqual([]);
    const payment = result.entries.filter((e) => e.source?.txHash === tx(6).txHash);
    expect(payment.map((e) => e.lines.map((l) => [l.account, l.amount.units]))).toEqual([
      [
        ['6900', 100n],
        ['1100', -100n],
      ],
      [
        ['6100', 10_000_000n],
        ['1100', -10_000_000n],
      ],
    ]);
  });
});

describe('classifier safeguards', () => {
  const base: TransactionRecord = {
    txHash: 'a'.repeat(64),
    txIndex: 0,
    feeBump: false,
    feePayer: PAYER,
    feeCharged: 100n,
    successful: true,
    operations: [],
    deltas: [],
  };
  const ctx = (tracked: ReadonlySet<string>) => ({
    network: 'testnet',
    ledger: 1,
    closeTime: '2026-11-25T00:00:00Z',
    tracked,
  });

  it('does not book a claimable-balance claim against unrelated tracked wallets', () => {
    const claim: TransactionRecord = {
      ...base,
      feePayer: PAYEE,
      operations: [
        {
          index: 0,
          type: 'claim_claimable_balance',
          sourceAccount: PAYEE,
          detail: { balanceId: '00'.repeat(36) },
        },
      ],
    };
    expect(classifyTransaction(claim, ctx(new Set([PAYER])))).toEqual([]);
  });

  it('records the muxed ID of a tracked wallet addressed through an M address', () => {
    const muxed = new MuxedAccount(new Account(PAYEE, '0'), '42').accountId();
    const payment: TransactionRecord = {
      ...base,
      operations: [
        {
          index: 0,
          type: 'payment',
          sourceAccount: PAYER,
          detail: { destination: PAYEE, destinationMuxed: muxed, asset: NATIVE_ASSET, amount: 7n },
        },
      ],
    };
    expect(classifyTransaction(payment, ctx(new Set([PAYEE, PAYER])))).toEqual([
      expect.objectContaining({ kind: 'fee', wallet: PAYER }),
      expect.objectContaining({
        wallet: PAYEE,
        direction: 'in',
        muxedId: '42',
        counterparty: PAYER,
      }),
      expect.objectContaining({
        wallet: PAYER,
        direction: 'out',
        counterparty: PAYEE,
        counterpartyMuxedId: '42',
      }),
    ]);
  });

  it('posts the unexplained part of a complete delta to suspense', () => {
    const payment: TransactionRecord = {
      ...base,
      deltasComplete: true,
      operations: [
        {
          index: 0,
          type: 'payment',
          sourceAccount: PAYER,
          detail: { destination: PAYEE, asset: NATIVE_ASSET, amount: 10n },
        },
      ],
      deltas: [{ wallet: PAYER, asset: NATIVE_ASSET, deltaUnits: -15n, opIndex: 0 }],
    };
    const events = classifyTransaction(payment, ctx(new Set([PAYER])));
    expect(events.map((e) => e.kind)).toEqual(['fee', 'transfer', 'unclassified_change']);
    expect(events[2]).toMatchObject({ delta: amount(NATIVE_ASSET, -5n) });
  });

  it('is deterministic for the decoded ledger', () => {
    const tracked = new Set([PATH_TRADER, PAYER, SOROBAN_USER]);
    const again = decodeLedger(META, 'testnet', Networks.TESTNET);
    expect(extractEvents(again, tracked)).toEqual(extractEvents(ledger, tracked));
  });
});
