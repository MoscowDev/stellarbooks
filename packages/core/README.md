# @stellarbooks/core

Pure domain logic for StellarBooks, with no I/O and no runtime dependencies:

- exact amounts (`bigint` minor units) and canonical asset IDs
- chart of accounts with validated system accounts
- normalized economic events
- journal entries that balance per asset, with canonical serialization
- deterministic source and posting keys
- reversing entries
- configurable mapping rules and built-in templates (freelancer, merchant, payroll)
- balance aggregation

**Status:** M1 complete. The package is not yet published.

```ts
import { freelancerTemplate, mapEvents, computeBalances } from '@stellarbooks/core';

const { chart, ruleSet } = freelancerTemplate();
const { entries, unmatched, failures } = mapEvents(events, ruleSet, {
  chart,
  trackedWallets: new Set(['G...']),
});
const balances = computeBalances(entries, { byWallet: true });
```

`events` normally come from `@stellarbooks/stellar-ingest` (milestone M3).

See [docs/DOMAIN-MODEL.md](../../docs/DOMAIN-MODEL.md) and
[docs/ACCOUNTING-RULES.md](../../docs/ACCOUNTING-RULES.md). The templates are starting points, not
accounting or tax advice.

Licensed under MIT. See [LICENSE](../../LICENSE).
