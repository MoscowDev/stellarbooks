# Research: Accounting fundamentals for StellarBooks

Status: research notes (no code). Retrieved 2026-11-16.

> **Disclaimer.** StellarBooks is not a tax, legal or audit tool. Several topics below
> (crypto classification, measurement basis, cost-basis method, fee capitalisation,
> FX treatment) are **accounting policy choices** that depend on the user's reporting
> framework (IFRS, US GAAP, local GAAP) and jurisdiction. The library should make
> these configurable and must not decide them for the user.

Quotes are verbatim from the cited source. Text not in quotes is our summary or our
design inference (marked "Design implication").

---

## 1. Double-entry fundamentals

### 1.1 Debits, credits, and normal balances

OpenStax *Principles of Accounting, Vol. 1* [S1]:

- "A debit records financial information on the left side of each account."
- "A credit records financial information on the right side of an account."
- "As assets and expenses increase on the debit side, their normal balance is a debit."
- "Since liabilities, equity (such as common stock), and revenues increase with a credit, their “normal” balance is a credit."
- "Dividends paid to shareholders also have a normal balance that is a debit entry." (Dividends/drawings are contra-equity.)

| Account type | Increases with | Normal balance |
|---|---|---|
| Asset | Debit | Debit |
| Liability | Credit | Credit |
| Equity (capital, retained earnings) | Credit | Credit |
| Equity: dividends / drawings (contra) | Debit | Debit |
| Income / revenue | Credit | Credit |
| Expense | Debit | Debit |

Every journal entry must balance: "The dollar value of the debits must equal the dollar
value of the credits or else the equation will go out of balance." [S2]

**Design implication.** Store postings as signed amounts (debit = positive, credit =
negative, the convention used by Ledger/hledger/Beancount) and derive "Dr/Cr" and
normal-balance presentation from account type. Contra accounts need an explicit flag
or must be inferred from sign.

### 1.2 Journal, ledger, posting

- "A journal is the first place information is entered into the accounting system." (the "book of original entry") [S2]
- "Recall that the general ledger is a record of each account and its balance." [S2]
- "Posting refers to the process of transferring data from the journal to the general ledger." [S2]

**Design implication.** Journal = append-only list of balanced entries (source of
truth). Ledger = a derived view (postings grouped by account, running balances). The
library should never store the ledger as an independent mutable state.

### 1.3 Chart of accounts and numbering

- OpenStax describes the chart of accounts as a numbering system listing all accounts in
  the order they appear on the financial statements, balance-sheet accounts first, then
  income-statement accounts [S3, per search summary of 3.6; not quoted verbatim].
- On numbering: "all asset accounts will start with the number 1." Examples: Cash (101),
  Accounts Receivable (111), Accounts Payable (201), Common Stock (301) [S2].
- The common convention 1xxx assets / 2xxx liabilities / 3xxx equity / 4xxx revenue /
  5xxx+ expenses is widely used but is **convention, not a standard**; the sources we
  read only confirm the "1 = assets" prefix and the examples above.

**Design implication.** Accounts should be typed by an explicit `type` field (asset,
liability, equity, income, expense), not inferred from numeric codes. Codes/names
should be user-configurable; ship a default template. hledger and Beancount both use
hierarchical colon-separated names (`assets:stellar:GABC…`) with type determined by
the root or a declaration [S8][S9] — this is a good model for Stellar addresses and
asset sub-accounts.

### 1.4 Trial balance

- A trial balance lists ledger accounts with balances; debit and credit totals must
  agree. OpenStax gives error-finding heuristics (difference ÷ 2 → posting on the wrong
  side; difference ÷ 9 → transposition) [S3, per search summary].
- "The Post-Closing Trial Balance summarizes the account balances of all accounts in
  the ledger, after closing entries have been posted." It "will include only the
  permanent/real accounts, which are assets, liabilities, and equity." [S4]

