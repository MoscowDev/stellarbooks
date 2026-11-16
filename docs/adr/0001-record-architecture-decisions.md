# ADR-0001: Record architecture decisions

- Status: Accepted
- Approved: 2026-11-16 (maintainer approved PLAN.md with defaults)
- Date: 2026-11-16

## Context
The project's brief needs every major decision to be traceable and justified from documentation.

## Decision
We keep lightweight ADRs in `docs/adr/`, numbered sequentially, using `0000-template.md`. Each ADR
links to the research notes in `docs/research/` that support it. An ADR is never edited after it is
Accepted, except to update its status. A changed decision gets a new ADR that supersedes the old one.

## Consequences
Contributors can see why choices were made. Each new dependency is justified in ADR-0007 or its own
ADR.
