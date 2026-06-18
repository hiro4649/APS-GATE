import {
  CheckEvidence,
  CollectionStatus,
  ForbiddenBoundaryFlags,
  GateInput,
  GateResult,
  ProfileName,
  RunMode,
  TrustedApproval,
  Verdict
} from "../types";
import { isGithubReviewApprovalReceipt } from "../trusted-approval";

const CODE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sol",
  ".swift",
  ".ts",
  ".tsx",
  ".vy"
]);

const VERIFICATION_RELEVANT_EXTENSIONS = new Set([
  ...CODE_EXTENSIONS,
  ".bash",
  ".bat",
  ".bicep",
  ".cmd",
  ".gql",
  ".graphql",
  ".hcl",
  ".json",
  ".prisma",
  ".proto",
  ".ps1",
  ".sh",
  ".sql",
  ".toml",
  ".yaml",
  ".yml",
  ".zsh"
]);

export const EMPTY_FLAGS: ForbiddenBoundaryFlags = {
  verificationRelevantChanged: false,
  securityControlChanged: false,
  testsChanged: false,
  configurationChanged: false,
  productCodeChanged: false,
  packageOrLockfileChanged: false,
  workflowChanged: false,
  runtimeChanged: false,
  deployTouched: false,
  walletRpcTouched: false,
  secretRiskTouched: false,
  readinessClaimed: false,
  contractTouched: false,
  migrationTouched: false,
  authTouched: false,
  infrastructureTouched: false,
  releaseTouched: false,
  governanceTouched: false,
  fundedTransactionTouched: false
};

