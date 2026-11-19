# Stellar Mapping

How Stellar data is turned into `EconomicEvent`s: which XDR fields are read, and how amounts,
counterparties, memos and muxed IDs are found.

The captured native-payment example has a real ledger fixture and exact journal
assertions. The remaining classic and Soroban sections describe the design and
pending verification.

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

## Captured native payment example

The offline example reads ledger 5796891, apply index 6. It verifies the envelope
amount against the sender and recipient account changes and verifies the charged fee
against pre-application fee metadata. The decoder accepts a single successful
unmuxed XLM payment with V4 metadata and no memo or post-application fee changes.
Its output covers only the selected transaction.
