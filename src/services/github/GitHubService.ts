import * as vscode from "vscode";
import { GitService } from "../git/GitService";

export type GitHubRepository = {
  owner: string;
  name: string;
  remoteName: string;
  remoteUrl: string;
};

export type GitHubPullRequest = {
  number: number;
  title: string;
  body: string;
  url: string;
  state: "open" | "closed";
  merged: boolean;
};

type GitHubPullRequestResponse = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  merged_at: string | null;
};

export class GitHubService {
  public async resolveRepository(git: GitService): Promise<GitHubRepository> {
    const remoteName = await git.getPrimaryRemoteName();
    const remoteUrl = await git.getRemoteUrl(remoteName);
    const parsed = this.parseRemote(remoteUrl);

    if (!parsed) {
      throw new Error("Could not resolve a GitHub repository from the current git remote.");
    }

    return {
      owner: parsed.owner,
      name: parsed.name,
      remoteName,
      remoteUrl,
    };
  }

  public async findOpenPullRequest(
    repo: GitHubRepository,
    branchName: string,
    createIfNone = true
  ): Promise<GitHubPullRequest | undefined> {
    return this.findPullRequest(repo, branchName, { state: "open", createIfNone });
  }

  public async findPullRequest(
    repo: GitHubRepository,
    branchName: string,
    options: {
      state?: "open" | "closed" | "all";
      createIfNone?: boolean;
    } = {}
  ): Promise<GitHubPullRequest | undefined> {
    const pulls = await this.request<GitHubPullRequestResponse[]>(
      `/repos/${repo.owner}/${repo.name}/pulls?state=${options.state ?? "open"}&head=${encodeURIComponent(`${repo.owner}:${branchName}`)}&per_page=1&sort=updated&direction=desc`,
      {
        method: "GET",
      },
      options.createIfNone ?? true
    );

    const pull = pulls[0];
    return pull ? this.toPullRequest(pull) : undefined;
  }

  public async createPullRequest(
    repo: GitHubRepository,
    options: {
      title: string;
      body: string;
      headBranch: string;
      baseBranch: string;
    }
  ): Promise<GitHubPullRequest> {
    const response = await this.request<GitHubPullRequestResponse>(
      `/repos/${repo.owner}/${repo.name}/pulls`,
      {
        method: "POST",
        body: JSON.stringify({
          title: options.title,
          body: options.body,
          head: options.headBranch,
          base: options.baseBranch,
        }),
      },
      true
    );

    return this.toPullRequest(response);
  }

  public async updatePullRequest(
    repo: GitHubRepository,
    pullRequestNumber: number,
    options: {
      title: string;
      body: string;
    }
  ): Promise<GitHubPullRequest> {
    const response = await this.request<GitHubPullRequestResponse>(
      `/repos/${repo.owner}/${repo.name}/pulls/${pullRequestNumber}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          title: options.title,
          body: options.body,
        }),
      },
      true
    );

    return this.toPullRequest(response);
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    createIfNone: boolean
  ): Promise<T> {
    const session = await vscode.authentication.getSession("github", ["repo"], { createIfNone });
    if (!session) {
      throw new Error("GitHub authentication is required to generate PR descriptions.");
    }

    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...this.normalizeHeaders(init.headers),
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`GitHub request failed: ${response.status} ${response.statusText}${message ? ` - ${message}` : ""}`);
    }

    return response.json() as Promise<T>;
  }

  private normalizeHeaders(headers: RequestInit["headers"]): Record<string, string> {
    if (!headers) {
      return {};
    }

    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }

    if (Array.isArray(headers)) {
      return Object.fromEntries(headers) as Record<string, string>;
    }

    return Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(", ") : value])
    ) as Record<string, string>;
  }

  private parseRemote(remoteUrl: string): { owner: string; name: string } | undefined {
    const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
    if (sshMatch?.[1] && sshMatch?.[2]) {
      return {
        owner: sshMatch[1],
        name: sshMatch[2],
      };
    }

    const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/i);
    if (httpsMatch?.[1] && httpsMatch?.[2]) {
      return {
        owner: httpsMatch[1],
        name: httpsMatch[2],
      };
    }

    return undefined;
  }

  private toPullRequest(pull: GitHubPullRequestResponse): GitHubPullRequest {
    return {
      number: pull.number,
      title: pull.title,
      body: pull.body ?? "",
      url: pull.html_url,
      state: pull.state,
      merged: Boolean(pull.merged_at),
    };
  }
}
