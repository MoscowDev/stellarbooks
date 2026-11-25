# Research: Drips Wave — what makes a repo "Wave-ready"

Status: research notes. Retrieved 2026-11-16. Quotes are verbatim from the cited page
(as returned by our fetch tool, which sometimes summarises; quoted strings were
requested verbatim). Unquoted text is our summary.

## 1. What Wave is

- "Drips Wave is a recurring bounty cycle" run in short cycles, "usually one week per
  month", where contributors "Fix, Merge, and Earn." Launched with the Stellar ecosystem
  in January 2026 [W1].
- Three stages per Wave [W1]:
  1. **Scoping** — maintainers apply repos; once approved, add issues tagged with Point
     values based on complexity.
  2. **Sprint** — contributors log in with GitHub, submit PRs, earn Points.
  3. **Reward** — rewards distributed after verification based on each contributor's
     share of Points.

## 2. Repo onboarding (maintainer)

From "Participating in a Wave" [W2], FAQ [W5], Wave 7 changelog [W10]:

- Sign in with GitHub → **Maintainers → Orgs and Repos** → install the **Drips Wave
  GitHub App** on the org; sync repos; then "You must explicitly apply these
  repositories to a specific Wave Program."
- Only public repos: "Wave only ever syncs public repositories" [W10].
- Applications "require approval from the Wave Program organizers" [W2]. Terms: "The
  Association and the Wave Program Organizer retain sole discretion to select which
  repositories are admitted" and "may remove a repository at any time" [W8].
- **No published acceptance criteria.** Neither the docs nor the Terms define what makes
  a repo acceptable (no stated README/CONTRIBUTING/licence/test requirements) [W5][W8].
