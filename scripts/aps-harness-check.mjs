#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function readJson(file) {
  return JSON.parse(read(file));
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function requireFile(file) {
  if (!exists(file)) failures.push(`${file}=missing`);
}

function requireText(file, text) {
  if (!read(file).includes(text)) failures.push(`${file}=missing_text:${text}`);
}

function rejectText(file, text) {
  if (exists(file) && read(file).includes(text)) failures.push(`${file}=forbidden_text:${text}`);
}

function requireJsonValue(file, key, expected) {
  const value = key.split(".").reduce((obj, part) => obj?.[part], readJson(file));
  if (value !== expected) failures.push(`${file}:${key}=${JSON.stringify(value)} expected ${JSON.stringify(expected)}`);
}

function packageHasNoModelDependency() {
  const pkg = readJson("package.json");
  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {})
  };
  const forbidden = Object.keys(deps).filter((name) =>
    /openai|anthropic|langchain|llama|ollama|flue|ai-sdk|model/i.test(name)
  );
  if (forbidden.length) failures.push(`package.json=forbidden_model_dependencies:${forbidden.join(",")}`);
  if (!pkg.scripts?.test) failures.push("package.json=scripts.test_missing");
  if (!pkg.scripts?.demo) failures.push("package.json=scripts.demo_missing");
  if (pkg.scripts?.["harness:check"] !== "node scripts/aps-harness-check.mjs") {
    failures.push("package.json=scripts.harness:check_missing_or_changed");
  }
}

function checkActionSafety() {
  const action = read("action.yml");
  const example = read("examples/aps-gate.yml");
  if (/pull_request_target\s*:/.test(example)) failures.push("examples/aps-gate.yml=pull_request_target_forbidden");
  for (const forbiddenPermission of ["contents: write", "actions: write", "id-token: write", "secrets: write"]) {
    if (example.includes(forbiddenPermission)) failures.push(`examples/aps-gate.yml=forbidden_permission:${forbiddenPermission}`);
  }
  for (const required of ["contents: read", "pull-requests: write", "checks: read"]) {
    if (!example.includes(required)) failures.push(`examples/aps-gate.yml=missing_permission:${required}`);
  }
  if (!action.includes("--from-github")) failures.push("action.yml=from_github_missing");
  if (!action.includes("--post-comment")) warnings.push("action.yml=post_comment_arg_not_detected");
}

function checkTrustBoundary() {
  requireText("src/types.ts", "trustedApproval");
  requireText("src/types.ts", "runMode");
  requireText("src/profiles/common.ts", "manual fixture approval is not trusted in GitHub Action mode");
  requireText("src/profiles/common.ts", "GitHub review approval was not collected from the GitHub API");
  requireText("src/profiles/common.ts", "GitHub review approver is not in trustedApprovers");
  requireText("tests/gate.test.ts", "spoofed policyEvidence ownerApproval remains OWNER_REQUIRED");
  requireText("tests/gate.test.ts", "trusted manual fixture approval unlocks owner boundary only in local mode");
  requireText("tests/gate.test.ts", "github_review approval from trusted approver unlocks owner boundary in GitHub Action mode");
}

requireFile("AGENTS.md");
requireFile("docs/process/CODEX_HARNESS_MANIFEST.json");
requireFile("docs/process/CODEX_V126_APS_GATE_PROFILE.md");
requireFile("README.md");
requireFile("action.yml");
requireFile("examples/aps-gate.yml");
requireFile("src/gate.ts");
requireFile("src/profiles/common.ts");
requireFile("tests/gate.test.ts");

requireText("AGENTS.md", "CODEX_QUALITY_HARNESS_FILE v1.2.6");
requireText("AGENTS.md", "false PASS");
requireText("README.md", "AI PR Safety Gate");
requireText("README.md", "User-supplied `policyEvidence` is advisory only");
requireText("README.md", "APS-GATE v0 does not read raw logs by default");
rejectText("README.md", "production ready");
rejectText("README.md", "legal compliant");

requireJsonValue("docs/process/CODEX_HARNESS_MANIFEST.json", "activeHarnessVersion", "1.2.6");
requireJsonValue("docs/process/CODEX_HARNESS_MANIFEST.json", "activeSelfTestSuite", "aps-gate-v0");
requireJsonValue("docs/process/CODEX_HARNESS_MANIFEST.json", "forbiddenAuthority.externalLlmForCoreVerdict", false);
requireJsonValue("docs/process/CODEX_HARNESS_MANIFEST.json", "forbiddenAuthority.autoMerge", false);
requireJsonValue("docs/process/CODEX_HARNESS_MANIFEST.json", "policyEvidenceBoundary.userSuppliedPolicyEvidenceTrusted", false);
requireJsonValue("docs/process/CODEX_HARNESS_MANIFEST.json", "compatibility.fullHarnessMatrixInstalled", false);

packageHasNoModelDependency();
checkActionSafety();
checkTrustBoundary();

const status = failures.length ? "fail" : "pass";
const report = {
  marker: "CODEX_QUALITY_HARNESS_FILE v1.2.6",
  profile: "APS_GATE_V126_LITE",
  status,
  failures,
  warnings,
  activeHarnessVersion: "1.2.6",
  activeSelfTestSuite: "aps-gate-v0",
  safeSummaryOnly: true
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`apsGateHarnessLiteStatus: ${status}`);
  console.log("activeHarnessVersion: 1.2.6");
  console.log("activeSelfTestSuite: aps-gate-v0");
  if (warnings.length) console.log(`warnings: ${warnings.join(", ")}`);
  if (failures.length) console.log(`failures: ${failures.join(", ")}`);
}

process.exit(failures.length ? 1 : 0);
