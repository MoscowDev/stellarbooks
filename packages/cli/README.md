# @stellarbooks/cli

Command-line interface for StellarBooks.

Run `stellarbooks demo` for a synthetic XLM payment, network fee, trial balance, replay check,
and reconciliation report. Pass `--mismatch` to compare against a closing balance one stroop
lower. A matching result exits with status 0, a mismatch with status 1, and invalid arguments
with status 2.

From the source tree, build the workspace and run `node packages/cli/dist/bin.js demo`.
See [the roadmap](../../docs/ROADMAP.md) for the remaining CLI workflows.

Licensed under MIT. See [LICENSE](../../LICENSE).
