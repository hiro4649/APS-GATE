import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { buildSafeArtifact } from "../src/artifact";
import { renderPrComment } from "../src/comment";
import { evaluateGate } from "../src/gate";
import { collectGithubPullRequestInput } from "../src/github";
import { createGithubReviewApprovalReceipt } from "../src/trusted-approval";
import { CollectionReasonCode, GateInput, TrustedApproval } from "../src/types";

const trustedCryptoApproval: TrustedApproval = {
  source: "manual_fixture",
  approver: "hiro4649",
  headSha: "abc",
  profile: "crypto-web3",
  decision: "approved",
  reason: "Owner accepted contract metadata-only fixture change",
  createdAt: "2026-06-18T00:00:00Z"
};

function cryptoContractInput(overrides: Partial<GateInput> = {}): GateInput {
  return {
    profile: "crypto-web3",
    runMode: "local",
    headSha: "abc",
    changedFiles: ["contracts/Vault.sol"],
    checks: [{ name: "test", conclusion: "success", headSha: "abc" }],
    requiredChecks: ["test"],
    ...overrides
  };
}

type MockRoute = (path: string) => unknown;

async function withMockGithub<T>(route: MockRoute, run: () => Promise<T>): Promise<T> {
  const previousFetch = globalThis.fetch;
  const previousEventPath = process.env.GITHUB_EVENT_PATH;
  const previousRepository = process.env.GITHUB_REPOSITORY;
  const tempDir = mkdtempSync(join(tmpdir(), "aps-gate-github-"));
  const eventPath = join(tempDir, "event.json");

  writeFileSync(
    eventPath,
    `${JSON.stringify({
      number: 12,
      pull_request: {
        number: 12,
        head: { sha: "abc" },
        user: { login: "contributor" }
      }
    })}\n`,
    "utf8"
  );

  process.env.GITHUB_EVENT_PATH = eventPath;
  process.env.GITHUB_REPOSITORY = "owner/repo";
  globalThis.fetch = (async (url: string | URL | Request) => {
    const path = new URL(url.toString()).pathname + new URL(url.toString()).search;
    const body = route(path);
    if (body instanceof Error) {
      return new Response(JSON.stringify({ message: body.message }), { status: 500, statusText: "Internal Server Error" });
    }
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;

  try {
    return await run();
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("GITHUB_EVENT_PATH", previousEventPath);
    restoreEnv("GITHUB_REPOSITORY", previousRepository);
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function headResponse(headSha = "abc"): unknown {
  return { head: { sha: headSha }, user: { login: "contributor" } };
}

function successfulChecksResponse(): unknown {
  return {
    total_count: 1,
    check_runs: [{ name: "test", status: "completed", conclusion: "success", head_sha: "abc" }]
  };
}

function statusesResponse(): unknown {
  return { statuses: [] };
}

async function assertGithubCollectionReason(route: MockRoute, expectedReason: CollectionReasonCode): Promise<void> {
  await withMockGithub(route, async () => {
    const input = await collectGithubPullRequestInput("token", {
      profile: "crypto-web3",
      trustedApprovers: ["hiro4649"]
    });
    assert.equal(input.collectionStatus?.reasonCode, expectedReason);
    assert.equal(input.collectionStatus?.status, expectedReason === "OK" ? "complete" : "incomplete");
  });
}

test("standard passes product code with same-head CI evidence", () => {
  const result = evaluateGate({
    profile: "standard",
    headSha: "abc",
    changedFiles: ["src/app.ts"],
    checks: [{ name: "test", conclusion: "success", headSha: "abc" }],
    requiredChecks: ["test"]
  });

  assert.equal(result.verdict, "PASS");
  assert.equal(result.mergeAllowed, true);
  assert.equal(result.primaryBlocker, null);
  assert.equal(result.forbiddenBoundaryFlags.productCodeChanged, true);
});

test("standard blocks package changes without same-head CI evidence", () => {
  const result = evaluateGate({
    profile: "standard",
    headSha: "abc",
    changedFiles: ["package.json", "package-lock.json"],
    checks: [],
    requiredChecks: ["test"]
  });

  assert.equal(result.verdict, "BLOCKED");
  assert.equal(result.mergeAllowed, false);
  assert.equal(result.primaryBlocker, "package or lockfile changed without same-head CI evidence");
  assert.equal(result.safeNextAction, "rerun required checks on the current PR head");
});

test("standard does not accept successful checks without matching head SHA", () => {
  const result = evaluateGate({
    profile: "standard",
    headSha: "abc",
    changedFiles: ["src/app.ts"],
    checks: [{ name: "test", conclusion: "success" }],
    requiredChecks: ["test"]
  });

  assert.equal(result.verdict, "BLOCKED");
  assert.equal(result.primaryBlocker, "same-head CI evidence is missing");
});

test("empty requiredChecks blocks verification-relevant changes", () => {
  const result = evaluateGate({
    profile: "standard",
    headSha: "abc",
    changedFiles: ["src/app.ts"],
    checks: [{ name: "test", conclusion: "success", headSha: "abc" }]
  });

  assert.equal(result.verdict, "BLOCKED");
  assert.equal(result.primaryBlocker, "required checks are not configured for verification-relevant changes");
});

test("unrelated successful check cannot satisfy required checks", () => {
  const result = evaluateGate({
    profile: "standard",
    headSha: "abc",
    changedFiles: ["src/app.ts"],
    checks: [{ name: "lint", conclusion: "success", headSha: "abc" }],
    requiredChecks: ["test"]
  });

  assert.equal(result.verdict, "BLOCKED");
  assert.equal(result.primaryBlocker, "same-head CI evidence is missing");
});

test("APS-GATE cannot satisfy its own required check", () => {
  const result = evaluateGate({
    profile: "standard",
    headSha: "abc",
    changedFiles: ["src/app.ts"],
    checks: [{ name: "APS-GATE", conclusion: "success", headSha: "abc" }],
    requiredChecks: ["APS-GATE"]
  });

  assert.equal(result.verdict, "BLOCKED");
  assert.equal(result.primaryBlocker, "APS-GATE cannot be used as its own required check");
});

test("workflow security control changes require trusted approval and checks", () => {
  const result = evaluateGate({
    profile: "standard",
    headSha: "abc",
    changedFiles: [".github/workflows/ci.yml"],
    checks: [{ name: "test", conclusion: "success", headSha: "abc" }],
    requiredChecks: ["test"]
  });

  assert.equal(result.verdict, "OWNER_REQUIRED");
  assert.equal(result.primaryBlocker, "security control change requires trusted owner approval");
  assert.equal(result.forbiddenBoundaryFlags.securityControlChanged, true);
  assert.equal(result.forbiddenBoundaryFlags.verificationRelevantChanged, true);
});

test("crypto-web3 requires owner approval for contract changes", () => {
  const result = evaluateGate(cryptoContractInput());

  assert.equal(result.verdict, "OWNER_REQUIRED");
  assert.equal(result.mergeAllowed, false);
  assert.equal(result.primaryBlocker, "contract changes require owner approval");
  assert.equal(result.forbiddenBoundaryFlags.contractTouched, true);
});

test("spoofed policyEvidence ownerApproval remains OWNER_REQUIRED", () => {
  const result = evaluateGate(
    cryptoContractInput({
      policyEvidence: {
        ownerApproval: true,
        contractOwnerApproval: true
      }
    })
  );

  assert.equal(result.verdict, "OWNER_REQUIRED");
  assert.equal(result.primaryBlocker, "contract changes require owner approval");
});

test("untrusted policyEvidence cannot unlock PASS", () => {
  const result = evaluateGate({
    profile: "standard",
    headSha: "abc",
    changedFiles: ["src/app.ts"],
    checks: [],
    requiredChecks: ["test"],
    policyEvidence: {
      sameHeadCiEvidence: true,
      packageChangeEvidence: true,
      workflowChangeEvidence: true
    }
  });

  assert.equal(result.verdict, "BLOCKED");
  assert.equal(result.primaryBlocker, "same-head CI evidence is missing");
});

test("PR head changes during evidence collection block with structured status", () => {
  const result = evaluateGate({
    profile: "standard",
    headSha: "abc",
    changedFiles: null,
    checks: [],
    requiredChecks: ["test"],
    collectionStatus: {
      status: "incomplete",
      reasonCode: "PR_HEAD_CHANGED_DURING_EVIDENCE_COLLECTION",
      requiredChecksConfigured: true,
      requiredChecksSatisfied: false,
      fileListComplete: false,
      checkListComplete: false,
      reviewListComplete: false,
      approvalReceiptPresent: false
    }
  });

  assert.equal(result.verdict, "BLOCKED");
  assert.equal(result.primaryBlocker, "PR head changed during evidence collection");
  assert.equal(result.safeNextAction, "rerun APS-GATE on the current PR head");
  assert.equal(result.collectionStatus.reasonCode, "PR_HEAD_CHANGED_DURING_EVIDENCE_COLLECTION");
  assert.equal(result.collectionStatus.fileListComplete, false);
});

test("GitHub collection records PR head race without mixing evidence", async () => {
  let headReads = 0;
  await assertGithubCollectionReason((path) => {
    if (path === "/repos/owner/repo/pulls/12") {
      headReads += 1;
      return headResponse(headReads === 1 ? "abc" : "def");
    }
    if (path.startsWith("/repos/owner/repo/pulls/12/files?")) {
      return [{ filename: "src/app.ts" }];
    }
    if (path.startsWith("/repos/owner/repo/commits/abc/check-runs?")) {
      return successfulChecksResponse();
    }
    if (path === "/repos/owner/repo/commits/abc/status") {
      return statusesResponse();
    }
    if (path.startsWith("/repos/owner/repo/pulls/12/reviews?")) {
      return [];
    }
    throw new Error(`unexpected GitHub mock path: ${path}`);
  }, "PR_HEAD_CHANGED_DURING_EVIDENCE_COLLECTION");
});

test("GitHub collection records file list pagination truncation", async () => {
  await assertGithubCollectionReason((path) => {
    if (path === "/repos/owner/repo/pulls/12") {
      return headResponse();
    }
    if (path.startsWith("/repos/owner/repo/pulls/12/files?")) {
      return Array.from({ length: 100 }, (_, index) => ({ filename: `src/file-${index}.ts` }));
    }
    if (path.startsWith("/repos/owner/repo/commits/abc/check-runs?")) {
      return successfulChecksResponse();
    }
    if (path === "/repos/owner/repo/commits/abc/status") {
      return statusesResponse();
    }
    if (path.startsWith("/repos/owner/repo/pulls/12/reviews?")) {
      return [];
    }
    throw new Error(`unexpected GitHub mock path: ${path}`);
  }, "FILE_LIST_INCOMPLETE");
});

test("GitHub collection records check-run pagination truncation", async () => {
  await assertGithubCollectionReason((path) => {
    if (path === "/repos/owner/repo/pulls/12") {
      return headResponse();
    }
    if (path.startsWith("/repos/owner/repo/pulls/12/files?")) {
      return [{ filename: "src/app.ts" }];
    }
    if (path.startsWith("/repos/owner/repo/commits/abc/check-runs?")) {
      return {
        total_count: 3001,
        check_runs: Array.from({ length: 100 }, (_, index) => ({
          name: `test-${index}`,
          status: "completed",
          conclusion: "success",
          head_sha: "abc"
        }))
      };
    }
    if (path === "/repos/owner/repo/commits/abc/status") {
      return statusesResponse();
    }
    if (path.startsWith("/repos/owner/repo/pulls/12/reviews?")) {
      return [];
    }
    throw new Error(`unexpected GitHub mock path: ${path}`);
  }, "CHECK_LIST_INCOMPLETE");
});

test("GitHub collection records review pagination truncation", async () => {
  await assertGithubCollectionReason((path) => {
    if (path === "/repos/owner/repo/pulls/12") {
      return headResponse();
    }
    if (path.startsWith("/repos/owner/repo/pulls/12/files?")) {
      return [{ filename: "contracts/Vault.sol" }];
    }
    if (path.startsWith("/repos/owner/repo/commits/abc/check-runs?")) {
      return successfulChecksResponse();
    }
    if (path === "/repos/owner/repo/commits/abc/status") {
      return statusesResponse();
    }
    if (path.startsWith("/repos/owner/repo/pulls/12/reviews?")) {
      return Array.from({ length: 100 }, (_, index) => ({
        id: index,
        state: "COMMENTED",
        body: "bounded mock review",
        submitted_at: "2026-06-18T00:00:00Z",
        commit_id: "abc",
        user: { login: `reviewer-${index}`, type: "User" }
      }));
    }
    throw new Error(`unexpected GitHub mock path: ${path}`);
  }, "REVIEW_LIST_INCOMPLETE");
});

test("trustedApproval with wrong head SHA remains OWNER_REQUIRED", () => {
  const result = evaluateGate(
    cryptoContractInput({
      trustedApproval: {
        ...trustedCryptoApproval,
        headSha: "def"
      }
    })
  );

  assert.equal(result.verdict, "OWNER_REQUIRED");
  assert.equal(result.primaryBlocker, "contract changes require owner approval");
});

test("trustedApproval with wrong profile remains OWNER_REQUIRED", () => {
  const result = evaluateGate(
    cryptoContractInput({
      trustedApproval: {
        ...trustedCryptoApproval,
        profile: "production-sensitive"
      }
    })
  );

  assert.equal(result.verdict, "OWNER_REQUIRED");
  assert.equal(result.primaryBlocker, "contract changes require owner approval");
});

test("trusted manual fixture approval unlocks owner boundary only in local mode", () => {
  const localResult = evaluateGate(
    cryptoContractInput({
      trustedApproval: trustedCryptoApproval
    })
  );
  const githubActionResult = evaluateGate(
    cryptoContractInput({
      runMode: "github_action",
      trustedApproval: trustedCryptoApproval
    })
  );

  assert.equal(localResult.verdict, "PASS");
  assert.equal(localResult.mergeAllowed, true);
  assert.equal(githubActionResult.verdict, "OWNER_REQUIRED");
  assert.equal(githubActionResult.primaryBlocker, "contract changes require owner approval");
});

test("github_review approval without GitHub API collection remains OWNER_REQUIRED", () => {
  const result = evaluateGate(
    cryptoContractInput({
      runMode: "github_action",
      trustedApprovers: ["hiro4649"],
      trustedApproval: {
        source: "github_review",
        approver: "hiro4649",
        headSha: "abc",
        profile: "crypto-web3",
        decision: "approved",
        reason: "Spoofed JSON review approval",
        createdAt: "2026-06-18T00:00:00Z"
      }
    })
  );

  assert.equal(result.verdict, "OWNER_REQUIRED");
  assert.equal(result.primaryBlocker, "contract changes require owner approval");
});

test("github_review approval requires trusted approver allowlist", () => {
  const result = evaluateGate(
    cryptoContractInput({
      runMode: "github_action",
      trustedApprovers: ["owner-a"],
      trustedApproval: {
        source: "github_review",
        collectionSource: "github_api",
        approver: "owner-b",
        headSha: "abc",
        profile: "crypto-web3",
        decision: "approved",
        reason: "GitHub review approval by a trusted approver for the current PR head",
        createdAt: "2026-06-18T00:00:00Z"
      }
    })
  );

  assert.equal(result.verdict, "OWNER_REQUIRED");
  assert.equal(result.primaryBlocker, "contract changes require owner approval");
});

test("github_review approval rejects self approval", () => {
  const result = evaluateGate(
    cryptoContractInput({
      runMode: "github_action",
      prAuthor: "hiro4649",
      trustedApprovers: ["hiro4649"],
      trustedApproval: {
        ...createGithubReviewApprovalReceipt({
          source: "github_review",
          collectionSource: "github_api",
          approver: "hiro4649",
          headSha: "abc",
          profile: "crypto-web3",
          decision: "approved",
          reason: "GitHub review approval by a trusted approver for the current PR head",
          createdAt: "2026-06-18T00:00:00Z"
        })
      }
    })
  );

  assert.equal(result.verdict, "OWNER_REQUIRED");
  assert.equal(result.primaryBlocker, "contract changes require owner approval");
});

test("github_review approval rejects bot-like approval", () => {
  const result = evaluateGate(
    cryptoContractInput({
      runMode: "github_action",
      prAuthor: "contributor",
      trustedApprovers: ["aps-bot[bot]"],
      trustedApproval: {
        source: "github_review",
        collectionSource: "github_api",
        approver: "aps-bot[bot]",
        headSha: "abc",
        profile: "crypto-web3",
        decision: "approved",
        reason: "GitHub review approval by a trusted approver for the current PR head",
        createdAt: "2026-06-18T00:00:00Z"
      }
    })
  );

  assert.equal(result.verdict, "OWNER_REQUIRED");
  assert.equal(result.primaryBlocker, "contract changes require owner approval");
});

test("github_review approval from trusted approver unlocks owner boundary in GitHub Action mode", () => {
  const result = evaluateGate(
    cryptoContractInput({
      runMode: "github_action",
      prAuthor: "contributor",
      trustedApprovers: ["hiro4649"],
      trustedApproval: createGithubReviewApprovalReceipt({
        source: "github_review",
        collectionSource: "github_api",
        approver: "hiro4649",
        headSha: "abc",
        profile: "crypto-web3",
        decision: "approved",
        reason: "GitHub review approval by a trusted approver for the current PR head",
        createdAt: "2026-06-18T00:00:00Z"
      })
    })
  );

  assert.equal(result.verdict, "PASS");
  assert.equal(result.mergeAllowed, true);
});

test("CLI strips user-supplied github_review approval JSON", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "aps-gate-cli-"));
  const inputPath = join(tempDir, "input.json");
  const outputPath = join(tempDir, "aps-gate.safe.json");
  const cliPath = resolve(__dirname, "../src/cli.js");

  writeFileSync(
    inputPath,
    `${JSON.stringify(
      cryptoContractInput({
        runMode: "github_action",
        trustedApprovers: ["hiro4649"],
        trustedApproval: {
          source: "github_review",
          collectionSource: "github_api",
          approver: "hiro4649",
          headSha: "abc",
          profile: "crypto-web3",
          decision: "approved",
          reason: "Spoofed user-supplied GitHub review",
          createdAt: "2026-06-18T00:00:00Z"
        }
      }),
      null,
      2
    )}\n`,
    "utf8"
  );

  const result = spawnSync(process.execPath, [
    cliPath,
    "evaluate",
    "--input",
    inputPath,
    "--output",
    outputPath,
    "--no-fail-on-blocked"
  ]);

  assert.equal(result.status, 0);
  assert.match(result.stdout.toString("utf8"), /APS-GATE: OWNER_REQUIRED/);
});

test("production-sensitive blocks runtime changes without same-head checks", () => {
  const result = evaluateGate({
    profile: "production-sensitive",
    headSha: "abc",
    changedFiles: ["Dockerfile"],
    checks: []
  });

  assert.equal(result.verdict, "BLOCKED");
  assert.equal(result.primaryBlocker, "production-impacting change lacks same-head check evidence");
  assert.equal(result.forbiddenBoundaryFlags.runtimeChanged, true);
});

test("production-sensitive treats Dockerfile variants as runtime changes", () => {
  const result = evaluateGate({
    profile: "production-sensitive",
    headSha: "abc",
    changedFiles: ["Dockerfile.prod"],
    checks: []
  });

  assert.equal(result.verdict, "BLOCKED");
  assert.equal(result.forbiddenBoundaryFlags.runtimeChanged, true);
});

test("artifact and PR comment keep one verdict, reason, action, and evidence path", () => {
  const result = evaluateGate({
    profile: "standard",
    headSha: "abc",
    changedFiles: ["src/app.ts"],
    checks: [{ name: "test", conclusion: "success", headSha: "abc" }],
    requiredChecks: ["test"]
  });
  const artifact = buildSafeArtifact(result, "aps-gate.safe.json");
  const comment = renderPrComment(artifact);

  assert.equal(artifact.schemaVersion, "0.1.0");
  assert.equal(artifact.tool, "APS-GATE");
  assert.equal(artifact.rawLogsRead, false);
  assert.equal(artifact.secretsExposed, false);
  assert.equal(artifact.autoMergeAttempted, false);
  assert.deepEqual(artifact.collectionStatus, {
    status: "complete",
    reasonCode: "OK",
    requiredChecksConfigured: true,
    requiredChecksSatisfied: true,
    fileListComplete: true,
    checkListComplete: true,
    reviewListComplete: true,
    approvalReceiptPresent: false
  });
  assert.match(comment, /^APS-GATE: PASS/);
  assert.match(comment, /Evidence:\naps-gate\.safe\.json/);
});
