import { readFileSync } from "node:fs";
import { CheckEvidence, GateInput, ProfileName, TrustedApproval } from "./types";

interface GitHubContext {
  owner: string;
  repo: string;
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

interface StatusResponse {
  context: string;
  state: string;
}

interface PullRequestReviewResponse {
  state: string;
  body?: string | null;
  submitted_at?: string | null;
  commit_id?: string | null;
  user?: {
    login?: string | null;
    type?: string | null;
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

  const [changedFilesResult, checksResult, trustedApprovalResult] = await Promise.allSettled([
    fetchPullRequestFiles(context, token),
    fetchCheckEvidence(context, token),
    fetchTrustedGithubApproval(context, token, options)
  ]);

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
    githubRequest<{ check_runs: CheckRunResponse[] }>(
      token,
      `/repos/${context.owner}/${context.repo}/commits/${context.headSha}/check-runs?filter=latest&per_page=100`
    ),
    githubRequest<{ statuses: StatusResponse[] }>(
      token,
      `/repos/${context.owner}/${context.repo}/commits/${context.headSha}/status`
    )
  ]);

  if (checkRunsResult.status === "fulfilled") {
    checks.push(
      ...checkRunsResult.value.check_runs.map((checkRun) => ({
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

async function fetchTrustedGithubApproval(
  context: GitHubContext,
  token: string,
  options: GithubPullRequestInputOptions
): Promise<TrustedApproval | null> {
  if (!options.profile || (options.trustedApprovers ?? []).length === 0) {
    return null;
  }

  const reviews = await fetchPullRequestReviews(context, token);
  const trustedApprovers = new Set((options.trustedApprovers ?? []).map(normalizeIdentity));
  const approvedReviews = reviews
    .filter((review) => review.state.toUpperCase() === "APPROVED")
    .filter((review) => review.commit_id === context.headSha)
    .filter((review) => Boolean(review.user?.login))
    .filter((review) => review.user?.type !== "Bot")
    .filter((review) => trustedApprovers.has(normalizeIdentity(review.user?.login ?? "")))
    .filter((review) => !context.prAuthor || normalizeIdentity(review.user?.login ?? "") !== normalizeIdentity(context.prAuthor))
    .sort((left, right) => Date.parse(right.submitted_at ?? "") - Date.parse(left.submitted_at ?? ""));

  const review = approvedReviews[0];
  const approver = review?.user?.login;
  if (!review || !approver) {
    return null;
  }

  return {
    source: "github_review",
    collectionSource: "github_api",
    approver,
    headSha: context.headSha,
    profile: options.profile,
    decision: "approved",
    reason: "GitHub review approval by a trusted approver for the current PR head",
    createdAt: review.submitted_at ?? new Date().toISOString()
  };
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
  return reviews;
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
