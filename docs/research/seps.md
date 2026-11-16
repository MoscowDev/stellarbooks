# Research: SEPs relevant to memos, muxed accounts and asset identification

Status: evidence only. Statuses are taken from each SEP header and the stellar-protocol ecosystem index, all retrieved 2026-11-16.

## Summary table

| SEP | Title | Status | Version / updated | Relevance |
|---|---|---|---|---|
| SEP-1 | Stellar Info File | Active | 2.7.0 / 2025-01-16 | Asset metadata (decimals, name, anchoring) for both issued assets and contract tokens |
| SEP-11 | Txrep | Active | 1.1.0 / 2021-10-09 | Canonical asset string form (`native`, `CODE:ISSUER`, `<poolid>:lp`) |
| SEP-14 | Dynamic Asset Metadata | Active | 1.0.0 / 2019-03-12 | Metadata server for issuers with many assets |
| SEP-18 | Data Entry Namespaces | Active | (header not fetched) | Namespacing used by SEP-29 `config.memo_required` |
| SEP-23 | Strkeys | Active | 1.4.0 / 2026-09-18 | G/M/C/L/B/W address encodings and validation |
| SEP-29 | Account Memo Requirements | Active | 0.5.0 / 2020-05-04 | Memo-required destinations |
| SEP-35 | Operation IDs | Draft | (none) / created 2020-08-26 | TOID layout, which the RPC event `id` uses |
| SEP-41 | Soroban Token Interface | Draft | 0.5.2 / 2026-08-24 | Token functions and events (see soroban-events.md) |
| SEP-42 | Stellar Asset List | Draft | 0.2.1 / 2023-11-29 | Curated asset lists (code, issuer, contract, decimals, domain) |
| SEP-44 | Token Interface Extension: Memo | Draft | 0.2.1 / 2024-09-09 | `transfer_memo` with the memo as the 5th topic |
| SEP-54 | Ledger Metadata Storage | Active | 0.2.0 / 2026-01-07 | Data lake format (see data-sources.md) |

Ecosystem index: [P0]. Note that the index lists SEP-23 as "Muxed Account Strkeys" while the document title is "Strkeys" [P0, P2].

---

## SEP-23: Strkeys (Active, v1.4.0, updated 2026-09-18) [P2]

| Prefix | Key type | Version base | Payload |
|---|---|---|---|
| G | STRKEY_PUBKEY | 6<<3 | 32-byte ed25519 |
| M | STRKEY_MUXED | 12<<3 | ed25519 (32) + u64 ID (8, big-endian) |
| S | STRKEY_PRIVKEY | 18<<3 | 32-byte seed |
| T | STRKEY_PRE_AUTH_TX | 19<<3 | 32-byte hash |
| X | STRKEY_HASH_X | 23<<3 | 32-byte hash |
| P | STRKEY_SIGNED_PAYLOAD | 15<<3 | ed25519 + length-prefixed padded payload |
| C | STRKEY_CONTRACT | 2<<3 | 32-byte hash |
| L | STRKEY_LIQUIDITY_POOL | 11<<3 | 32-byte hash |
| B | STRKEY_CLAIMABLE_BALANCE | 1<<3 | 1-byte type (0x00 = V0) + 32-byte hash |
| W | STRKEY_MUXED_CONTRACT | 22<<3 | contract hash + u64 ID ("introduced in CAP-84") |

- An M address is 43 bytes, which base32-encodes to 69 characters. The ID is unsigned u64; the test vectors include IDs above the i64 maximum [P2].
- Validation rules [P2]:
  - Reject lengths congruent to 1, 3 or 6 mod 8.
  - Unused trailing bits must be zero, and `=` padding is not allowed.
  - The checksum is CRC16 (XModem polynomial).
  - The encoding must be canonical: either re-encode and compare with the input, or apply equivalent checks.
  - Signed payloads need a matching length and zero padding.
