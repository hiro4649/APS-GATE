import { TrustedApproval } from "./types";

const GITHUB_REVIEW_RECEIPT_BRAND: unique symbol = Symbol("APS_GATE_GITHUB_REVIEW_RECEIPT");

export type InternalGithubReviewApproval = TrustedApproval & {
  readonly [GITHUB_REVIEW_RECEIPT_BRAND]: true;
};

export function createGithubReviewApprovalReceipt(approval: TrustedApproval): InternalGithubReviewApproval {
  if (approval.source !== "github_review" || approval.collectionSource !== "github_api") {
    throw new Error("GitHub review receipt requires GitHub API collection");
  }

  return Object.freeze({
    ...approval,
    [GITHUB_REVIEW_RECEIPT_BRAND]: true as const
  });
}

export function isGithubReviewApprovalReceipt(
  approval: Partial<TrustedApproval> | null | undefined
): approval is InternalGithubReviewApproval {
  return Boolean(
    approval &&
      (approval as Partial<InternalGithubReviewApproval>)[GITHUB_REVIEW_RECEIPT_BRAND] === true
  );
}
