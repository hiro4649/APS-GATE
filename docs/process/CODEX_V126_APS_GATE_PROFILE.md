<!-- CODEX_QUALITY_HARNESS_FILE v1.2.6 -->
# CODEX V126 APS-GATE Lite Profile

APS-GATE uses HARNESS v1.2.6 as a lightweight local governance profile, not as a
full Source HARNESS installation.

## Purpose

APS-GATE is an external-facing AI PR Safety Gate. Its first product promise is
to avoid false PASS decisions for AI-authored pull requests.

## Active Surface

APS-GATE v0 must remain:

- deterministic
- GitHub Action friendly
- safe-artifact based
- one-verdict oriented
- external-LLM independent for core verdicts
- small enough to explain in one README

## Required Commands

```bash
npm test
npm run demo
npm run harness:check
```

## Required Safety Properties

- No external LLM dependency for core verdict.
- No auto-merge behavior.
- No default `pull_request_target` workflow.
- No raw log ingestion.
- No secret exposure.
- No wallet/RPC/deploy access.
- No production readiness claim.
- No legal compliance claim.
- No YouTube policy compliance claim.
- GitHub Action permissions should stay minimal.
- `policyEvidence` is advisory only.
- `ownerApproval: true` in user input must not unlock PASS.
- `trustedApproval` must match source, approver, head SHA, profile, decision,
  reason, and timestamp requirements.
- `manual_fixture` trusted approval is local/demo/test only and is rejected in
  GitHub Action mode.
- `github_review` trusted approval must be collected from the GitHub API, target
  the current head SHA, come from `trustedApprovers`, and reject self/bot
  approval.

## Profiles

`standard` blocks unknown head/file/check evidence and package/workflow/product
changes without same-head check evidence.

`crypto-web3` includes standard and requires owner boundaries for contract,
deploy, wallet/RPC, release, governance, funded transaction, and readiness
surfaces.

`production-sensitive` includes standard and blocks or owner-gates runtime,
infrastructure, auth, env, migration, deploy, package, and production-impacting
changes without same-head evidence.

## Non-Goals

- No SaaS runtime in v0.
- No Flue integration in v0.
- GitHub review API trusted receipt collection is minimal and allowlist-bound.
- No multi-agent reviewer loop in v0.
- No full HARNESS legacy status matrix.

## Definition Of Done

Local APS-GATE development is complete only when tests, demo, and Lite harness
check pass. A generated PASS must be deterministic and evidence-backed.