- The W type depends on Protocol 30, which has its mainnet vote on 2026-11-23 [P10, P11].
- Accounting note: an M or W address is a sub-account label on a single underlying ledger balance. Balances live on the G or C account; CAP-67 / CAP-84 events put the ID in `to_muxed_id` [P9, P10].

## SEP-29: Account Memo Requirements (Active, v0.5.0, updated 2020-05-04) [P3]

- An account signals the requirement with a data entry `config.memo_required` = `"1"`, using SEP-18 namespacing.
- Senders check the destination for `PAYMENT`, `PATH_PAYMENT_STRICT_SEND`, `PATH_PAYMENT_STRICT_RECEIVE` and `MERGE_ACCOUNT`. If the flag is set and the transaction has no memo, the wallet must block submission. Multi-operation transactions are checked per operation.
- The check applies when the destination "is not a multiplexed account". M destinations are therefore implicitly exempt.
- The SEP does not mention Soroban or contract transfers.
- Accounting relevance: exchanges and custodians use the tx memo, or the M address, to identify the beneficiary. Since P23, CAP-67 copies the classic tx memo into `to_muxed_id` [P9]:
  - `MEMO_ID` becomes u64.
  - `MEMO_TEXT` becomes string.
  - `MEMO_HASH` and `MEMO_RETURN` become bytes.
  - A muxed destination ID takes precedence over the memo.

## SEP-11: Txrep (Active, v1.1.0) [P4]

- Asset string forms:
  - `native` for XLM. The SEP suggests displaying `XLM` on pubnet and `TestXLM` on testnet.
  - `CODE:ISSUER` for AlphaNum4 and AlphaNum12. The issuer is a SEP-23 G address.
  - `<lowercase-hex-poolid>:lp` for pool shares.
- Escaping rules:
  - Codes are printable ASCII 0x21 to 0x7e; `\x` hex escapes and `\` escapes the next character.
  - AlphaNum12 codes shorter than 5 bytes are padded with escaped NULs to length 5.
  - In normalized form, trailing `\x00` is omitted unless needed.
- Relevance: CAP-46-06 and CAP-67 label the SAC asset topic `sep0011_asset:String` [P8, P9], which points at this format. The CAPs do not restate it (see Open questions).

## SEP-1: Stellar Info File (Active, v2.7.0, updated 2025-01-16) [P1]

- Hosted at `https://<home_domain>/.well-known/stellar.toml`. Limits: 100 KB maximum, `Access-Control-Allow-Origin: *` required. An account's `home_domain` creates the link between the account and the file.
- `[[CURRENCIES]]` fields:
  - `code` (≤12 characters).
  - `issuer` (G…, for Stellar assets) **or** `contract` (C…, for non-SAC tokens; must be SEP-41-compatible).
  - `code_template`.
  - `status` (`live`, `dead`, `test` or `private`).
  - `display_decimals` (0 to 7).
  - `name` (≤20 characters).
  - `desc`, `conditions`, `image`.
  - Issuance: `fixed_number`, `max_number` or `is_unlimited`.
  - Anchoring: `is_asset_anchored`, `anchor_asset_type`, `anchor_asset`, `attestation_of_reserve`, `redemption_instructions`, `collateral_*`.
  - SEP-8: `regulated`, `approval_server`, `approval_criteria`.
  - `toml` (an external pointer; must be the only field in its entry).
- Contract token behavior "can vary, since their implementation is customizable".
- Accounting relevance: provides display metadata and an anchor or fiat mapping. This is off-chain and mutable, so record a snapshot with a fetch timestamp if it is used.

## SEP-14: Dynamic Asset Metadata (Active, v1.0.0) [P5]

- `ASSET_METADATA_SERVER` in stellar.toml points to a REST endpoint with Horizon-style paging (`cursor`, `order`, `limit` default 10, max 200). Records are keyed by `code` and `issuer`.
- It is for issuers that exceed the roughly 300-asset capacity of the 100 KB stellar.toml.