export function classifyChangedFiles(
  changedFiles: string[] | null | undefined,
  claims: string[] = []
): ForbiddenBoundaryFlags {
  const flags = { ...EMPTY_FLAGS };

  for (const rawPath of changedFiles ?? []) {
    const filePath = normalizePath(rawPath);
    const extension = getExtension(filePath);

    if (isPackageOrLockfile(filePath)) {
      flags.packageOrLockfileChanged = true;
      flags.configurationChanged = true;
      flags.verificationRelevantChanged = true;
    }

    if (isWorkflowFile(filePath)) {
      flags.workflowChanged = true;
      flags.securityControlChanged = true;
      flags.configurationChanged = true;
      flags.verificationRelevantChanged = true;
    }

    if (isRuntimeFile(filePath)) {
      flags.runtimeChanged = true;
      flags.infrastructureTouched = true;
      flags.configurationChanged = true;
      flags.verificationRelevantChanged = true;
    }

    if (matches(filePath, /(^|\/)(infra|infrastructure|terraform|k8s|kubernetes|helm|charts)\//)) {
      flags.infrastructureTouched = true;
      flags.configurationChanged = true;
      flags.verificationRelevantChanged = true;
    }

    if (matches(filePath, /(^|\/)(deploy|deployment|deployments|scripts\/deploy|scripts\/release)(\/|\.|-|$)/)) {
      flags.deployTouched = true;
    }

    if (matches(filePath, /(wallet|rpc|signer|provider|private[-_]?key|mnemonic|ethers|web3|wagmi|viem|alchemy|infura)/)) {
      flags.walletRpcTouched = true;
    }

    if (matches(filePath, /(^|\/)\.env($|[./-])|(secret|secrets|token|credential|credentials|private[-_]?key|api[-_]?key|password|vault)/)) {
      flags.secretRiskTouched = true;
    }

    if (matches(filePath, /(^|\/)(contracts?|abi)\//) || extension === ".sol" || extension === ".vy" || matches(filePath, /(^|\/)(hardhat\.config|foundry\.toml|remappings\.txt|subgraph\.yaml)$/)) {
      flags.contractTouched = true;
    }

    if (matches(filePath, /(^|\/)(migrations?|db\/migrations|prisma\/migrations|flyway|liquibase)(\/|$)/)) {
      flags.migrationTouched = true;
      flags.verificationRelevantChanged = true;
    }

    if (matches(filePath, /(auth|oauth|saml|session|jwt|rbac|permission|permissions)/)) {
      flags.authTouched = true;
    }

    if (matches(filePath, /(^|\/)(release|releases)(\/|$)|(^|\/)changelog\.md$|(^|\/)\.github\/workflows\/.*release.*\.ya?ml$/)) {
      flags.releaseTouched = true;
    }

    if (matches(filePath, /(governance|dao|proposal|proposals|snapshot)/)) {
      flags.governanceTouched = true;
    }

    if (matches(filePath, /(funded|treasury|multisig|safe-transaction|safe_transaction|tx-builder|transaction)/)) {
      flags.fundedTransactionTouched = true;
    }

    if (isTestOnlyPath(filePath)) {
      flags.testsChanged = true;
      flags.verificationRelevantChanged = true;
    }

    if (isConfigurationPath(filePath) || VERIFICATION_RELEVANT_EXTENSIONS.has(extension) || isMakefile(filePath)) {
      flags.verificationRelevantChanged = true;
    }

    if (isSecurityControlPath(filePath)) {
      flags.securityControlChanged = true;
      flags.configurationChanged = true;
      flags.verificationRelevantChanged = true;
    }

    if (isConfigurationPath(filePath)) {
      flags.configurationChanged = true;
    }

    if (CODE_EXTENSIONS.has(extension) && !isTestOnlyPath(filePath)) {
      flags.productCodeChanged = true;
    }
  }

  flags.readinessClaimed = claims.some(isReadinessClaim);
  return flags;
}

export function evaluateRequiredInputs(
  input: GateInput,
  profileUsed: ProfileName,
  flags: ForbiddenBoundaryFlags
): GateResult | null {
  if (input.collectionStatus?.reasonCode === "PR_HEAD_CHANGED_DURING_EVIDENCE_COLLECTION") {
    return makeResult(
      "BLOCKED",
      "PR head changed during evidence collection",
      "rerun APS-GATE on the current PR head",
      input,
      profileUsed,
      flags
    );
  }

  if (!input.headSha || input.headSha.trim() === "") {
    return makeResult(
      "BLOCKED",
      "PR head SHA is missing",
      "provide the current PR head SHA before running APS-GATE",
      input,
      profileUsed,
      flags
    );
  }

  if (!Array.isArray(input.changedFiles)) {
    return makeResult(
      "BLOCKED",
      "changed files cannot be determined",
      "rerun APS-GATE with the current PR file list",
      input,
      profileUsed,
      flags
    );
  }

  return null;
}

export function evaluateStandardEvidence(
  input: GateInput,
  profileUsed: ProfileName,
  flags: ForbiddenBoundaryFlags
): GateResult | null {
  const requiredCheckError = validateRequiredChecks(input.requiredChecks ?? []);
  if (requiredCheckError) {
    return makeResult(
      "BLOCKED",
      requiredCheckError,
      "configure required checks that exclude APS-GATE itself",
      input,
      profileUsed,
      flags
    );
  }

  const sameHeadCi = hasSameHeadCheckEvidence(input);

  if (flags.verificationRelevantChanged && (input.requiredChecks ?? []).length === 0) {
    return makeResult(
      "BLOCKED",
      "required checks are not configured for verification-relevant changes",
      "configure explicit required checks for APS-GATE evaluation",
      input,
      profileUsed,
      flags
    );
  }

  if (flags.packageOrLockfileChanged && !sameHeadCi) {
    return makeResult(
      "BLOCKED",
      "package or lockfile changed without same-head CI evidence",
      "rerun required checks on the current PR head",
      input,
      profileUsed,
      flags
    );
  }

  if (flags.workflowChanged && !sameHeadCi) {
    return makeResult(
      "BLOCKED",
      "workflow changed without same-head CI evidence",
      "rerun required checks on the current PR head or add owner evidence for the workflow change",
      input,
      profileUsed,
      flags
    );
  }

  if ((flags.productCodeChanged || flags.packageOrLockfileChanged || flags.workflowChanged) && !sameHeadCi) {
    return makeResult(
      "BLOCKED",
      "same-head CI evidence is missing",
      "rerun required checks on the current PR head",
      input,
      profileUsed,
      flags
    );
  }

  return null;
}

export function evaluateSecurityControlBoundary(
  input: GateInput,
  profileUsed: ProfileName,
  flags: ForbiddenBoundaryFlags
): GateResult | null {
  if (!flags.securityControlChanged || hasTrustedOwnerApproval(input, profileUsed)) {
    return null;
  }

  return makeResult(
    "OWNER_REQUIRED",
    "security control change requires trusted owner approval",
    "add trusted owner approval for the security control change on the current PR head",
    input,
    profileUsed,
    flags
  );
}

export function makePass(
  input: GateInput,
  profileUsed: ProfileName,
  flags: ForbiddenBoundaryFlags
): GateResult {
  return makeResult("PASS", null, null, input, profileUsed, flags);
}

export function makeResult(
  verdict: Verdict,
  primaryBlocker: string | null,
  safeNextAction: string | null,
  input: GateInput,
  profileUsed: ProfileName,
  flags: ForbiddenBoundaryFlags
): GateResult {
  return {
    verdict,
    mergeAllowed: verdict === "PASS",
    primaryBlocker,
    safeNextAction,
    evidenceHeadSha: input.headSha ?? null,
    profileUsed,
    forbiddenBoundaryFlags: flags,
    collectionStatus: buildCollectionStatus(input)
  };
}

export function hasSameHeadCheckEvidence(input: GateInput): boolean {
  const checks = input.checks ?? [];
  if (checks.length === 0) {
    return false;
  }

  const requiredChecks = normalizeRequiredChecks(input.requiredChecks ?? []);
  if (requiredChecks.length === 0) {
    return false;
  }

  return requiredChecks.every((requiredName) =>
    checks.some((check) => normalizeCheckName(check.name) === requiredName && isSuccessfulSameHeadCheck(check, input.headSha))
  );
}

export function hasTrustedOwnerApproval(input: GateInput, profileUsed: ProfileName): boolean {
  return validateTrustedApproval(input, profileUsed).valid;
}

export interface TrustedApprovalValidation {
  valid: boolean;
  reason: string | null;
}

export function validateTrustedApproval(input: GateInput, profileUsed: ProfileName): TrustedApprovalValidation {
  const approval = input.trustedApproval;
  if (!approval) {
    return invalidApproval("trusted approval is missing");
  }

  if (!hasRequiredTrustedApprovalFields(approval)) {
    return invalidApproval("trusted approval is incomplete");
  }

  if (approval.decision !== "approved") {
    return invalidApproval("trusted approval decision is not approved");
  }

  if (approval.headSha !== input.headSha) {
    return invalidApproval("trusted approval head SHA does not match the PR head SHA");
  }

  if (approval.profile !== profileUsed) {
    return invalidApproval("trusted approval profile does not match the requested profile");
  }

  const runMode = normalizeRunMode(input.runMode);
  if (approval.source === "manual_fixture") {
    if (runMode !== "local") {
      return invalidApproval("manual fixture approval is not trusted in GitHub Action mode");
    }
    return { valid: true, reason: null };
  }

  if (approval.source === "github_review") {
    if (runMode !== "github_action") {
      return invalidApproval("GitHub review approval is only trusted in GitHub Action mode");
    }
    if (!isGithubReviewApprovalReceipt(approval)) {
      return invalidApproval("GitHub review approval was not collected from the GitHub API");
    }
    if (!isTrustedApprover(input.trustedApprovers, approval.approver)) {
      return invalidApproval("GitHub review approver is not in trustedApprovers");
    }
    if (isSelfApproval(input.prAuthor, approval.approver)) {
      return invalidApproval("GitHub review self approval is not trusted");
    }
    if (isBotLikeApprover(approval.approver)) {
      return invalidApproval("GitHub review bot approval is not trusted");
    }
    return { valid: true, reason: null };
  }

  return invalidApproval("trusted approval source is not recognized");
}

export function normalizeProfile(profile: string | null | undefined): ProfileName {
  if (profile === "standard" || profile === "crypto-web3" || profile === "production-sensitive") {
    return profile;
  }

  throw new Error(`unknown APS-GATE profile: ${profile ?? "(missing)"}`);
}

function isSuccessfulSameHeadCheck(check: CheckEvidence, headSha: string | null | undefined): boolean {
  if (!isSuccessfulCheck(check)) {
    return false;
  }

  return Boolean(headSha && check.headSha === headSha);
}

function isSuccessfulCheck(check: CheckEvidence): boolean {
  const conclusion = (check.conclusion ?? "").toLowerCase();
  const status = (check.status ?? "").toLowerCase();
  return conclusion === "success" || status === "success" || status === "passed";
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function matches(filePath: string, pattern: RegExp): boolean {
  return pattern.test(filePath);
}

function getExtension(filePath: string): string {
  const slash = filePath.lastIndexOf("/");
  const dot = filePath.lastIndexOf(".");
  if (dot <= slash) {
    return "";
  }
  return filePath.slice(dot);
}

function isPackageOrLockfile(filePath: string): boolean {
  return matches(
    filePath,
    /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|requirements(-dev)?\.txt|pyproject\.toml|poetry\.lock|pipfile|pipfile\.lock|cargo\.toml|cargo\.lock|go\.mod|go\.sum|gemfile|gemfile\.lock|composer\.json|composer\.lock|pom\.xml|build\.gradle|build\.gradle\.kts|gradle\.lockfile)$/
  );
}

function isWorkflowFile(filePath: string): boolean {
  return (
    filePath.startsWith(".github/workflows/") ||
    filePath.startsWith(".github/actions/") ||
    filePath === "action.yml" ||
    filePath === "action.yaml"
  );
}

function isRuntimeFile(filePath: string): boolean {
  return (
    filePath === "dockerfile" ||
    filePath.endsWith("/dockerfile") ||
    filePath.startsWith("dockerfile.") ||
    matches(filePath, /(^|\/)dockerfile\./) ||
    matches(filePath, /(^|\/)(docker-compose|compose)\.ya?ml$/) ||
    matches(filePath, /(^|\/)(vercel\.json|netlify\.toml|fly\.toml|render\.ya?ml|railway\.json|procfile|serverless\.ya?ml)$/) ||
    filePath.endsWith(".tf") ||
    filePath.endsWith(".tfvars") ||
    matches(filePath, /(^|\/)(k8s|kubernetes|helm|charts|infra|infrastructure)\//)
  );
}

function isConfigurationPath(filePath: string): boolean {
  return (
    isWorkflowFile(filePath) ||
    isMakefile(filePath) ||
    filePath === ".github/codeowners" ||
    filePath === "codeowners" ||
    filePath.includes("codeowners") ||
    filePath.startsWith("docs/process/") ||
    filePath === "agents.md" ||
    filePath === "action.yml" ||
    filePath === "action.yaml" ||
    filePath.endsWith(".json") ||
    filePath.endsWith(".yaml") ||
    filePath.endsWith(".yml") ||
    filePath.endsWith(".toml") ||
    filePath.endsWith(".hcl")
  );
}

function isSecurityControlPath(filePath: string): boolean {
  return (
    isWorkflowFile(filePath) ||
    filePath === ".github/codeowners" ||
    filePath === "codeowners" ||
    filePath.includes("codeowners") ||
    filePath === "action.yml" ||
    filePath === "action.yaml" ||
    filePath === "agents.md" ||
    filePath.startsWith("docs/process/") ||
    filePath.includes("harness") ||
    filePath.includes("policy")
  );
}

function isMakefile(filePath: string): boolean {
  return filePath === "makefile" || filePath.endsWith("/makefile");
}

function isTestOnlyPath(filePath: string): boolean {
  return matches(filePath, /(^|\/)(__tests__|tests?|spec)\//) || matches(filePath, /\.(test|spec)\.[a-z0-9]+$/);
}

function isReadinessClaim(claim: string): boolean {
  const normalized = claim.toLowerCase();
  return /(production ready|prod ready|release ready|deploy ready|mainnet ready|bscscan|audited|legal compliance|youtube policy compliance|compliant)/.test(
    normalized
  );
}

function normalizeCheckName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeRequiredChecks(requiredChecks: string[]): string[] {
  return requiredChecks.map(normalizeCheckName).filter(Boolean);
}

function validateRequiredChecks(requiredChecks: string[]): string | null {
  return requiredChecks.map(normalizeCheckName).some((name) => name === "aps-gate")
    ? "APS-GATE cannot be used as its own required check"
    : null;
}

function hasRequiredTrustedApprovalFields(
  approval: Partial<TrustedApproval>
): approval is TrustedApproval {
  return (
    isKnownApprovalSource(approval.source) &&
    isNonEmptyString(approval.approver) &&
    isNonEmptyString(approval.headSha) &&
    (approval.profile === "standard" ||
      approval.profile === "crypto-web3" ||
      approval.profile === "production-sensitive") &&
    approval.decision === "approved" &&
    isNonEmptyString(approval.reason) &&
    isNonEmptyString(approval.createdAt)
  );
}

function isKnownApprovalSource(source: unknown): source is TrustedApproval["source"] {
  return source === "manual_fixture" || source === "github_review";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function normalizeRunMode(runMode: RunMode | undefined): RunMode {
  return runMode === "github_action" ? "github_action" : "local";
}

function invalidApproval(reason: string): TrustedApprovalValidation {
  return { valid: false, reason };
}

function buildCollectionStatus(input: GateInput): CollectionStatus {
  const requiredChecksConfigured = (input.requiredChecks ?? []).length > 0;
  return {
    status: input.collectionStatus?.status ?? "complete",
    reasonCode: input.collectionStatus?.reasonCode ?? "OK",
    requiredChecksConfigured,
    requiredChecksSatisfied: requiredChecksConfigured ? hasSameHeadCheckEvidence(input) : false,
    fileListComplete: input.collectionStatus?.fileListComplete ?? Array.isArray(input.changedFiles),
    checkListComplete: input.collectionStatus?.checkListComplete ?? true,
    reviewListComplete: input.collectionStatus?.reviewListComplete ?? true,
    approvalReceiptPresent: input.collectionStatus?.approvalReceiptPresent ?? Boolean(input.trustedApproval)
  };
}

function isTrustedApprover(trustedApprovers: string[] | undefined, approver: string): boolean {
  const normalizedApprover = normalizeIdentity(approver);
  return (trustedApprovers ?? []).some((trusted) => normalizeIdentity(trusted) === normalizedApprover);
}

function isSelfApproval(prAuthor: string | null | undefined, approver: string): boolean {
  return Boolean(prAuthor && normalizeIdentity(prAuthor) === normalizeIdentity(approver));
}

function isBotLikeApprover(approver: string): boolean {
  const normalized = normalizeIdentity(approver);
  return normalized.endsWith("[bot]") || normalized.includes("-bot") || normalized === "github-actions";
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}
