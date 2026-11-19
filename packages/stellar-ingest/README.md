# @stellarbooks/stellar-ingest

Classifies normalized ledger records into economic events for StellarBooks.

## Ledger metadata inspection

`inspectLedgerHeader(metadata)` accepts raw Base64 close metadata or its SDK-decoded form and
returns the ledger sequence, close time, hash, protocol version, and transaction result hashes
in apply order. The RPC adapter checks the returned sequence and header fields before
normalization. Raw RPC transaction-to-event decoding is still in progress.

`matchLedgerTransactions(metadata, networkPassphrase)` joins envelopes with their processing
metadata in apply order. Supply the originating network's passphrase. Missing results, missing
envelopes and duplicate hashes raise errors.

`decodeNativePayment(metadata, network, networkPassphrase, index)` verifies one
successful unmuxed XLM payment and its fee against V4 metadata. It returns only
the selected transaction. See the [offline example](../../examples/raw-payment.mjs).

The RPC source pins open-ended scans to the first response's tip and reports an empty
page before the target ledger as a missing range.
See [Q-034](../../docs/OPEN-QUESTIONS.md).

Licensed under MIT. See [LICENSE](../../LICENSE).
