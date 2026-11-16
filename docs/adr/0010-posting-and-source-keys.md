# ADR-0010: Separate source keys from posting keys

- Status: Accepted (refines the idempotency section of ADR-0006)
- Date: 2026-11-16

## Context

ADR-0006 defined a single `posting_key` that includes the rule-set version and is UNIQUE in
storage. While implementing M1 we found a flaw. When a user upgrades a rule set, for example from
version `1` to `2`, re-ingesting the same ledger produces a *different* posting key for the same
chain fact, so `ON CONFLICT DO NOTHING` would let the fact be posted twice.

ADR-0006 also built the key from a network passphrase *hash*, but `core` cannot hash because it has
no I/O and no crypto dependency (ADR-0002).

## Decision

Every journal entry carries two deterministic keys (`packages/core/src/posting-key.ts`):

| Key | Format | Identifies | Storage rule (M5) |
|---|---|---|---|
| `sourceKey` | `chain/<network>/<ledger>/<txHash>/<stage>/<opIndex or ->/<eventIndex>/<ruleId>` | the chain fact and the rule that mapped it | at most one **active** (not reversed) entry per `sourceKey` |
| `postingKey` | `<sourceKey>@<ruleSetVersion>` | this exact entry | UNIQUE; `ON CONFLICT DO NOTHING`; a replay with differing canonical content is an error |

- **Reversals** have `postingKey = sourceKey = reversal/<postingKey of the reversed entry>`, so an
  entry can be reversed at most once.
- **Manual entries** use `manual/<id>`.
- **Network:** the network is a slug (`[a-z0-9-]{1,32}`, for example `testnet` or `pubnet`) chosen by
  the ingester from the network passphrase, instead of a passphrase hash.
- **Remapping after a rule change** is explicit: reverse the active entry, then post the new
  version's entry. It is never an in-place update.

## Consequences

- Rule upgrades cannot double-post.
- Remapping leaves a full audit trail.
- Storage needs a partial unique index or trigger for the "one active entry per source key" rule.
  It will be designed in M5.