**Design implication.** With signed postings and per-entry balancing enforced at write
time, a trial balance always sums to zero **per commodity** (see §4). A trial-balance
report is still valuable for users and as an invariant test.

### 1.5 Period close (closing entries)

OpenStax [S4]: "Four entries occur during the closing process. The first entry closes
revenue accounts to the Income Summary account. The second entry closes expense
accounts to the Income Summary account. The third entry closes the Income Summary
account to Retained Earnings. The fourth entry closes the Dividends account to
Retained Earnings."

"If the balance in Income Summary before closing is a credit balance, you will debit
Income Summary and credit Retained Earnings in the closing entry. This situation
occurs when a company has a net income." [S4]

**Design implication.** Closing is just generated, balanced journal entries tagged
`kind: closing` dated at period end. Reports can either (a) compute P&L over a date
range without closing, or (b) materialise closing entries. hledger/Beancount compute
period reports without requiring closing entries; closing is optional. In a
multi-commodity ledger, closing must be done **per commodity** (income in XLM closes to
retained earnings in XLM, etc.) unless the user's policy converts to a functional
currency first.

### 1.6 Reversing entries and correction of errors (why append-only)

- OpenStax mentions reversing entries only briefly: reversing an adjusting entry of the
  prior period at the start of a new period; the book states it does not cover them in
  depth [S4, S5 per search summary]. **We found no authoritative full treatment in
  this session** (see Open questions).
- IAS 8 (prior-period errors) [S10]: material prior-period errors are corrected
  retrospectively by restating comparatives (or opening balances), "as if a prior period
  error had never occurred"; the correction is excluded from profit or loss of the period
  of discovery; hindsight is not permitted. (Summary of IFRS text via search; IAS 8 has
  been retitled "Basis of Preparation of Financial Statements" with IFRS 18, effective
  2027 — verify paragraph references.)

**Design implication (our inference, not a quoted rule).** The library should be
append-only: an erroneous entry is never edited or deleted; it is cancelled by a
reversing entry (same postings, signs flipped, linked via `reverses: <entryId>`) and
a correcting entry is added. This preserves an audit trail and makes Stellar-sourced
entries reproducible (deterministic IDs from tx hash + operation index). How
restatement is *presented* in reports (date the correction at the original date vs.
the discovery date) is a reporting-framework policy choice for the user.

---

## 2. Multi-currency (functional currency, FX)

IAS 21 (text as surfaced from ifrs.org via search; IFRS HTML/PDF standards are now
behind a free-registration wall and could not be fetched directly) [S11]:

- Initial recognition: "a foreign currency transaction shall be recorded, on initial
  recognition in the functional currency, by applying to the foreign currency amount the
  spot exchange rate between the functional currency and the foreign currency at the
  date of the transaction." (An average rate is permitted as a practical approximation
  if rates do not fluctuate significantly.)
- Subsequent measurement (para 23): "foreign currency monetary items shall be translated
  using the closing rate; non-monetary items that are measured in terms of historical
  cost in a foreign currency shall be translated using the exchange rate at the date of
  the transaction"; non-monetary items at fair value use the rate at the date fair value
  was measured.
- Monetary items: "units of currency held and assets and liabilities to be received or
  paid in a fixed or determinable number of units of currency."
- Exchange differences (para 28): "exchange differences arising on the settlement of
  monetary items or on translating monetary items at rates different from those at which
  they were translated on initial recognition during the period or in previous financial
  statements shall be recognised in profit or loss in the period in which they arise."
- Translation to a presentation currency different from functional currency: exchange
  differences go to other comprehensive income.

Key distinctions:

- **Transaction currency / commodity**: what the on-chain amount is denominated in
  (XLM, USDC, any Stellar asset `CODE:ISSUER`).
- **Functional currency**: the currency of the primary economic environment of the
  entity (user choice, e.g. USD, EUR, NGN).
- **Realised FX gain/loss**: on settlement/disposal.
- **Unrealised FX gain/loss / remeasurement**: from revaluing open balances at a later
  (closing) rate.

