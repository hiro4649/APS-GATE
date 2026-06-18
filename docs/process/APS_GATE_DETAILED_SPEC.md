<!-- CODEX_QUALITY_HARNESS_FILE v1.2.6 -->
# APS-GATE Detailed Specification

Status: local v0.1 specification  
Project: APS-GATE, AI PR Safety Gate  
Active harness: HARNESS v1.2.6 Lite Profile  
Last updated: 2026-06-18

## 1. Product Purpose

APS-GATE is a deterministic safety gate for AI-authored GitHub pull requests.
Its core job is to prevent an unevidenced or boundary-crossing PR from being
treated as merge-safe.

The v0 product promise is:

- produce exactly one verdict;
- identify exactly one primary blocker when blocked;
- suggest exactly one safe next action when blocked or owner-gated;
- write one safe artifact JSON;
- render one short PR comment;
- avoid external hosted LLM judgment for the core verdict.

False PASS prevention is more important than permissive merging. If APS-GATE
cannot see enough evidence, it must prefer `BLOCKED` or `OWNER_REQUIRED` over
`PASS`.

## 2. Non-Goals

APS-GATE v0 must not implement:

- SaaS runtime services;
- auto-merge;
- target rollout machinery;
- full HARNESS matrix import;
- Flue integration;
- multi-agent reviewer loops;
- external LLM verdict judgment;
- raw log ingestion;
- wallet, RPC, deploy, funded transaction, governance transaction, BscScan,
  release, or secret access.

APS-GATE v0 must not claim production readiness, legal compliance, YouTube
policy compliance, audit completion, or deploy safety.

## 3. Runtime Surfaces

### 3.1 CLI

The CLI entrypoint is `aps-gate evaluate`.

Primary local usage:

```bash
node dist/src/cli.js evaluate \
  --input demo/fixtures/pass-standard.json \
  --output aps-gate.safe.json \
  --comment-output aps-gate.comment.md
```

The CLI:

- reads explicit JSON input or GitHub pull request metadata;
- evaluates a selected profile;
- writes a safe artifact JSON;
- optionally writes the rendered PR comment;
- optionally posts the PR comment;
- exits `0` for `PASS`;
- exits `2` for `BLOCKED` or `OWNER_REQUIRED`, unless
  `--no-fail-on-blocked` is provided.

### 3.2 GitHub Action

The Action is a composite GitHub Action. It is intended for `pull_request`
workflows.

Required example workflow permissions:

```yaml
permissions:
  contents: read
  pull-requests: write
  checks: read
```

The Action must not:

- default to `pull_request_target`;
- check out or execute untrusted PR code;
- request write permissions beyond PR comment needs;
- access secrets beyond the GitHub token supplied by the workflow;
- read raw logs;
- auto-merge.

Comment posting failure, including fork PR permission denial, must not erase the
verdict. APS-GATE should still write the artifact and print the verdict.

### 3.3 Library API

The public TypeScript API exports:

- `evaluateGate(input)`;
- `buildSafeArtifact(result, path)`;
- `writeSafeArtifact(artifact, path)`;
- `renderPrComment(artifact)`;
- GitHub metadata helpers;
- core types for inputs, results, artifacts, profiles, run modes, and trusted
  approvals.

## 4. Core Inputs

The core input shape is `GateInput`.

Required for a meaningful PR evaluation:

- `profile`: `standard`, `crypto-web3`, or `production-sensitive`;
- `headSha`: current PR head SHA;
- `changedFiles`: list of changed paths;
- `checks`: check/status evidence, when available.

Optional:

- `requiredChecks`: names that must have successful same-head evidence;
- `claims`: public/readiness/release claims to classify;
- `policyEvidence`: advisory-only context;
- `trustedApproval`: source-bound owner receipt;
- `runMode`: `local` or `github_action`;
- `existingArtifact`: reserved for future compatibility, not a v0 PASS unlock.

## 5. Evidence Trust Classes

### 5.1 Deterministic Check Evidence

Check evidence may unlock `PASS` only when:

- a check/status conclusion is successful; and
- the evidence `headSha` exactly matches `GateInput.headSha`; and
- all configured `requiredChecks` are satisfied, when `requiredChecks` is set.

Successful checks without a matching `headSha` are not same-head evidence.

### 5.2 User-Supplied `policyEvidence`

`policyEvidence` is advisory only.

It can explain why a user thinks a PR is safe, but it cannot:

- unlock `PASS`;
- satisfy owner approval;
- replace same-head CI evidence;
- override a profile boundary;
- validate readiness or compliance claims.

The following values must not by themselves change a verdict to `PASS`:

