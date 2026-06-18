import { readFileSync } from "node:fs";
import { CheckEvidence, GateInput, ProfileName, TrustedApproval } from "./types";
import { createGithubReviewApprovalReceipt } from "./trusted-approval";

interface GitHubContext {
  owner: string;
  repo: string;
  repository: string;
  pullNumber: number;
  headSha: string;
  prAuthor: string | null;
}

interface PullRequestFileResponse {
  filename: string;
}

interface CheckRunResponse {
  name: string;
  status?: string | null;
  conclusion?: string | null;
  head_sha?: string | null;
}

interface CheckRunsResponse {
  total_count: number;
  check_runs: CheckRunResponse[];
}

interface StatusResponse {
  context: string;
  state: string;
}

interface PullRequestReviewResponse {
  id?: number | null;
  state: string;
  body?: string | null;
  submitted_at?: string | null;
  commit_id?: string | null;
  user?: {
    login?: string | null;
    type?: string | null;
  } | null;
}

interface PullRequestResponse {
  head?: {
    sha?: string | null;
  } | null;
  user?: {
    login?: string | null;
  } | null;
}

export interface GithubPullRequestInputOptions {
  profile?: ProfileName;
  trustedApprovers?: string[];
}

export async function collectGithubPullRequestInput(
  token: string | undefined = process.env.GITHUB_TOKEN,
  options: GithubPullRequestInputOptions = {}
): Promise<Partial<GateInput>> {
  const context = readGithubContext();
  if (!context) {
    return {};
  }

  if (!token) {
    return { headSha: context.headSha, prAuthor: context.prAuthor };
  }

  const observedBefore = await fetchPullRequestHead(context, token);
  if (!observedBefore || observedBefore.headSha !== context.headSha) {
    return { headSha: context.headSha, prAuthor: context.prAuthor, changedFiles: null, checks: [] };
  }

  const [changedFilesResult, checksResult, trustedApprovalResult] = await Promise.allSettled([
    fetchPullRequestFiles(context, token),
    fetchCheckEvidence(context, token),
    fetchTrustedGithubApproval(context, token, options)
  ]);

  const observedAfter = await fetchPullRequestHead(context, token);
  if (!observedAfter || observedAfter.headSha !== context.headSha) {
    return { headSha: context.headSha, prAuthor: context.prAuthor, changedFiles: null, checks: [] };
  }

  const input: Partial<GateInput> = {
    headSha: context.headSha,
    prAuthor: context.prAuthor
  };
  if (changedFilesResult.status === "fulfilled" && changedFilesResult.value) {
    input.changedFiles = changedFilesResult.value;
  }
  if (checksResult.status === "fulfilled") {
    input.checks = checksResult.value;
  } else {
    input.checks = [];
  }
  if (trustedApprovalResult.status === "fulfilled" && trustedApprovalResult.value) {
    input.trustedApproval = trustedApprovalResult.value;
  }

  return input;
}