Important caveat: under the IFRIC 2019 agenda decision, a cryptocurrency holding is
**not** cash and **not** a financial asset [S6], so it is likely a *non-monetary* item
for IAS 21 purposes — meaning closing-rate retranslation does not automatically apply;
measurement follows IAS 38 / IAS 2 instead. Stablecoins and tokenised deposits may
differ. Classification is the user's policy decision (see Open questions).

**Design implication.** Keep native quantities as the source of truth; record the
functional-currency valuation at transaction date as **metadata/price annotation**
(rate + source + timestamp), not as a replacement of the native amount. Realised and
unrealised gains are then derived by a valuation/reporting layer under a configurable
policy.

---

## 3. Fees, swaps, crypto holdings

### 3.1 Fees

- Stellar network fees are paid in XLM. In a simple model: Dr `expenses:fees:network`
  (XLM) / Cr `assets:stellar:<acct>` (XLM).
- Whether transaction costs are **capitalised** into the acquired asset's cost or
  **expensed** is a policy choice:
  - ASU 2023-08: "the Board decided not to provide guidance on how to recognize or
    present transaction costs to acquire crypto assets." (BC36) The Board also noted that
    under fair-value remeasurement "the effect on comprehensive income in the period that
    crypto assets are acquired is the same" either way (BC35) [S7].
  - Under IFRS cost models (IAS 38 / IAS 2), directly attributable costs are generally
    part of cost; we could not fetch the IAS 38 text to quote it (see Open questions).

**Design implication.** Default: expense network fees to a fee account, with an option
to capitalise into the acquired lot's cost basis. Always keep the fee as a separate
posting so either policy can be reconstructed.

### 3.2 Asset-to-asset exchanges (swaps, path payments, DEX trades)

- In accounting terms a swap is a disposal of asset A and acquisition of asset B. Under
  IFRS, exchanges of non-monetary assets for intangibles are generally measured at fair
  value, with the carrying amount of the asset given up used if the exchange "lacks
  commercial substance or the fair value of neither the asset received nor the asset
  given up is reliably measurable" (Grant Thornton IAS 38 factsheet, secondary source)
  [S12]. Gain/loss on disposal = fair value received − carrying amount given up.
- Plain-text accounting represents this either with **cost/price annotations** or with
  **equity conversion (trading) postings** — see §4.

### 3.3 Crypto asset holdings — framework positions (policy, not library decisions)

**IFRS — IFRIC agenda decision, June 2019, "Holdings of Cryptocurrencies"** [S6]:

- Scope: "A cryptocurrency is a digital or virtual currency that is recorded on a
  distributed ledger"; not issued by a jurisdictional authority or other party; and "A
  holding of a cryptocurrency does not give rise to a contract between the holder and
  another party."
- "IAS 2 applies to cryptocurrencies when they are held for sale in the ordinary course
  of business." Broker-traders consider IAS 2.3(b), "commodity broker-traders who measure
  their inventories at fair value less costs to sell."
- "If IAS 2 is not applicable, an entity applies IAS 38 to holdings of cryptocurrencies."
- "a holding of cryptocurrency is not cash because cryptocurrencies do not currently have
  the characteristics of cash" — and it is not a financial asset.
- Disclosure: "An entity applies the disclosure requirements in the IFRS Standard
  applicable to its holdings of cryptocurrencies", plus IAS 1 judgements and IAS 10
  post-reporting-period fair value changes.

**US GAAP — FASB ASU 2023-08 (Subtopic 350-60), issued 13 Dec 2023** [S7]:

- Scope (350-60-15-1), assets that meet **all** of: "a. Meet the definition of
  intangible assets as defined in the Codification b. Do not provide the asset holder
  with enforceable rights to or claims on underlying goods, services, or other assets
  c. Are created or reside on a distributed ledger based on blockchain or similar
  technology d. Are secured through cryptography e. Are fungible f. Are not created or
  issued by the reporting entity or its related parties."
