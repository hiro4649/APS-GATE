# APS-GATE

AI PR Safety Gate. APS-GATE verifies AI-authored pull requests before merge with deterministic rules, not an LLM judge.

APS-GATE development is self-governed by HARNESS v1.2.6 Lite Profile. The
profile is intentionally small: it applies HARNESS safety concepts without
copying the full Source HARNESS matrix into this external-facing MVP.

## Quickstart

Use APS-GATE from a GitHub `pull_request` workflow:

```yaml
name: APS-GATE

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  pull_request_review:
    types: [submitted, dismissed]

permissions:
  contents: read
  pull-requests: write
  checks: read

jobs:
  aps-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: hiro4649/APS-GATE@8712bbf527b033d0bc0fcd437df1e4d28089d943
        with:
          profile: standard
          github-token: ${{ secrets.GITHUB_TOKEN }}
          trusted-approvers: ""
          required-checks: "test"
```

APS-GATE does not check out or run untrusted PR code. It reads PR metadata, changed file names, and check/status conclusions for the current PR head SHA. Check evidence must match the current PR head SHA. `pull_request_target` is not the default because it can expose privileged workflow context to untrusted changes. On fork PRs, GitHub may prevent comment writes; APS-GATE still emits the artifact and stdout verdict.
Pin the Action to a reviewed full commit SHA. A floating tag can be convenient after releases exist, but it is not the recommended security default.

## CLI

```bash
npm install
npm run build
npm run harness:check
node dist/src/cli.js evaluate \
  --input demo/fixtures/pass-standard.json \
  --output aps-gate.safe.json \
  --comment-output aps-gate.comment.md
```

The CLI exits `0` for `PASS` and `2` for `BLOCKED` or `OWNER_REQUIRED`. Add `--no-fail-on-blocked` for local inspection.
Verification-relevant changes require explicit `--required-check` values. APS-GATE's own check must not be listed as a required check.

## Profiles

- `standard`: blocks missing head SHA, missing changed files, package/lockfile changes without same-head CI evidence, workflow changes without same-head CI evidence, and product code changes without same-head CI evidence.
- `crypto-web3`: includes `standard`, then requires owner evidence for contracts, deploy boundaries, wallet/RPC/secrets boundaries, and blocks crypto release/governance/funded transaction claims without explicit owner evidence.
- `production-sensitive`: includes `standard`, then blocks production-impacting runtime, infrastructure, auth, env, migration, deployment, package, and runtime config changes without same-head check evidence. Ambiguous production-impacting changes require owner approval.

## Trust boundary

User-supplied `policyEvidence` is advisory only. It can explain context, but it cannot unlock `PASS`, satisfy owner approval, or replace same-head check evidence. Owner boundaries require `trustedApproval` with `source`, `approver`, `headSha`, `profile`, `decision`, `reason`, and `createdAt`; the `headSha` and `profile` must match the current run. In local mode, `source: "manual_fixture"` is accepted only for demo/test fixtures and is rejected in GitHub Action mode. In GitHub Action mode, `source: "github_review"` can unlock only when APS-GATE collected the approval from the GitHub API, the approver is in `trusted-approvers`, the review targets the current head SHA, and the approver is not the PR author or a bot.
Protect `trusted-approvers` configuration with CODEOWNERS or repository/organization-controlled review. A PR author must not be able to add themselves as a trusted approver.

## Verdict limits

`PASS` means the APS-GATE policy and evidence gate passed. It does not mean the code is correct, vulnerability-free, audited, suitable for production use, legally compliant, or deploy-safe.

## Output

Each run produces one verdict, one primary blocker, one safe next action, one safe artifact JSON, and one short PR comment.

```json
{
  "schemaVersion": "0.1.0",
  "tool": "APS-GATE",
  "verdict": "BLOCKED",
  "mergeAllowed": false,
  "primaryBlocker": "same-head CI evidence is missing",
  "safeNextAction": "rerun required checks on the current PR head",
  "evidenceHeadSha": "abc123",
  "profileUsed": "standard",
  "forbiddenBoundaryFlags": {
    "productCodeChanged": true,
    "packageOrLockfileChanged": false,
    "workflowChanged": false,
    "runtimeChanged": false,
    "deployTouched": false,
    "walletRpcTouched": false,
    "secretRiskTouched": false,
    "readinessClaimed": false,
    "contractTouched": false,
    "migrationTouched": false,
    "authTouched": false,
    "infrastructureTouched": false,
    "releaseTouched": false,
    "governanceTouched": false,
    "fundedTransactionTouched": false
  },
  "safeArtifactPath": "aps-gate.safe.json",
  "rawLogsRead": false,
  "secretsExposed": false,
  "autoMergeAttempted": false
}
```

APS-GATE v0 does not read raw logs by default, expose secrets, access wallets/RPC/deploy targets, auto-merge, claim production readiness, claim legal compliance, or claim YouTube policy compliance.

## APS-GATE HARNESS Lite

Local development must keep these checks passing:

```bash
npm test
npm run demo
npm run harness:check
```

The Lite profile lives in:

- `AGENTS.md`
- `docs/process/CODEX_HARNESS_MANIFEST.json`
- `docs/process/CODEX_V126_APS_GATE_PROFILE.md`

This profile treats false PASS prevention, minimal GitHub Action permissions,
trusted approval boundaries, no raw logs, no secrets, no auto-merge, and no
external LLM dependency for core verdicts as release-critical.
