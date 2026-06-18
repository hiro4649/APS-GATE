import { GateInput, GateResult } from "../types";
import {
  classifyChangedFiles,
  evaluateRequiredInputs,
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

  const evidenceBlocker = evaluateStandardEvidence(input, profileUsed, flags);
  if (evidenceBlocker) {
    return evidenceBlocker;
  }

  return makePass(input, profileUsed, flags);
}
