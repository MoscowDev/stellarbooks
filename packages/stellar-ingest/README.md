# @stellarbooks/stellar-ingest

Decodes Stellar ledger close metadata and classifies it into economic events for StellarBooks.

## Reading ledgers

```ts
import { Networks } from '@stellar/stellar-sdk';
import { RpcLedgerSource, extractEvents } from '@stellarbooks/stellar-ingest';

const source = new RpcLedgerSource({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  network: 'testnet',
  networkPassphrase: Networks.TESTNET,
});
for await (const ledger of source.ledgers(start, end)) {
  const events = extractEvents(ledger, new Set(['G...your wallet']));
}
```

`RpcLedgerSource` checks the server's network passphrase, reads contiguous ledgers with
`getLedgers`, and rejects gaps, ranges beyond the RPC tip, and RPC fields that disagree with the
close metadata. Plain RPC keeps only recent history; see [ADR-0003](../../docs/adr/0003-ingestion-source.md).

`decodeLedger(metadata, network, networkPassphrase)` decodes every transaction in one ledger: fee
payer (outer source for fee-bumps), `feeCharged`, success, memo, operations with details, and the
balance deltas of every account and trustline. It checks that the fee payer's fee changes net to
exactly `-feeCharged`. See [STELLAR-MAPPING.md](../../docs/STELLAR-MAPPING.md).

`classifyTransaction` and `extractEvents` turn records into events for tracked wallets. Changes the
classifier cannot explain, such as Soroban token movements and offer fills, become
`unclassified_change` events for the suspense account. They are never dropped.

## Lower-level helpers

- `inspectLedgerHeader(metadata)` returns the sequence, close time, hash, protocol version and
  transaction result hashes in apply order.
- `matchLedgerTransactions(metadata, networkPassphrase)` joins envelopes with their results in apply
  order and rejects missing or duplicate entries.
- `decodeNativePayment(...)` is the earlier single-payment decoder used by the
  [offline example](../../examples/raw-payment.mjs).

## Limits

Soroban contract events, offer fills, path payments to other accounts and claimable-balance claims
are not classified yet; their balance changes go to suspense. See
[ACCOUNTING-RULES.md](../../docs/ACCOUNTING-RULES.md) and [Q-034](../../docs/OPEN-QUESTIONS.md).

## Testing against testnet

Set `STELLARBOOKS_TESTNET_RPC_URL` to run `test/rpc-source.testnet.test.ts`, which reads recent
public ledgers (20 by default, or `STELLARBOOKS_TESTNET_LEDGERS`). It uses no keys. CI runs it on a
schedule (`.github/workflows/testnet.yml`).

Licensed under MIT. See [LICENSE](../../LICENSE).