- "An entity is required to subsequently measure assets that meet those criteria at fair
  value with changes recognized in net income each reporting period."
- Presentation: crypto assets at fair value "separately from other intangible assets in
  the balance sheet" and remeasurement changes separately in the income statement.
- Disclosures include "The name, cost basis, fair value, and number of units for each
  significant" holding, and "The method for determining the cost basis of crypto assets."
  → **cost basis tracking per lot is still needed even under fair value.**
- Effective "for all entities for fiscal years beginning after December 15, 2024,
  including interim periods within those fiscal years. Early adoption is permitted."
- NFTs (fails "fungible") and assets granting enforceable claims (e.g. some stablecoins,
  wrapped tokens) are out of scope per Board discussion; issuer-created tokens are out of
  scope.

**Design implication.** The library records quantities, lots and transaction-date
prices; a pluggable **valuation policy** (cost / cost-less-impairment / fair value
through P&L / inventory) produces reports. Cost-basis method (FIFO, specific ID,
average) must be a user setting — tax rules on this are jurisdiction-specific.

---

## 4. Multi-commodity ledgers: balancing per commodity (key design input)

### 4.1 Ledger (ledger-cli) [S8]

- "An account may contain multiple commodities, in which case it will have separate
  totals for each."
- "By default, ledger will not consider commodity prices when generating its various
  reports."
- "The bottom line balances to zero, but is shown in two lines since we haven't told
  ledger to convert commodities."
- Cost: "a per-unit posting cost, by specifying `@ AMOUNT`, or a complete posting cost
  with `@@ AMOUNT`." Lot price: "The '{$30.00}' is a lot price."

### 4.2 hledger [S9]

- "The posting amounts in a transaction must sum up to zero, indicating that the inflows
  and outflows are equal."
- "In each commodity, hledger sums the transaction's posting amounts, after converting
  any with costs; then it checks if that sum is zero, when rounded to a suitable number
  of decimal digits - which we call the balancing precision."
- Balancing precision: "when checking the balance of commodity A, it uses the highest
  decimal precision seen for A in the journal entry (excluding cost amounts)." Fix for
  residuals includes "add a posting to absorb the imbalance (eg "expenses:rounding"."
- Two ways to record a currency exchange:
  - Traditional: "to record a transaction where one commodity is exchanged for another,
    you add extra equity postings to balance the two commodities":
    ```
    2026-01-01 buy euros
      assets:dollars     $-123
      equity:conversion   $123
      equity:conversion  €-100
      assets:euros        €100
    ```
  - Cost notation: `assets:euros €100 @ $1.23`. "Costs participate in transaction
    balancing. Amounts are converted to their cost before checking if the transaction is
    balanced."
- Trade-offs (verbatim): cost notation is "more compact"; equity postings "help to keep
  the accounting equation balanced" and "translate easily to any other double entry
  accounting system." Without conversion postings, cost-notation entries "cause an
  imbalance in the Accounting Equation. This shows up as a non-zero grand total in
  balance reports". hledger can convert between the two (`--infer-equity`,
  `--infer-costs`), generating accounts named "equity:conversion:A-B:A".
- "Costs are attached to specific posting amounts in specific transactions, and once
  recorded they do not change. This contrasts with market prices, which are ambient and
  fluctuating."
- Gain-type accounts: "postings to Gain-type accounts are ignored by transaction
  balancing" (hledger 2 lot/gain tracking).

### 4.3 Beancount [S13][S14]

- "The crucial and only constraint on postings is that the sum of their balance amounts
  must be zero."
- Weight of a posting: "If the posting has **only a price**, the price is multiplied by
  the number of units and the price currency is used." "If the posting **has a cost**,
  the cost is multiplied by the number of units and the cost currency is used." "if a
  posting **has both a cost and a price**, we simply ignore the price."
