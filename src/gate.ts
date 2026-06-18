import { GateInput, GateResult } from "./types";
import { normalizeProfile } from "./profiles/common";
import { evaluateCryptoWeb3 } from "./profiles/crypto-web3";
import { evaluateProductionSensitive } from "./profiles/production-sensitive";
import { evaluateStandard } from "./profiles/standard";

export function evaluateGate(input: GateInput): GateResult {
  const profile = normalizeProfile(input.profile ?? "standard");
  const normalizedInput: GateInput = {
    ...input,
    profile,
    runMode: input.runMode ?? "local",
    checks: input.checks ?? [],
    claims: input.claims ?? [],
    requiredChecks: input.requiredChecks ?? []
  };

  switch (profile) {
    case "standard":
      return evaluateStandard(normalizedInput);
    case "crypto-web3":
      return evaluateCryptoWeb3(normalizedInput);
    case "production-sensitive":
      return evaluateProductionSensitive(normalizedInput);
  }
}
