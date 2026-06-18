import { GateInput, GateResult } from "../types";
import {
  classifyChangedFiles,
  evaluateRequiredInputs,
  evaluateSecurityControlBoundary,
  evaluateStandardEvidence,
  hasTrustedOwnerApproval,
  makePass,
  makeResult
} from "./common";

export function evaluateCryptoWeb3(input: GateInput): GateResult {
  const profileUsed = "crypto-web3";
  const flags = classifyChangedFiles(input.changedFiles, input.claims);
  const inputBlocker = evaluateRequiredInputs(input, profileUsed, flags);
  if (inputBlocker) {
    return inputBlocker;
  }

  const securityControlBlocker = evaluateSecurityControlBoundary(input, profileUsed, flags);
  if (securityControlBlocker) {
    return securityControlBlocker;
  }

  const trustedOwner = hasTrustedOwnerApproval(input, profileUsed);
  const cryptoReadinessBoundary =
    flags.readinessClaimed || flags.releaseTouched || flags.governanceTouched || flags.fundedTransactionTouched;

  if (cryptoReadinessBoundary && !trustedOwner) {
    return makeResult(
      "BLOCKED",
      "crypto release, funded transaction, or governance claim requires owner evidence",
      "remove the claim or provide explicit owner evidence for the crypto boundary",
      input,
      profileUsed,
      flags
    );
  }

  if (flags.contractTouched && !trustedOwner) {
    return makeResult(
      "OWNER_REQUIRED",
      "contract changes require owner approval",
      "add contract owner approval for the current PR head",
      input,
      profileUsed,
      flags
    );
  }

  if (flags.deployTouched && !trustedOwner) {
    return makeResult(
      "OWNER_REQUIRED",
      "deploy boundary requires owner approval",
      "add deploy owner approval for the current PR head",
      input,
      profileUsed,
      flags
    );
  }

  if ((flags.walletRpcTouched || flags.secretRiskTouched) && !trustedOwner) {
    return makeResult(
      "OWNER_REQUIRED",
      "wallet, RPC, or secret boundary requires owner approval",
      "add wallet, RPC, or secret owner approval for the current PR head",
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
