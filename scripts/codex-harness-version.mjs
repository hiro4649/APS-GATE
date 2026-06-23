#!/usr/bin/env node
// CODEX_QUALITY_HARNESS_FILE v1.2.8

export const currentVersion = '1.2.8';
export const previousVersion = '1.2.6';
export const activeSelfTestStatusKey = 'v128SelfTestStatus';
export const activeSelfTestSuite = 'v128';
export const legacyAdvisorySuites = ['v127', 'v126', 'v125', 'v124', 'v123', 'v122', 'v121', 'v120', 'v119', 'v118', 'v117', 'v116', 'v115', 'v114', 'v113'];
export const versionLineagePolicy = { sourceOnlyRelease: false, targetRollout: 'completed', rolloutClass: 'metadata_light', materialization: 'metadata_light_target_active_path', previousRollbackAvailable: true, sourceFullBundleCopied: false, workflowChanged: false, productCodeChanged: false, packageOrLockfileChanged: false, routineColdArtifactRead: 0, routineSelectedSkillMax: 1, routineReviewerFanout: 0, runtimeReadinessClaimed: false, productionReadinessClaimed: false, safeSummaryOnly: true };
export function buildHarnessVersionRegistry() { return { currentVersion, previousVersion, activeSelfTestStatusKey, activeSelfTestSuite, legacyAdvisorySuites, versionLineagePolicy, safeSummaryOnly: true }; }
if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(buildHarnessVersionRegistry(), null, 2));
