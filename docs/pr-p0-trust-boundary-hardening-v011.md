# fix: harden APS-GATE trust and evidence boundaries

## Current base SHA

`8712bbf527b033d0bc0fcd437df1e4d28089d943`

## Current head SHA

`b8bc8bb409010b032da874c184b2d2a0834a52db`

## Scope

- Harden GitHub review trusted approvals with a module-private receipt brand.
- Stop accepting caller-supplied `github_review` JSON as a PASS unlock.
- Make GitHub Action mode authoritative for head SHA, files, checks, author, reviews, and run mode.
- Require explicit same-head required checks for verification-relevant changes.
- Reject APS-GATE as its own required check.
- Add fail-closed classification for tests, scripts, configuration, workflows, CODEOWNERS, action files, and harness/process policy files.
- Require trusted owner approval for security-control changes.
- Add minimal GitHub review state reduction for latest decisive reviewer state.
- Add pinned CI and CODEOWNERS.
- Add public package metadata and MIT license.

## Threats closed

- Direct library `github_review` spoof.
- Input JSON `github_review` spoof.
- Caller-supplied `collectionSource: github_api` spoof.
- `--from-github` mixed with trust-sensitive CLI overrides.
- Empty required checks allowing code or verification-relevant changes to PASS.
- Unrelated successful checks satisfying evidence.
- APS-GATE check satisfying APS-GATE evidence.
- Workflow/policy changes passing with checks alone.
- Historical approval passing after later decisive review state.
- Self or bot review approval.
- Review approval without current-head binding.
- Review approval without explicit bounded APS-GATE marker.
- Check-run pagination truncation.

## Tests run

- `npm ci`
- `npm test`
- `npm run demo`
- `npm run harness:check`
- `npm pack --dry-run`
- `git diff --check`
- clean build validation: remove `dist`, then `npm run build`
- post-clean `npm test`

## Remote evidence status

Remote CI is not yet attached to this branch at PR body creation time. It should attach after push and draft PR creation.

## Known remaining limits

- Collection failures currently fail closed by withholding evidence, but the safe artifact does not yet include all requested structured `collectionStatus` fields.
- Head-race protection blocks evidence mixing by returning incomplete evidence, but it does not yet emit the exact requested blocker text.
- Status collection uses the combined status endpoint; check run collection is paginated.
- Review marker parsing is intentionally bounded and does not echo review bodies.
- GitHub App slug or ID provenance is not yet bound into required check evidence.
- Fork PR integration is not covered by a mocked HTTP integration suite yet.

## No auto-merge

This PR does not merge or enable auto-merge.

## No release

This PR does not create a GitHub release or tag.

## No npm publish

This PR does not publish to npm.

## No production-readiness claim

`PASS` only means the APS-GATE policy and evidence gate passed. It does not mean the code is correct, vulnerability-free, audited, suitable for production use, legally compliant, or deploy-safe.
