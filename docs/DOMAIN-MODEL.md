# Domain Model

> **Status:** skeleton (M0). It will be completed in M1 alongside `packages/core`, and must stay in
> sync with the exported types.

The planned types are summarised in [PLAN.md §4](../PLAN.md#4-data-model):

- `AssetId`
- `Amount`
- `Account` and `ChartOfAccounts`
- `EconomicEvent`
- `MappingRule`
- `JournalEntry` and `JournalLine`
- `PostingKey`
- `Period`
- `ReconciliationReport`

## Invariants (to be enforced in code and tests)

1. Every `JournalEntry` sums to zero per asset.
2. Amounts are `bigint` minor units, and a line amount is never zero.
3. Posted entries are immutable. A reversal references its original and nets to zero against it.
4. `PostingKey` is a pure function of the source position and the rule-set version.
5. Mapping is pure and deterministic.
