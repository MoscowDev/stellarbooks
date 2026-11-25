# Security Policy

## Supported versions

StellarBooks is pre-alpha and has no released versions. Security fixes go to `main`.

## Scope

StellarBooks is designed to be **read-only**: it never requests, stores or uses Stellar secret keys.
The following are in scope:

- Any path by which the library could handle, log or leak secrets or sensitive data, such as
  database credentials or RPC API keys in connection strings.
- Ways to bypass journal integrity, for example posting unbalanced entries, or modifying or deleting
  posted entries despite the database protections described in ADR-0006.
- Injection in SQL, CSV export (formula injection) or CLI arguments.
- Dependency vulnerabilities that affect StellarBooks.

The dev-only fixture generator in `tools/fixture-gen` uses throwaway **testnet** keys. It is not
published, and it refuses to run against any network other than testnet.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub's private vulnerability
reporting: <https://github.com/MoscowDev/stellarbooks/security/advisories/new> ("Report a
vulnerability" under the repository's Security tab).

Private reporting must be enabled in the repository settings for that link to work. As of
2026-11-25 it is not enabled yet (Q-004 in docs/OPEN-QUESTIONS.md).

Include the affected version or commit, reproduction steps and the impact. We aim to acknowledge
reports within 7 days. This project has no paid bug bounty.

## Not a security guarantee

StellarBooks has not been audited by a third party. Use it at your own risk; see the MIT
[LICENSE](LICENSE).
