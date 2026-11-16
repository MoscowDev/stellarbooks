# ADR-0005: Balance per asset, with explicit conversion (trading) accounts

- Status: Accepted
- Approved: 2026-11-16 (maintainer approved PLAN.md with defaults)
- Date: 2026-11-16

## Context
- **How plain-text accounting tools balance:** hledger, Beancount and Ledger require each transaction
  to sum to zero in each commodity (docs/research/accounting.md).
- **Exchanges:** swaps and path payments exchange one asset for another. Selinger-style trading
  accounts (hledger "equity:conversion") keep each commodity balanced, and they let FX or valuation
  gains be computed in a reporting currency later.

## Decision
- **Per-asset balancing:** a journal entry is valid only if, for every asset, the sum of its line
  amounts is zero. Debits are positive and credits negative, using a signed representation internally.
- **Exchanges** post to a `Conversion` account, one line per asset leg. For example, a path payment
  that sends 10 XLM and receives 1 USDC posts:
  - −10 XLM from Assets:Wallet and +10 XLM to Conversion
  - +1 USDC to Assets:Wallet and −1 USDC to Conversion
- **Valuation** in a reporting currency is a separate, optional layer. It uses a pluggable
  `PriceSource` and records rate provenance (source, timestamp, ledger, raw quote). Valuation never
  changes the native-unit journal.
- **Policy choices belong to the user:** cost-basis method and crypto-measurement policy (IFRS/IAS 38
  vs ASU 2023-08 fair value) are out of the default library behaviour.

## Consequences
- The journal is objective and reproducible from chain data alone.
- Reports in a single reporting currency need a price source.
