import { GateInput, GateResult } from "../types";
import {
  classifyChangedFiles,
  evaluateRequiredInputs,
  evaluateSecurityControlBoundary,
  evaluateStandardEvidence,
  hasTrustedOwnerApproval,
  hasSameHeadCheckEvidence,
  makePass,
  makeResult
} from "./common";

export function evaluateProductionSensitive(input: GateInput): GateResult {
  const profileUsed = "production-sensitive";
  const flags = classifyChangedFiles(input.changedFiles, input.claims);
  const inputBlocker = evaluateRequiredInputs(input, profileUsed, flags);
  if (inputBlocker) {
    return inputBlocker;
  }

  const securityControlBlocker = evaluateSecurityControlBoundary(input, profileUsed, flags);
  if (securityControlBlocker) {
    return securityControlBlocker;
  }

  const sameHeadCi = hasSameHeadCheckEvidence(input);
  const productionImpact =
    flags.runtimeChanged ||
    flags.infrastructureTouched ||
    flags.authTouched ||
    flags.migrationTouched ||
    flags.deployTouched ||
    flags.secretRiskTouched;

  const trustedOwner = hasTrustedOwnerApproval(input, profileUsed);

  if (flags.readinessClaimed && !trustedOwner) {
    return makeResult(
      "BLOCKED",
      "production readiness claim lacks explicit evidence",
      "remove the readiness claim or attach explicit production evidence",
      input,
      profileUsed,
      flags
    );
  }

  if ((productionImpact || flags.packageOrLockfileChanged || flags.runtimeChanged) && !sameHeadCi) {
    return makeResult(
      "BLOCKED",
      "production-impacting change lacks same-head check evidence",
      "rerun required checks on the current PR head",
      input,
      profileUsed,
      flags
    );
  }

  if (productionImpact && !trustedOwner) {
    return makeResult(
      "OWNER_REQUIRED",
      "production-impacting change requires owner approval",
      "add production owner approval for the current PR head",
      input,
      profileUsed,
      flags
    );
  }

  const evidenceBlocker = evaluateStandardEvidence(input, profileUsed, flags);
  if (evidenceBlocker) {
    return evidenceBlocker;
  }

  return makePass(input, profileUsed, flags);
}
