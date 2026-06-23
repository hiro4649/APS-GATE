# CODEX HARNESS v1.2.8 Target Spec

Repository: hiro4649/APS-GATE
Profile: APS_GATE_V128_LITE
Rollout class: metadata_light

## Purpose

v1.2.8 installs deterministic decision projection and token-minimal loop closure while preserving v1.2.7 authority, receipt, same-head, PR-body display-only, validation reuse, and rollback behavior.

## Authority Preservation

- Final Decision remains the pass/block/mergeAllowed/exit-code authority.
- Decision Capsule remains domain-decision authority.
- Evidence Capsule remains same-head and freshness authority.
- Quality Gate Safe Summary is a non-authoritative projection.
- AI audit can make technical findings inside fixed policy, but PR-head self-authorization remains forbidden.

## Token Economy

Routine path budget:

- managed safe artifact reads: 1
- cold artifact reads: 0
- selected skills: 1 maximum
- reviewer fanout: 0 in all-pass routine path
- final report: 8 lines maximum
- owner interrupt: 0 in routine path

## Target Footprint

This target rollout does not authorize product code, runtime code, workflow behavior, package/lockfile, deploy, wallet/RPC, secret access, readiness claims, or full Source HARNESS import.

## Rollback

Previous target harness remains rollback-compatible through the manifest versioning tuple.