- Rejections: a rejected repo cannot be re-applied; appeal in-app only ("Appeals sent by
  email or through any other channel will be ignored"); first appeal two weeks after
  rejection, "one-month cooldown" after a declined appeal, "Each repository can be
  appealed a maximum of three times", and "appeals are only reconsidered when there has
  been substantive change" [W2][W10].
- Application limits (optional, per Program): per-user and per-org caps on repo
  applications per Wave cycle; "Rejected applications still use a slot for the current
  cycle" [W4].

## 3. Issues, complexity and points

Complexity levels and points [W2][W7]:

| Level | Points | Definition (verbatim, [W7]) |
|---|---|---|
| **Trivial** | 100 | "Typos, minor copy changes, or very small bug fixes." |
| **Medium** | 150 | "Standard feature work or involved bug fixes. Includes a 50-point complexity bonus." |
| **High** | 200 | "Complex architecture, refactors, or new integrations. Includes a 100-point complexity bonus." |

- "The Maintainer has the final say on an issue's complexity." [W7]
- Adding issues [W5]:
  - **App (recommended):** Maintainers → Issues → "Add to Wave", set Trivial/Medium/High.
  - **GitHub label:** apply the Program label (e.g. **"Stellar Wave"**). Label-added issues
    "default to Trivial complexity (100 Points)"; raise it in the app. Works only if the
    repo is approved for that Program; a bot comments on the issue [W2].
- Issues already assigned on GitHub to someone else cannot be added; the app reports
  which were skipped [W10].
- **Points budgets** [W3]: per-repo and per-org caps per Wave (docs example: 500 points
  per repo, 2,000 per org; the Wave 5 changelog cites an initial 75k-per-org cap [W9] —
  actual values are Program-specific). Exceeding a budget blocks adding/raising issues;
  if a label pushes over budget "the bot removes the label and comments". Budgets reset
  each Wave; unresolved issues carry over. More points can be requested via a Drips
  Discord support ticket.
- Unresolved issues "stay in the Program and are eligible for applications in the next
  Wave unless you remove them" [W2].

## 4. Assignment flow

- Contributors must pass KYC: "KYC is Mandatory" before applying [W6].
- "Do not start coding yet! The issue is only yours once the maintainer officially
  assigns you." [W6]
- Contributor limits: "You can have up to 15 pending applications at a time." "You can be
  assigned to at most 4 issues per organization across a single Wave." [W6]
- Maintainers accept via the dashboard or by **assigning on GitHub**; assigning marks other
  pending applications inactive. Explicit "Reject" is optional but recommended [W2].
- "Speed is critical." — review applicants quickly so they can finish within the Wave [W2].
- Applicant profiles show a Code Metrics scorecard and Languages profile [W2].

## 5. PRs, resolution, reviews

- PRs should link the issue, e.g. "Closes #<issue_number>", so the bot can identify it.
  No other PR format requirements are documented [W6].
- "Issues must be marked as resolved before the Wave ends." "Wave cycles are strict
  timeboxes." [W2][W7] Points are awarded when the issue is "Closed as Completed" on
  GitHub / marked resolved [W11]. If a good PR cannot be merged for reasons outside the
  contributor's control (e.g. feature freeze), maintainers are urged to mark it resolved
  anyway [W2].
- Automated assessment: "Maintainers now get 72 hours before automatic assessment kicks
  in" (an AI review used in points appeals; it "takes into account direct feedback from
  maintainers on the PR") [W9][W10].
- Two-way reviews within **14 days** of issue closing: overall experience required
  ("Below expectations", "Alright", "Exceeded expectations"); optional 1–5 star ratings
  (Communication, Code Quality, Timeliness, Problem Solving) and comment ≤ 5,000 chars;
  anonymous; locked after 14 days [W2]. FAQ also mentions 7 days after the Wave to issue
  "Compliments" [W5].
- Maintainer time expectation [W5]: "1–2 hours selecting and scoping 'good first
  issues'" before a Wave; check the dashboard daily during the one-week Wave; review and
  merge before the deadline.
- Disputes: discuss in GitHub comments first, then Drips Wave Support [W5].

## 6. Rules relevant to our repo (Terms & Rules [W8])

Prohibited contributor conduct we should reflect in CONTRIBUTING:
- "Submitting pull requests or contributions consisting solely of trivial typo corrections".
- LLM-generated contributions that are "of low quality, untested, or not understood by the
  Contributor".
- "Requesting repeated assignment to issues without reviewing their scope" or without
  "verifying whether the issue has already been assigned to another Contributor."
- Multiple accounts; malicious code ("vulnerabilities, backdoors, malware"); spam/Sybil;
  IP infringement.
- "Points have no monetary value". Maintainers may receive a separate allocation (5.5).

## 7. Checklist: making StellarBooks Wave-ready (our synthesis)

Required by docs:
- [ ] Public GitHub repo under an org with the Drips Wave GitHub App installed.
- [ ] Repo applied to the Stellar Wave Program and approved.
- [ ] Issues added via app or "Stellar Wave" label, each with complexity Trivial/Medium/High,
      within the repo/org points budget, and **not pre-assigned** on GitHub.
- [ ] Maintainer available daily during the Wave to assign and review; merge/resolve before
      the Wave ends; leave reviews within 14 days.

Recommended (not stated as requirements; inferred to improve approval odds and flow):
- [ ] README with scope, setup, test commands; CONTRIBUTING with "wait for assignment",
      "Closes #N" in PRs, AI-use policy aligned with Terms §6, test/lint expectations.
- [ ] Issue template with: context, acceptance criteria, files to touch, test
      expectations, suggested complexity — scoped so it is finishable within one week.
- [ ] Our own labels mirroring complexity (e.g. `complexity: trivial|medium|high`) plus
      `Stellar Wave`; CI that runs on fork PRs.
- [ ] Avoid typo-only Trivial issues (contributions "consisting solely of trivial typo
      corrections" are prohibited).

## Sources

- [W1] Drips Wave intro — https://docs.drips.network/wave/ (retrieved 2026-11-16)
- [W2] Maintainers: Participating in a Wave — https://docs.drips.network/wave/maintainers/participating-in-a-wave/ (retrieved 2026-11-16)
- [W3] Maintainers: Points budgets — https://docs.drips.network/wave/maintainers/points-budgets/ (retrieved 2026-11-16)
- [W4] Maintainers: Repo application limits — https://docs.drips.network/wave/maintainers/repo-application-limits/ (retrieved 2026-11-16)
- [W5] Maintainers: FAQ — https://docs.drips.network/wave/maintainers/faq/ (retrieved 2026-11-16)
- [W6] Contributors: Solving issues and earning rewards — https://docs.drips.network/wave/contributors/solving-issues-and-earning-rewards/ (retrieved 2026-11-16)
- [W7] Points and rewards — https://docs.drips.network/wave/points-and-rewards/ (retrieved 2026-11-16)
- [W8] Terms and rules — https://docs.drips.network/wave/terms-and-rules/ (retrieved 2026-11-16)
- [W9] Drips blog, "The changelog: key changes for the fifth Stellar Wave" — https://www.drips.network/blog/posts/the-changelog-key-changes-for-the-fifth-stellar-wave (retrieved 2026-11-16)
- [W10] Drips blog, "Wave 7 changelog" — https://drips.network/blog/posts/wave-7-changelog (retrieved 2026-11-16)
- [W11] Contributors: FAQ — https://docs.drips.network/wave/contributors/faq/ (retrieved 2026-11-16)

Not read: /wave/applicant-metrics, /wave/withdrawing-rewards (contributor-side; not
relevant to repo readiness).

## Open questions

1. **Repo acceptance criteria are unpublished.** What do Stellar Wave organizers look for
   (activity, tests, docs, licence, ecosystem relevance)? Ask on Drips Discord.
2. **Actual budgets for Stellar Wave** (per-repo/per-org points) and application limits for
   the current cycle — docs give only examples (500 / 2,000; 75k org cap in Wave 5).
3. Is there a **minimum repo age/history** or activity requirement? Not documented.
4. Exact current Wave schedule / dates for the next Stellar Wave — not checked.
5. Precise "automatic assessment" window and behaviour may change between Waves (24h → 72h
   in Wave 7); re-check the latest changelog before each Wave.
6. Our fetch tool sometimes paraphrases; re-verify verbatim quotes against the live pages
   before publishing them in CONTRIBUTING.

## Update 2026-11-25

Retrieved 2026-11-25 from
<https://docs.drips.network/wave/maintainers/participating-in-a-wave/>:

- Maintainers install the Drips GitHub App and "must explicitly apply these repositories to a
  specific Wave Program". Program organizers approve each application; a rejected repository can be
  appealed but "cannot be re-applied".
- "When adding an issue, you must assign a complexity level", which sets the points: Trivial (100),
  Medium (150), High (200).
- During a Wave, maintainers should review applicants quickly ("Speed is critical") and mark issues
  resolved before the Wave ends; both sides can leave reviews within 14 days.
