# Stellar Mapping

How Stellar data is turned into `EconomicEvent`s: which XDR fields are read, and how amounts,
counterparties, memos and muxed IDs are found.

> **Status:** skeleton (M0). It will be completed in M3 (classic) and M4 (Soroban). Every statement
> must cite official docs (via `docs/research/`) and a golden fixture.

## Sources of truth (ADR-0003, ADR-0008)

1. **Balance deltas:** ledger-entry changes in `TransactionMeta`.
2. **Classification:** operation type and result.
3. **Fees:** `feeCharged` and the fee-processing changes.
4. **Cross-check:** CAP-67 / SAC events, when present.
5. **Non-SAC SEP-41 tokens:** contract events.

## Sections to be written

- Asset identification (native, classic, pool shares, SEP-41)
- Fee and fee-bump attribution, and failed transactions
- Per-operation extraction (see [ACCOUNTING-RULES.md](ACCOUNTING-RULES.md))
- Muxed accounts and memos as counterparty tags
- Sponsorship and reserves as metadata
- Protocol-version differences (P23 fee refunds, SAC event format, P30 XDR)
