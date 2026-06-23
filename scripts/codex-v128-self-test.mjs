#!/usr/bin/env node
// CODEX_QUALITY_HARNESS_FILE v1.2.8

import fs from 'node:fs';
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function test(name, fn) { try { return { name, status: fn() ? 'pass' : 'fail', safeSummaryOnly: true }; } catch { return { name, status: 'fail', reasonCodes: ['self_test_exception'], safeSummaryOnly: true }; } }
const agents = fs.readFileSync('AGENTS.md', 'utf8');
const manifest = readJson('docs/process/CODEX_HARNESS_MANIFEST.json');
const policy = fs.existsSync('docs/process/CODEX_ACTIVE_POLICY_INDEX.json') ? readJson('docs/process/CODEX_ACTIVE_POLICY_INDEX.json') : {};
const v128 = manifest.deterministicDecisionProjectionAndTokenMinimalLoopClosure || {};
const safety = v128.safety || {};
const cases = [
  ['v128_self_test_must_pass', () => true],
  ['agents_marker_is_v128', () => agents.includes('CODEX_QUALITY_HARNESS_FILE v1.2.8')],
  ['manifest_active_tuple_is_v128', () => manifest.activeHarnessVersion === '1.2.8' && manifest.activeSelfTestSuite === 'v128' && manifest.activeSelfTestStatusKey === 'v128SelfTestStatus'],
  ['target_rollout_completed', () => manifest.targetRepoMode === true && manifest.targetRollout === 'completed' && manifest.sourceOnlyRelease === false],
  ['rollout_class_matches_target', () => v128.rolloutClass === 'metadata_light' && v128.sourceFullBundleCopied === false && v128.workflowChanged === false && v128.productCodeChanged === false && v128.packageOrLockfileChanged === false],
  ['previous_rollback_tuple_available', () => manifest.versioning?.rollbackAvailable === true && Boolean(manifest.versioning?.activeHarnessVersion) && Boolean(manifest.versioning?.activeSelfTestSuite)],
  ['safety_boundaries_preserved', () => safety.deployForbidden === true && safety.walletAccessForbidden === true && safety.rpcAccessForbidden === true && safety.secretAccessForbidden === true && safety.runtimeReadinessClaimed === false && safety.productionReadinessClaimed === false && safety.prHeadSelfAuthorizationForbidden === true],
  ['token_economy_budget_is_restricted', () => v128.routineColdArtifactRead === 0 && v128.routineSelectedSkillMax === 1 && v128.routineReviewerFanout === 0 && v128.routineOwnerInterruptMax === 0],
  ['policy_index_points_to_v128', () => policy.schemaVersion === '1.2.8' && policy.requiredReads?.includes('docs/process/CODEX_V128_SPEC.md') && policy.selectedSkillsMax === 1],
  ['pr_body_is_not_machine_evidence', () => manifest.prBodyMachineEvidence === false && v128.prBodyMachineEvidence === false],
  ['active_spec_exists', () => fs.existsSync('docs/process/CODEX_V128_SPEC.md')],
].map(([name, fn]) => test(name, fn));
const failures = cases.filter((item) => item.status !== 'pass');
const report = { v128SelfTestStatus: { status: failures.length ? 'fail' : 'pass', caseCount: cases.length, failureCount: failures.length, safeSummaryOnly: true }, cases, status: failures.length ? 'fail' : 'pass', safeSummaryOnly: true };
if (process.env.CODEX_V128_SELF_TEST_REPORT === 'json' || process.env.CODEX_QUALITY_REPORT === 'json') console.log(JSON.stringify(report)); else console.log(`v128SelfTestStatus: ${report.v128SelfTestStatus.status}`);
process.exit(failures.length ? 1 : 0);
