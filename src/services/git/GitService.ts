import { execFile } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import { MAX_DIFF_CHARS } from "../../utils/limits";

const execFileAsync = promisify(execFile);

export class GitService {
  public constructor(private readonly rootPath: string) {}

  public async isGitRepo(): Promise<boolean> {
    try {
      await this.run(["rev-parse", "--is-inside-work-tree"]);
      return true;
    } catch {
      return false;
    }
  }

  public async getCurrentBranch(): Promise<string> {
    return this.run(["rev-parse", "--abbrev-ref", "HEAD"]);
  }

  public async getPrimaryRemoteName(): Promise<string> {
    const remotes = (await this.run(["remote"]))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (!remotes.length) {
      throw new Error("No git remotes were found for this repository.");
    }

    return remotes.includes("origin") ? "origin" : remotes[0];
  }

  public async getRemoteUrl(remoteName: string): Promise<string> {
    return this.run(["remote", "get-url", remoteName]);
  }

  public async getUpstreamBranch(): Promise<string | undefined> {
    try {
      return await this.run(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    } catch {
      return undefined;
    }
  }

  public async hasRemoteBranch(remoteName: string, branchName: string): Promise<boolean> {
    try {
      const output = await this.run(["ls-remote", "--heads", remoteName, branchName]);
      return Boolean(output.trim());
    } catch {
      return false;
    }
  }

  public async pushCurrentBranch(remoteName: string): Promise<void> {
    await this.run(["push", "-u", remoteName, "HEAD"]);
  }

  public async getMergeBase(baseBranch: string): Promise<string | undefined> {
    try {
      return await this.run(["merge-base", "HEAD", baseBranch]);
    } catch {
      return undefined;
    }
  }

  public async getChangedFiles(baseBranch: string): Promise<string[]> {
    const mergeBase = await this.getMergeBase(baseBranch);
    const range = mergeBase ? `${mergeBase}..HEAD` : `${baseBranch}..HEAD`;
    const output = await this.run(["diff", "--name-only", range]);
    return output.split("\n").map((line) => line.trim()).filter(Boolean);
  }

  public async getDiff(baseBranch: string): Promise<string> {
    const mergeBase = await this.getMergeBase(baseBranch);
    const range = mergeBase ? `${mergeBase}..HEAD` : `${baseBranch}..HEAD`;
    const diff = await this.run(["diff", "--unified=2", range]);
    return diff.slice(0, MAX_DIFF_CHARS);
  }

  private async run(args: string[]): Promise<string> {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: this.rootPath,
      maxBuffer: 1024 * 1024,
    });

    if (stderr && stderr.trim()) {
      void vscode.window.showWarningMessage(stderr.trim());
    }

    return stdout.trim();
  }
}
