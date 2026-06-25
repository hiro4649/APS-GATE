import { GateInput, GateResult } from "../types";
import {
  classifyChangedFiles,
  evaluateRequiredInputs,
  evaluateSecurityControlBoundary,
  evaluateStandardEvidence,
  makePass
} from "./common";

export function evaluateStandard(input: GateInput): GateResult {
  const profileUsed = "standard";
  const flags = classifyChangedFiles(input.changedFiles, input.claims);
  const inputBlocker = evaluateRequiredInputs(input, profileUsed, flags);
  if (inputBlocker) {
    return inputBlocker;
  }

  const securityControlBlocker = evaluateSecurityControlBoundary(input, profileUsed, flags);
  if (securityControlBlocker) {
    return securityControlBlocker;
  }

  const evidenceBlocker = evaluateStandardEvidence(input, profileUsed, flags);
  if (evidenceBlocker) {
    return evidenceBlocker;
  }

  return makePass(input, profileUsed, flags);
}
