# Fixture Generator Tool (`@stellarbooks/fixture-gen`)

Dev-only tool to create testnet transactions and capture raw ledger metadata as committed golden fixtures.

Per ADR-0003 and Q-019:

- Uses ephemeral in-memory Friendbot testnet accounts.
- Guarded strictly against testnet network passphrase.
- Excluded from published npm packages.
