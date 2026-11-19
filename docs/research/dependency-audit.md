# Dependency audit follow-up

Retrieved 2026-11-18.

- [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) identifies picomatch 4.0.8 as patched. The lockfile uses 4.0.7 through the development tooling.
- [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) identifies glob 14.0.2 as patched. The workspace brings in glob through node-pg-migrate, which the current migration runner does not import.
- [pnpm workspace settings](https://pnpm.io/settings#overrides) document workspace-wide dependency overrides. Both offline and online resolution reported 4.0.7 as the latest available picomatch release. The attempted 4.0.8 pin was withdrawn to preserve an installable lockfile. Removing the unused migration dependency removes the affected glob path.