- `sameHeadCiEvidence: true`;
- `packageChangeEvidence: true`;
- `workflowChangeEvidence: true`;
- `ownerApproval: true`;
- `contractOwnerApproval: true`;
- `deployOwnerApproval: true`;
- `walletRpcOwnerApproval: true`;
- `productionOwnerApproval: true`;
- `productionReadinessEvidence: true`.

### 5.3 Trusted Approval

`trustedApproval` is the v0 schema for owner-boundary receipts.

Required fields:

```json
{
  "source": "manual_fixture",
  "approver": "hiro4649",
  "headSha": "abc123",
  "profile": "crypto-web3",
  "decision": "approved",
  "reason": "Owner accepted deploy-adjacent metadata-only change",
  "createdAt": "2026-06-18T00:00:00Z"
}
```

Validation rules:

- `source` must be recognized.
- `approver` must be non-empty.
- `headSha` must equal the current PR `headSha`.
- `profile` must equal the selected `profile`.
- `decision` must be `approved`.
- `reason` must be non-empty.
- `createdAt` must be non-empty.
- `source: "manual_fixture"` is valid only in `runMode: "local"`.
- `source: "manual_fixture"` is rejected in `runMode: "github_action"`.
- `source: "github_review"` is valid only when APS-GATE collected it from the
  GitHub API in GitHub Action mode.
- GitHub review approvals require `trustedApprovers` allowlist membership.
- GitHub review approvals must target the current head SHA.
- GitHub review approvals by the PR author are not trusted.
- GitHub review approvals by bot accounts are not trusted.

Rule of thumb:

```text
Untrusted evidence can explain.
Trusted evidence can unlock.
```

## 6. Run Modes

### 6.1 `local`

Local mode is the default for CLI fixture evaluation. It may accept
`manual_fixture` trusted approvals for tests and demos.

### 6.2 `github_action`

GitHub Action mode is set when the CLI runs with `--from-github`, or explicitly
with `--run-mode github_action`.

In GitHub Action mode:

- `manual_fixture` approvals are untrusted;
- `github_review` approvals can unlock only when collected from GitHub API;
- `github_review` approvals require `trustedApprovers` allowlist membership;
- GitHub metadata is collected through GitHub APIs;
- changed file collection failure must not produce `PASS`;
- check collection failure must not produce `PASS` for code/profile changes that
  require evidence;
- comment posting failure should warn but should not erase the verdict.

## 7. Verdict Semantics

### 7.1 `PASS`

`PASS` means:

- no blocking or owner boundary is detected;
- required deterministic same-head evidence is present;
- any owner boundary that applies has valid trusted approval;
- `mergeAllowed` is `true`;
- `primaryBlocker` is `null`;
- `safeNextAction` is `null`.

### 7.2 `BLOCKED`

`BLOCKED` means:

- a deterministic safety failure exists; or
- required evidence is missing; or
- a forbidden claim/boundary is detected without acceptable evidence.

`BLOCKED` requires:

- `mergeAllowed: false`;
- exactly one `primaryBlocker`;
- exactly one `safeNextAction`.

### 7.3 `OWNER_REQUIRED`

`OWNER_REQUIRED` means:

- the change may be acceptable;
- APS-GATE cannot authorize it without a trusted owner/delegated approval.

`OWNER_REQUIRED` requires:

- `mergeAllowed: false`;
- exactly one `primaryBlocker`;
- a specific `safeNextAction` asking for owner evidence or approval.

## 8. Evaluation Order

All profiles should follow this order:

1. Normalize the selected profile.
2. Classify changed files and claims into boundary flags.
3. Block missing `headSha`.
4. Block missing `changedFiles`.
5. Apply profile-specific forbidden or owner-gated boundaries.
6. Apply standard evidence requirements.
7. Return `PASS` only after all applicable blockers and owner gates are cleared.

This order is intentionally conservative. A later `PASS` must not overwrite an
earlier blocker.

## 9. Boundary Flags

The safe artifact includes these boundary flags:

- `productCodeChanged`;
- `packageOrLockfileChanged`;
- `workflowChanged`;
- `runtimeChanged`;
- `deployTouched`;
- `walletRpcTouched`;
- `secretRiskTouched`;
- `readinessClaimed`;
- `contractTouched`;
- `migrationTouched`;
- `authTouched`;
- `infrastructureTouched`;
- `releaseTouched`;
- `governanceTouched`;
- `fundedTransactionTouched`.

Flags are deterministic path/claim classifications. They are evidence, not final
verdicts.

## 10. Profiles

### 10.1 `standard`