export async function postPullRequestComment(body: string, token: string | undefined = process.env.GITHUB_TOKEN): Promise<void> {
  const context = readGithubContext();
  if (!context) {
    throw new Error("cannot post APS-GATE comment: GitHub pull_request event context is missing");
  }
  if (!token) {
    throw new Error("cannot post APS-GATE comment: github token is missing");
  }

  await githubRequest(
    token,
    `/repos/${context.owner}/${context.repo}/issues/${context.pullNumber}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body })
    }
  );
}

function readGithubContext(env: NodeJS.ProcessEnv = process.env): GitHubContext | null {
  if (!env.GITHUB_EVENT_PATH || !env.GITHUB_REPOSITORY) {
    return null;
  }

  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  const pullRequest = event.pull_request;
  if (!pullRequest?.head?.sha) {
    return null;
  }

  const [owner, repo] = env.GITHUB_REPOSITORY.split("/");
  const pullNumber = Number(pullRequest.number ?? event.number);
  if (!owner || !repo || !Number.isFinite(pullNumber)) {
    return null;
  }

  return {
    owner,
    repo,
    repository: `${owner}/${repo}`,
    pullNumber,
    headSha: pullRequest.head.sha,
    prAuthor: pullRequest.user?.login ?? null
  };
}

async function fetchPullRequestFiles(context: GitHubContext, token: string): Promise<string[] | null> {
  const files: string[] = [];
  const maxPages = 30;
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await githubRequest<PullRequestFileResponse[]>(
      token,
      `/repos/${context.owner}/${context.repo}/pulls/${context.pullNumber}/files?per_page=100&page=${page}`
    );
    files.push(...batch.map((file) => file.filename));
    if (batch.length < 100) {
      break;
    }
  }

  if (files.length === maxPages * 100) {
    return null;
  }

  return files;
}

async function fetchCheckEvidence(context: GitHubContext, token: string): Promise<CheckEvidence[]> {
  const checks: CheckEvidence[] = [];

  const [checkRunsResult, statusesResult] = await Promise.allSettled([
    fetchAllCheckRuns(context, token),
    githubRequest<{ statuses: StatusResponse[] }>(
      token,
      `/repos/${context.owner}/${context.repo}/commits/${context.headSha}/status`
    )
  ]);

  if (checkRunsResult.status === "fulfilled") {
    checks.push(
      ...checkRunsResult.value.map((checkRun) => ({
        name: checkRun.name,
        status: checkRun.status,
        conclusion: checkRun.conclusion,
        headSha: checkRun.head_sha ?? context.headSha
      }))
    );
  }

  if (statusesResult.status === "fulfilled") {
    checks.push(
      ...statusesResult.value.statuses.map((status) => ({
        name: status.context,
        status: status.state,
        conclusion: status.state,
        headSha: context.headSha
      }))
    );
  }

  return checks;
}

async function fetchAllCheckRuns(context: GitHubContext, token: string): Promise<CheckRunResponse[]> {
  const runs: CheckRunResponse[] = [];
  const maxPages = 30;
  let totalCount = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await githubRequest<CheckRunsResponse>(
      token,
      `/repos/${context.owner}/${context.repo}/commits/${context.headSha}/check-runs?filter=latest&per_page=100&page=${page}`
    );
    totalCount = batch.total_count;
    runs.push(...batch.check_runs);
    if (runs.length >= totalCount || batch.check_runs.length < 100) {
      break;
    }
  }

  if (runs.length < totalCount) {
    throw new Error("APS_GATE_CHECK_RUN_PAGINATION_INCOMPLETE");
  }

  return runs;
}

async function fetchTrustedGithubApproval(
  context: GitHubContext,
  token: string,
  options: GithubPullRequestInputOptions
): Promise<TrustedApproval | null> {
  if (!options.profile || (options.trustedApprovers ?? []).length === 0) {
    return null;
  }

  const profile = options.profile;
  const reviews = await fetchPullRequestReviews(context, token);
  const trustedApprovers = new Set((options.trustedApprovers ?? []).map(normalizeIdentity));
  const approvedReviews = latestDecisiveReviewsByReviewer(reviews)
    .filter((review) => review.state.toUpperCase() === "APPROVED")
    .filter((review) => review.commit_id === context.headSha)
    .filter((review) => Number.isFinite(review.id))
    .filter((review) => isValidTimestamp(review.submitted_at))
    .filter((review) => Boolean(review.user?.login))
    .filter((review) => review.user?.type === "User")
    .filter((review) => trustedApprovers.has(normalizeIdentity(review.user?.login ?? "")))
    .filter((review) => !context.prAuthor || normalizeIdentity(review.user?.login ?? "") !== normalizeIdentity(context.prAuthor))
    .filter((review) => hasApprovalMarker(review.body, profile))
    .sort((left, right) => Date.parse(right.submitted_at ?? "") - Date.parse(left.submitted_at ?? ""));

  const review = approvedReviews[0];
  const approver = review?.user?.login;
  if (!review || !approver) {
    return null;
  }

  return createGithubReviewApprovalReceipt({
    source: "github_review",
    collectionSource: "github_api",
    repository: context.repository,
    pullNumber: context.pullNumber,
    reviewId: review.id ?? undefined,
    approvedBoundaries: parseApprovedBoundaries(review.body),
    approver,
    headSha: context.headSha,
    profile,
    decision: "approved",
    reason: "GitHub review approval by a trusted approver for the current PR head",
    createdAt: review.submitted_at ?? new Date().toISOString()
  });
}

async function fetchPullRequestReviews(context: GitHubContext, token: string): Promise<PullRequestReviewResponse[]> {
  const reviews: PullRequestReviewResponse[] = [];
  const maxPages = 10;
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await githubRequest<PullRequestReviewResponse[]>(
      token,
      `/repos/${context.owner}/${context.repo}/pulls/${context.pullNumber}/reviews?per_page=100&page=${page}`
    );
    reviews.push(...batch);
    if (batch.length < 100) {
      break;
    }
  }
  if (reviews.length === maxPages * 100) {
    throw new Error("APS_GATE_REVIEW_PAGINATION_INCOMPLETE");
  }
  return reviews;
}

async function fetchPullRequestHead(context: GitHubContext, token: string): Promise<{ headSha: string; prAuthor: string | null } | null> {
  const pull = await githubRequest<PullRequestResponse>(
    token,
    `/repos/${context.owner}/${context.repo}/pulls/${context.pullNumber}`
  );
  const headSha = pull.head?.sha;
  if (!headSha) {
    return null;
  }
  return {
    headSha,
    prAuthor: pull.user?.login ?? null
  };
}

async function githubRequest<T = unknown>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase();
}

function latestDecisiveReviewsByReviewer(reviews: PullRequestReviewResponse[]): PullRequestReviewResponse[] {
  const decisiveStates = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);
  const latest = new Map<string, PullRequestReviewResponse>();
  for (const review of reviews) {
    const state = review.state.toUpperCase();
    const login = review.user?.login;
    if (!login || !decisiveStates.has(state) || !isValidTimestamp(review.submitted_at)) {
      continue;
    }
    const key = normalizeIdentity(login);
    const existing = latest.get(key);
    if (!existing || Date.parse(review.submitted_at ?? "") > Date.parse(existing.submitted_at ?? "")) {
      latest.set(key, review);
    }
  }
  return [...latest.values()];
}

function isValidTimestamp(value: string | null | undefined): boolean {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function hasApprovalMarker(body: string | null | undefined, profile: ProfileName): boolean {
  if (!body) {
    return false;
  }
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  return lines.includes("APS-GATE-APPROVE") && lines.includes(`profile=${profile}`) && lines.some((line) => line.startsWith("boundaries="));
}

function parseApprovedBoundaries(body: string | null | undefined): string[] {
  const boundaryLine = body?.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("boundaries="));
  return boundaryLine ? boundaryLine.slice("boundaries=".length).split(",").map((value) => value.trim()).filter(Boolean) : [];
}