- Price-only annotations otherwise feed the price database: "The price will only be used
  to insert a price entry in the prices database".
- Inventories: "It is equivalent to a mapping from commodity to some number of units."
  Lots: "Beancount allows you to associate a cost basis and an optional label with a
  particular lot acquired." Booking: STRICT (default) "The lot specification has to match
  exactly one lot"; FIFO selects "the oldest of the lots"; LIFO "the latest (youngest)".

### 4.4 Trading accounts (Selinger) [S15]

- With per-currency columns, "the entries of each currency are balanced separately."
- Conversions "go through the trading account"; fluctuations in its value "correspond
  exactly to currency gains and losses." "The purpose of a currency trading account is
  not to perform conversions."

### 4.5 Recommended approach for StellarBooks (design implication)

1. **Amount = (quantity as exact decimal, commodity)**. Commodity identity for Stellar
   = `native` or `CODE:ISSUER` (never just `CODE`). Use integer stroops / 7-decimal
   fixed precision for Stellar assets — no floats; Stellar amounts are exact so no
   balancing tolerance should be needed for on-chain postings.
2. **Balance rule: every journal entry sums to exactly zero per commodity.** No
   implicit conversion at write time.
3. **Swaps/path payments use explicit conversion (trading) postings**, e.g.
   ```
   assets:stellar:G…      -100 XLM
   equity:conversion       100 XLM
   equity:conversion       -12 USDC:GA5Z…
   assets:stellar:G…        12 USDC:GA5Z…
   ```
   This keeps the accounting equation balanced per commodity (hledger "Variant 4",
   Selinger trading accounts) and exports cleanly to any DEB system. Optionally also
   attach a cost/price annotation (exchange rate) as metadata so @-style cost reporting
   and lot cost basis are available.
4. **Valuation in functional currency is a report-time projection** using (a) costs
   recorded at transaction time and (b) a price database (market prices by date). The
   net balance of `equity:conversion` valued at a given date = cumulative unrealised +
   realised conversion gain/loss (Selinger), which a policy layer can split and
   reclassify into income.
5. **Lots and booking method** (FIFO / specific ID / average / STRICT) recorded per
   acquisition, so realised gains and the ASU 2023-08 cost-basis disclosure can be
   produced.
6. **Export targets** (hledger/Ledger/Beancount journal formats) are cheap if the
   internal model matches theirs.

---

## Sources

