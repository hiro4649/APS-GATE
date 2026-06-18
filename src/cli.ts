#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildSafeArtifact, writeSafeArtifact } from "./artifact";
import { renderPrComment } from "./comment";
import { evaluateGate } from "./gate";
import { collectGithubPullRequestInput, postPullRequestComment } from "./github";
import { CheckEvidence, GateInput, ProfileName, SafeArtifact } from "./types";

interface ParsedArgs {
  command: string;
  flags: Map<string, string[]>;
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`APS-GATE error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  if (parsed.command === "help" || parsed.flags.has("help")) {
    printHelp();
    return;
  }

  if (parsed.command !== "evaluate") {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const input = await buildGateInput(parsed);
  const outputPath = getStringFlag(parsed, "output") ?? "aps-gate.safe.json";
  const commentPath = getStringFlag(parsed, "comment-output");
  const result = evaluateGate(input);
  const artifact = buildSafeArtifact(result, outputPath);
  const comment = renderPrComment(artifact);

  writeSafeArtifact(artifact, outputPath);
  if (commentPath) {
    writeTextFile(commentPath, `${comment}\n`);
  }

  if (getBooleanFlag(parsed, "post-comment")) {
    try {
      await postPullRequestComment(comment, getStringFlag(parsed, "github-token") ?? process.env.GITHUB_TOKEN);
    } catch (error) {
      console.warn(`APS-GATE warning: could not post PR comment: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(comment);

  if (!artifact.mergeAllowed && !getBooleanFlag(parsed, "no-fail-on-blocked")) {
    process.exitCode = 2;
  }
}

async function buildGateInput(parsed: ParsedArgs): Promise<GateInput> {
  const inputPath = getStringFlag(parsed, "input");
  const input: GateInput = inputPath ? (readJsonFile(inputPath) as GateInput) : {};

  const profile = getStringFlag(parsed, "profile") ?? process.env.APS_GATE_PROFILE;
  if (profile) {
    input.profile = profile as ProfileName;
  }

  const trustedApprovers = getListFlag(parsed, "trusted-approver");
  if (trustedApprovers.length > 0) {
    input.trustedApprovers = trustedApprovers;
  }

  if (input.trustedApproval?.source === "github_review") {
    delete input.trustedApproval;
  }

  if (getBooleanFlag(parsed, "from-github")) {
    const githubInput = await collectGithubPullRequestInput(
      getStringFlag(parsed, "github-token") ?? process.env.GITHUB_TOKEN,
      {
        profile: input.profile,
        trustedApprovers: input.trustedApprovers
      }
    );
    mergeMissing(input, githubInput);
    if (githubInput.trustedApproval) {
      input.trustedApproval = githubInput.trustedApproval;
    }
    input.prAuthor ??= githubInput.prAuthor;
    input.runMode = "github_action";
  }

  const existingArtifactPath = getStringFlag(parsed, "existing-artifact");
  if (existingArtifactPath) {
    input.existingArtifact = readJsonFile(existingArtifactPath) as Partial<SafeArtifact>;
  }

  const runMode = getStringFlag(parsed, "run-mode");
  if (runMode && !getBooleanFlag(parsed, "from-github")) {
    input.runMode = runMode === "github_action" ? "github_action" : "local";
  }

  const headSha = getStringFlag(parsed, "head-sha");
  if (headSha) {
    input.headSha = headSha;
  }

  const changedFiles = readChangedFiles(parsed);
  if (changedFiles) {
    input.changedFiles = changedFiles;
  }

  const checks = readChecks(parsed);
  if (checks) {
    input.checks = checks;
  }

  const requiredChecks = getListFlag(parsed, "required-check");
  if (requiredChecks.length > 0) {
    input.requiredChecks = requiredChecks;
  }

  return input;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "help";
  const startIndex = command === "help" ? 0 : 1;
  const flags = new Map<string, string[]>();

  for (let index = startIndex; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }

    const name = arg.slice(2);
    const next = argv[index + 1];
    const value = next && !next.startsWith("--") ? next : "true";
    if (value === next) {
      index += 1;
    }
    flags.set(name, [...(flags.get(name) ?? []), value]);
  }

  return { command, flags };
}

function readChangedFiles(parsed: ParsedArgs): string[] | null {
  const changedFilesFile = getStringFlag(parsed, "changed-files-file");
  if (changedFilesFile) {
    return splitList(readFileSync(changedFilesFile, "utf8"));
  }

  const changedFiles = getStringFlag(parsed, "changed-files");
  return changedFiles ? splitList(changedFiles) : null;
}

function readChecks(parsed: ParsedArgs): CheckEvidence[] | null {
  const checksFile = getStringFlag(parsed, "checks-file");
  if (checksFile) {
    return coerceChecks(readJsonFile(checksFile));
  }

  const checksJson = getStringFlag(parsed, "checks-json");
  return checksJson ? coerceChecks(JSON.parse(checksJson)) : null;
}

function coerceChecks(value: unknown): CheckEvidence[] {
  if (Array.isArray(value)) {
    return value as CheckEvidence[];
  }

  if (value && typeof value === "object" && Array.isArray((value as { checks?: unknown }).checks)) {
    return (value as { checks: CheckEvidence[] }).checks;
  }

  throw new Error("checks input must be an array or an object with a checks array");
}

function mergeMissing(target: GateInput, source: Partial<GateInput>): void {
  target.headSha ??= source.headSha;
  target.changedFiles ??= source.changedFiles;
  target.checks ??= source.checks;
}

function getStringFlag(parsed: ParsedArgs, name: string): string | null {
  const values = parsed.flags.get(name);
  return values && values.length > 0 ? values[values.length - 1] : null;
}

function getBooleanFlag(parsed: ParsedArgs, name: string): boolean {
  return getStringFlag(parsed, name) === "true";
}

function getListFlag(parsed: ParsedArgs, name: string): string[] {
  return (parsed.flags.get(name) ?? []).flatMap(splitList).filter(Boolean);
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeTextFile(filePath: string, body: string): void {
  const parent = dirname(filePath);
  if (parent && parent !== ".") {
    mkdirSync(parent, { recursive: true });
  }
  writeFileSync(filePath, body, "utf8");
}

function printHelp(): void {
  console.log(`APS-GATE

Usage:
  aps-gate evaluate --input pr-input.json --output aps-gate.safe.json

Inputs:
  --profile standard|crypto-web3|production-sensitive
  --head-sha <sha>
  --changed-files <comma-or-newline-list>
  --changed-files-file <path>
  --checks-json <json>
  --checks-file <path>
  --required-check <name>        repeatable or comma-separated
  --trusted-approver <login>     repeatable or comma-separated
  --existing-artifact <path>
  --from-github                 read pull_request metadata through GitHub API
  --run-mode local|github_action
  --post-comment                post the short PR comment when GitHub context exists
  --comment-output <path>
  --no-fail-on-blocked
`);
}