Blocks:

- missing PR head SHA;
- missing changed files;
- package or lockfile changes without same-head CI evidence;
- workflow changes without same-head CI evidence;
- product code changes without same-head CI evidence.

Allows `PASS` when no standard blockers remain.

### 10.2 `crypto-web3`

Includes `standard`.

Additional boundaries:

- contract changes require trusted owner approval;
- deploy boundary changes require trusted owner approval;
- wallet, RPC, signer, provider, key, mnemonic, and secret-related changes
  require trusted owner approval;
- release, governance, funded transaction, BscScan, deploy-ready, or mainnet
  readiness claims are blocked unless a future trusted source explicitly
  supports them.

`manual_fixture` can unlock owner-gated crypto boundaries only in local
fixtures. It cannot unlock them in GitHub Action mode. In GitHub Action mode,
`github_review` can unlock owner-gated crypto boundaries only when the review was
collected by APS-GATE from the GitHub API, targets the current head SHA, and was
submitted by an allowlisted non-bot reviewer who is not the PR author.

### 10.3 `production-sensitive`

Includes `standard`.

Additional behavior:

- runtime, infrastructure, auth, env, migration, deployment, and secret-risk
  changes require same-head checks;
- production-impacting changes require trusted owner approval;
- production readiness claims without trusted owner evidence are blocked;
- ambiguous production-impacting changes must prefer `OWNER_REQUIRED` over
  `PASS`.

## 11. Safe Artifact JSON

Every run writes a safe artifact. Required fields:

```json
{
  "schemaVersion": "0.1.0",
  "tool": "APS-GATE",
  "verdict": "PASS | BLOCKED | OWNER_REQUIRED",
  "mergeAllowed": false,
  "primaryBlocker": "string or null",
  "safeNextAction": "string or null",
  "evidenceHeadSha": "string or null",
  "profileUsed": "standard | crypto-web3 | production-sensitive",
  "forbiddenBoundaryFlags": {},
  "safeArtifactPath": "aps-gate.safe.json",
  "rawLogsRead": false,
  "secretsExposed": false,
  "autoMergeAttempted": false
}
```

Artifact requirements:

- must not include raw logs;
- must not include secrets;
- must not include tokens;
- must not include unbounded GitHub API payloads;
- must preserve one verdict, one blocker, and one next action.

## 12. PR Comment

The rendered comment is intentionally short:

```text
APS-GATE: BLOCKED

Reason:
same-head CI evidence is missing

Safe next action:
rerun required checks on the current PR head

Evidence:
aps-gate.safe.json
```

It must not claim full review, production readiness, legal compliance, YouTube
policy compliance, deploy safety, or audit completion.

## 13. GitHub Metadata Rules

GitHub metadata collection may read:

- PR head SHA;
- changed file names;
- check run conclusions;
- commit status conclusions.
- pull request review approvals.

GitHub metadata collection must not read:

- raw CI logs by default;
- secrets;
- repository write surfaces beyond PR comments.

If the file list cannot be fully collected, APS-GATE must not pass the PR. If a
PR exceeds the current deterministic file listing limit, changed files must be
treated as unavailable rather than partially safe.

## 14. Required Local Verification

Before local APS-GATE work is considered complete, run:

```bash
npm test
npm run demo
npm run harness:check
```

Expected status:

- `npm test`: all unit tests pass;
- `npm run demo`: a fixture can produce a safe artifact and comment;
- `npm run harness:check`: `apsGateHarnessLiteStatus: pass`.

## 15. Release Readiness Gate

Before GitHub repo creation, npm publication, or public launch, APS-GATE must
have:

- this specification present under `docs/process`;
- the Lite harness profile present and passing;
- false PASS tests for same-head evidence, owner approval spoofing, trusted
  approval mismatch, and GitHub Action manual fixture rejection;
- GitHub Action permission review;
- README claim review;
- no external model dependency;
- no auto-merge path;
- no raw log path;
- no secret exposure path.

## 16. Deferred Work

Implemented minimal v0.1 behavior:

- collect GitHub review approvals;
- add `trustedApprovers` allowlist configuration through CLI/Action input;
- reject bot/self approval;
- verify approval applies to the current head SHA;
- generate trusted receipt JSON from GitHub review metadata;

Still deferred:

- add fork PR integration fixtures;
- add action-level dry-run examples.
- support "review after no head update" as an alternative to exact commit
  matching.

GitHub Action mode must continue to return `OWNER_REQUIRED` for owner-gated
boundaries that only have manual fixture approval, self approval, bot approval,
wrong-head approval, or approval by a reviewer outside the allowlist.
