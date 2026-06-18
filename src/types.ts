export const SCHEMA_VERSION = "0.1.0";
export const TOOL_NAME = "APS-GATE";

export const PROFILE_NAMES = [
  "standard",
  "crypto-web3",
  "production-sensitive"
] as const;

export type ProfileName = (typeof PROFILE_NAMES)[number];
export type Verdict = "PASS" | "BLOCKED" | "OWNER_REQUIRED";
export type RunMode = "local" | "github_action";
export type TrustedApprovalSource = "manual_fixture" | "github_review";
export type TrustedApprovalDecision = "approved";
export type TrustedApprovalCollectionSource = "github_api";

export interface CheckEvidence {
  name: string;
  status?: string | null;
  conclusion?: string | null;
  headSha?: string | null;
}

export interface PolicyEvidence {
  /**
   * Advisory-only user supplied evidence. These fields may explain context, but
   * they do not unlock PASS or satisfy owner approval boundaries in v0.
   */
  sameHeadCiEvidence?: boolean;
  packageChangeEvidence?: boolean;
  workflowChangeEvidence?: boolean;
  ownerApproval?: boolean;
  contractOwnerApproval?: boolean;
  deployOwnerApproval?: boolean;
  walletRpcOwnerApproval?: boolean;
  productionOwnerApproval?: boolean;
  productionReadinessEvidence?: boolean;
}

export interface TrustedApproval {
  source: TrustedApprovalSource;
  collectionSource?: TrustedApprovalCollectionSource;
  repository?: string;
  pullNumber?: number;
  reviewId?: number;
  approvedBoundaries?: string[];
  approver: string;
  headSha: string;
  profile: ProfileName;
  decision: TrustedApprovalDecision;
  reason: string;
  createdAt: string;
}

export interface GateInput {
  profile?: ProfileName;
  runMode?: RunMode;
  trustedApprovers?: string[];
  prAuthor?: string | null;
  headSha?: string | null;
  changedFiles?: string[] | null;
  checks?: CheckEvidence[];
  requiredChecks?: string[];
  policyEvidence?: PolicyEvidence;
  trustedApproval?: Partial<TrustedApproval> | null;
  claims?: string[];
  existingArtifact?: Partial<SafeArtifact> | null;
}

export interface ForbiddenBoundaryFlags {
  verificationRelevantChanged: boolean;
  securityControlChanged: boolean;
  testsChanged: boolean;
  configurationChanged: boolean;
  productCodeChanged: boolean;
  packageOrLockfileChanged: boolean;
  workflowChanged: boolean;
  runtimeChanged: boolean;
  deployTouched: boolean;
  walletRpcTouched: boolean;
  secretRiskTouched: boolean;
  readinessClaimed: boolean;
  contractTouched: boolean;
  migrationTouched: boolean;
  authTouched: boolean;
  infrastructureTouched: boolean;
  releaseTouched: boolean;
  governanceTouched: boolean;
  fundedTransactionTouched: boolean;
}

export interface GateResult {
  verdict: Verdict;
  mergeAllowed: boolean;
  primaryBlocker: string | null;
  safeNextAction: string | null;
  evidenceHeadSha: string | null;
  profileUsed: ProfileName;
  forbiddenBoundaryFlags: ForbiddenBoundaryFlags;
}

export interface SafeArtifact extends GateResult {
  schemaVersion: typeof SCHEMA_VERSION;
  tool: typeof TOOL_NAME;
  safeArtifactPath: string;
  rawLogsRead: false;
  secretsExposed: false;
  autoMergeAttempted: false;
}
