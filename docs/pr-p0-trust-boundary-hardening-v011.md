# fix: harden APS-GATE trust and evidence boundaries

## Current base SHA

`8712bbf527b033d0bc0fcd437df1e4d28089d943`

## Head SHA note

The GitHub PR body is edited after push with the current branch head SHA. This
committed file is the reusable PR body template.

## Scope

- Harden GitHub review trusted approvals with a module-private receipt brand.
- Stop accepting caller-supplied `github_review` JSON as a PASS unlock.
- Make GitHub Action mode authoritative for head SHA, files, checks, author, reviews, and run mode.
- Require explicit same-head required checks for verification-relevant changes.
- Reject APS-GATE as its own required check.
- Add fail-closed classification for tests, scripts, configuration, workflows, CODEOWNERS, action files, and harness/process policy files.
- Require trusted owner approval for security-control changes.
- Add minimal GitHub review state reduction for latest decisive reviewer state.
- Add safe artifact `collectionStatus` fields with bounded reason codes.
- Emit an explicit PR-head-race blocker when metadata collection observes a changed head SHA.
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
- Collection failures disappearing from safe artifacts.
- PR head-race failures using only generic missing-file evidence.

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

Remote CI is expected to attach after each push to the draft PR branch.

## Known remaining limits

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