- [S1] OpenStax, *Principles of Accounting, Vol. 1*, §3.1 — https://openstax.org/books/principles-financial-accounting/pages/3-1-describe-principles-assumptions-and-concepts-of-accounting-and-their-relationship-to-financial-statements (retrieved 2026-11-16)
- [S2] OpenStax, §3.5 Use Journal Entries to Record Transactions and Post to T-Accounts — https://openstax.org/books/principles-financial-accounting/pages/3-5-use-journal-entries-to-record-transactions-and-post-to-t-accounts (retrieved 2026-11-16)
- [S3] OpenStax, §3.6 Prepare a Trial Balance — https://openstax.org/books/principles-financial-accounting/pages/3-6-prepare-a-trial-balance (search-result summary only, retrieved 2026-11-16)
- [S4] OpenStax, §5.1 Closing Entries and §5.2 Post-Closing Trial Balance — https://openstax.org/books/principles-financial-accounting/pages/5-1-describe-and-prepare-closing-entries-for-a-business ; https://openstax.org/books/principles-financial-accounting/pages/5-2-prepare-a-post-closing-trial-balance (retrieved 2026-11-16)
- [S5] OpenStax, §3.3 Initial Steps in the Accounting Cycle — https://openstax.org/books/principles-financial-accounting/pages/3-3-define-and-describe-the-initial-steps-in-the-accounting-cycle (search-result summary only, retrieved 2026-11-16)
- [S6] IFRS Interpretations Committee, agenda decision "Holdings of Cryptocurrencies" (June 2019) — https://ifrs.org/projects/completed-projects/2019/holdings-of-cryptocurrencies/tad-holdings-of-cryptocurrencies ; PDF: https://www.ifrs.org/content/dam/ifrs/supporting-implementation/agenda-decisions/2019/holdings-of-cryptocurrencies-june-2019.pdf (retrieved 2026-11-16)
- [S7] FASB, ASU 2023-08 *Intangibles—Goodwill and Other—Crypto Assets (Subtopic 350-60)* — https://storage.fasb.org/ASU%202023-08.pdf (full text extracted, retrieved 2026-11-16)
- [S8] Ledger 3 manual — https://ledger-cli.org/doc/ledger3.html (retrieved 2026-11-16)
- [S9] hledger manual (sections Costs, Transaction balancing, Gain postings, Reporting at cost, Equity conversion postings) — https://hledger.org/hledger.html (retrieved 2026-11-16)
- [S10] IAS 8 (IFRS Foundation) — https://www.ifrs.org/issued-standards/list-of-standards/ias-8-basis-of-preparation-of-financial-statements/ (via search-result summary of ifrs.org text, retrieved 2026-11-16)
- [S11] IAS 21 *The Effects of Changes in Foreign Exchange Rates* — https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2023/issued/ias21.html (quotes surfaced via search; direct fetch blocked by registration wall; retrieved 2026-11-16)
- [S12] Grant Thornton Australia, IAS 38 factsheet (secondary) — https://www.grantthornton.com.au/globalassets/1.-member-firms/australian-website/technical-publications/ifrs/gtal_2016_factsheet-ias38-intangible-assets.pdf (via search summary, retrieved 2026-11-16)
- [S13] Beancount Language Syntax — https://beancount.github.io/docs/beancount_language_syntax/ (retrieved 2026-11-16)
- [S14] Beancount, How Inventories Work — https://beancount.github.io/docs/how_inventories_work/ (retrieved 2026-11-16)
- [S15] P. Selinger, *A Tutorial on Multiple Currency Accounting* — https://www.mathstat.dal.ca/~selinger/accounting/tutorial.html (retrieved 2026-11-16)

## Open questions

1. **Reversing entries**: no authoritative source fetched with a full treatment; append-only + reversal is our design inference (audit trail), not a quoted requirement. Find a textbook/AICPA source if we want to cite it.
2. **IAS 21 / IAS 38 / IAS 2 primary text** could not be fetched (IFRS registration wall). Quotes for IAS 21 come from search snippets of ifrs.org; IAS 38 exchange (para 45) and directly-attributable-cost rules come from secondary sources only. Verify before quoting in user-facing docs.
3. **Are crypto holdings monetary or non-monetary under IAS 21?** Inferred non-monetary from IFRIC 2019 (not cash, not financial asset); no source states this explicitly in what we read. Stablecoins/tokenised fiat on Stellar (e.g. USDC, anchor tokens) may be financial assets or in/out of ASU 2023-08 scope depending on enforceable rights — user policy.
4. **Chart-of-accounts numbering ranges** beyond "assets start with 1" are convention; decide default template ourselves.
5. **Closing entries in a multi-commodity ledger**: per-commodity closing vs converting to functional currency first — need a design decision (ADR).
6. **Conversion account granularity**: one `equity:conversion` account, or per-pair accounts like hledger's `equity:conversion:A-B:A`? Per-pair helps gain analysis.
7. **Fee capitalisation default** (expense vs add to cost basis) and **cost-basis method default** (FIFO vs average vs specific ID) — jurisdiction/tax-dependent; must be configurable.
8. **Price source** for transaction-date valuation (Stellar DEX trades, oracles, external APIs) and how to record provenance — not covered here.
9. IAS 8 now retitled with IFRS 18 (effective 2027); confirm current paragraph numbering if cited.
10. Treatment of Stellar-specific items (account base reserves, claimable balances, liquidity-pool shares, Soroban tokens, sponsored reserves) under any framework — not researched.
