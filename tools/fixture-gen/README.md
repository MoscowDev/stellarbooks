# Fixture tools (`@stellarbooks/fixture-gen`)

Dev-only tools for StellarBooks test fixtures. Not published.

## Capture real ledgers (`capture.js`)

Scans recent public testnet ledgers through Stellar RPC and saves, for each target operation shape,
the smallest ledger that contains it in a successful transaction. Ledgers are saved unmodified
(header and metadata XDR, hash, sequence, close time, capture time, and the target transaction).
It creates no keys and submits nothing. It refuses any network other than testnet.

```sh
pnpm --filter @stellarbooks/fixture-gen run build
node tools/fixture-gen/dist/capture.js fixtures/data/captured 3000 muxed_payment,clawback
```

Arguments: output directory, number of recent ledgers to scan (default 2000), and an optional
comma-separated list of targets (default: all). Targets are listed in `TARGETS` in
`src/capture.ts`. Plain RPC keeps only recent history (ADR-0003), so rare operations may need a
wider scan or a later run.

After capturing, add exact assertions to `packages/stellar-ingest/test/captured.test.ts`. Check
amounts against a second source in the same XDR (operation body against ledger-entry changes).

## Probe (`generate.js`)

Connects to testnet and prints the latest ledger. Creating throwaway Friendbot accounts and
submitting transactions (Q-019) is not implemented; capture from live traffic covers most needs
without keys (issue 34).
