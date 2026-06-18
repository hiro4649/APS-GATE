import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { GateResult, SafeArtifact, SCHEMA_VERSION, TOOL_NAME } from "./types";

export function buildSafeArtifact(result: GateResult, safeArtifactPath: string): SafeArtifact {
  return {
    schemaVersion: SCHEMA_VERSION,
    tool: TOOL_NAME,
    verdict: result.verdict,
    mergeAllowed: result.mergeAllowed,
    primaryBlocker: result.primaryBlocker,
    safeNextAction: result.safeNextAction,
    evidenceHeadSha: result.evidenceHeadSha,
    profileUsed: result.profileUsed,
    forbiddenBoundaryFlags: result.forbiddenBoundaryFlags,
    safeArtifactPath,
    rawLogsRead: false,
    secretsExposed: false,
    autoMergeAttempted: false
  };
}

export function writeSafeArtifact(artifact: SafeArtifact, outputPath: string): void {
  ensureParentDirectory(outputPath);
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

function ensureParentDirectory(filePath: string): void {
  const parent = dirname(filePath);
  if (parent && parent !== ".") {
    mkdirSync(parent, { recursive: true });
  }
}
