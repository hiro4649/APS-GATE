<!-- CODEX_QUALITY_HARNESS_BEGIN -->
CODEX_QUALITY_HARNESS_FILE v1.2.6

# APS-GATE Working Guide

APS-GATE is an external-facing AI PR Safety Gate. It verifies AI-authored pull
requests with deterministic evidence and policy profiles. It must stay small,
auditable, and independent from hosted LLM judgment.

## Active Harness

This repository uses HARNESS v1.2.6 Lite Profile for APS-GATE development.
Read first:

- `AGENTS.md`
- `docs/process/CODEX_HARNESS_MANIFEST.json`
- `docs/process/CODEX_V126_APS_GATE_PROFILE.md`
- `docs/process/APS_GATE_DETAILED_SPEC.md`
- `README.md`

Do not import the full Source HARNESS matrix into APS-GATE. Use HARNESS
concepts, not HARNESS complexity.

## Prime Directive

Prevent false PASS outcomes before adding features. A blocked or owner-required
verdict is acceptable when evidence is incomplete. A false PASS is a product
defect.

## Scope

Allowed APS-GATE development surfaces:

- deterministic TypeScript CLI and gate logic
- GitHub Action template
- policy profiles
- safe artifact JSON
- one-verdict PR comment
- demo fixtures and tests
- APS-GATE Lite harness metadata and local checks

Forbidden without explicit owner scope:

- external LLM dependency for core verdict
- auto-merge
- `pull_request_target` default
- raw log ingestion
- secret exposure
- wallet/RPC/deploy access
- production readiness claims
- legal compliance claims
- YouTube policy compliance claims
- SaaS/runtime service implementation
- full HARNESS rollout machinery

## Required Verification

Before treating APS-GATE local work as complete, run:

```bash
npm test
npm run demo
npm run harness:check
```

## Approval Boundary

User-supplied `policyEvidence` is advisory only. It cannot unlock `PASS`.
Trusted approval must be source-bound, approver-bound, profile-bound, and
head-SHA-bound. `manual_fixture` is valid only in local/demo/test mode, never in
GitHub Action mode.

## Output Discipline

Each APS-GATE decision should reduce to one verdict, one primary blocker, one
safe next action, and one safe artifact JSON. Do not expose raw logs or secrets.

<!-- CODEX_QUALITY_HARNESS_END -->
