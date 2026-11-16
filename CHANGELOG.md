# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project will use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it publishes releases.

## [Unreleased]

### Added

- Phase 0 research notes (`docs/research/`), prior-art review, ADRs 0001–0008 and the Phase 1 plan.
- M0 scaffolding:
  - **Tooling:** a pnpm workspace with five package skeletons, strict TypeScript 6.0 config, ESLint
    (typed rules, plus core no-I/O and no-`parseFloat` restrictions), Prettier, Vitest, TypeDoc with
    documentation validation, and CI.
  - **Tests:** repository-structure tests.
  - **Project files:** licence, code of conduct, contributing guide, security policy, issue and PR
    templates.
  - **Doc skeletons:** architecture, domain model, accounting rules and Stellar mapping.
