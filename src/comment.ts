import { SafeArtifact } from "./types";

export function renderPrComment(artifact: SafeArtifact): string {
  return [
    `APS-GATE: ${artifact.verdict}`,
    "",
    "Reason:",
    artifact.primaryBlocker ?? "none",
    "",
    "Safe next action:",
    artifact.safeNextAction ?? "none",
    "",
    "Evidence:",
    artifact.safeArtifactPath
  ].join("\n");
}