## SEP-41: Soroban Token Interface (Draft, v0.5.2, updated 2026-08-24) [P6]

- See soroban-events.md §5 for functions and events.
- Key points:
  - `transfer` takes a `MuxedAddress` (since v0.4.0).
  - `transfer` and `mint` data may be maps with `to_muxed_id: Option<u64|String|BytesN<32>>`.
  - Both single/vec and map data formats must be accepted.
  - Extra topics are allowed (v0.5.2).
  - `decimals()`, `name()` and `symbol()` identify contract tokens on-chain.

## SEP-42: Stellar Asset List (Draft, v0.2.1, updated 2023-11-29) [P7]

- Curated lists with entry fields `code` (or `symbol()` for Soroban tokens), `issuer`, `contract` (strkey), optional `decimals`, and `domain` (the stellar.toml host).
- Inclusion is "not ... endorsement". Useful as an optional asset-registry input.

## SEP-44: Token Interface Extension: Memo (Draft, v0.2.1, updated 2024-09-09) [P12]

- Defines `transfer_memo(from, to, amount, memo: u64)`. The `transfer` event topics are `["transfer", from, to, _ (undefined), memo:u64]` and the data is `i128`.
- The SEP says it deliberately avoids muxed `Address` types. Implementations: "None". It does not mention CAP-67 / `to_muxed_id`.

## SEP-35: Operation IDs (Draft) [P13]

- A signed 64-bit ID made of:
  - ledger sequence, 32 bits (bits 0 to 31);
  - tx application order, 20 bits, starting at 1;
  - operation index, 12 bits, starting at 1.
- Relevance: RPC `getEvents` `id` = 19-character TOID + 10-character event index [data-sources S12]. This gives a stable, sortable natural key for journal entries.

## SEP-54: Ledger Metadata Storage (Active, v0.2.0) [P14]

- See data-sources.md §3.

---

## Sources (all retrieved 2026-11-16)

- [P0] SEP index: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/README.md
- [P1] SEP-1: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md
- [P2] SEP-23: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0023.md
- [P3] SEP-29: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0029.md
- [P4] SEP-11: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0011.md
- [P5] SEP-14: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0014.md
- [P6] SEP-41: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md
- [P7] SEP-42: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0042.md
- [P8] CAP-46-06: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0046-06.md
- [P9] CAP-67: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0067.md
- [P10] CAP-84: https://github.com/stellar/stellar-protocol/blob/master/core/cap-0084.md
- [P11] Blog, Bell (Protocol 30) upgrade guide: https://stellar.org/blog/developers/bell-protocol-30-upgrade-guide
- [P12] SEP-44: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0044.md
- [P13] SEP-35: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0035.md
- [P14] SEP-54: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0054.md

## Open questions

1. Is the SAC `sep0011_asset` topic exactly the SEP-11 string (`native` / `CODE:ISSUER`), including SEP-11's escaping and padding rules? Neither CAP states this.
2. SEP-29 does not cover Soroban/SAC transfers, or `to_muxed_id` derived from memos. Is there an official recommendation for memo-required checks on contract transfers?
3. How do SEP-44 (Draft, 5th-topic memo) and SEP-41 v0.4+ `to_muxed_id` relate? Is SEP-44 effectively superseded? This is not stated.
4. SEP-18's header (version and date) was not fetched. Only its Active status is confirmed, via the index.
5. SEP-23's W type depends on Protocol 30 activation (mainnet vote 2026-11-23). This needs confirming after the vote.
6. SEP-41 is still Draft despite wide deployment. The stability of its event formats (for example v0.5.0 introducing map data) is a risk for decoders.
7. SEP-1 `display_decimals` (0 to 7) is display-only. For contract tokens, accounting precision should come from on-chain `decimals()`. No SEP states this explicitly for accounting use.
