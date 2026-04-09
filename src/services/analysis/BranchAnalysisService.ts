import * as path from "path";
import * as vscode from "vscode";
import { BranchSummary } from "../../models/types";
import { createProvider, getProviderConfig } from "../llm/ProviderFactory";
import { PromptBuilder } from "../llm/PromptBuilder";
import { GitService } from "../git/GitService";
import { RepoScanner } from "../repo/RepoScanner";
import { toFileRef } from "../../utils/refs";
import { toBranchSummary } from "./responseParsing";

export class BranchAnalysisService {
  public constructor(
    private readonly repoScanner: RepoScanner,
    private readonly promptBuilder: PromptBuilder
  ) {}

  public async analyze(): Promise<BranchSummary> {
    const folder = this.repoScanner.getWorkspaceFolder();
    const config = vscode.workspace.getConfiguration("codeExplainer");
    const baseBranch = config.get<string>("baseBranch", "main");
    const git = new GitService(folder.uri.fsPath);

    if (!(await git.isGitRepo())) {
      throw new Error("The current workspace is not a git repository.");
    }

    const [branchName, mergeBase, changedFiles, diff] = await Promise.all([
      git.getCurrentBranch(),
      git.getMergeBase(baseBranch),
      git.getChangedFiles(baseBranch),
      git.getDiff(baseBranch),
    ]);

    const provider = createProvider(getProviderConfig());
    const prompt = this.promptBuilder.buildBranchPrompt({
      branchName,
      baseBranch,
      mergeBase,
      changedFiles,
      diff,
    });
    const markdown = await provider.generate(prompt);
    const refs = changedFiles.map((file) => toFileRef(folder.uri.fsPath, path.join(folder.uri.fsPath, file)));
    return toBranchSummary(markdown, branchName, baseBranch, refs);
  }

  public async analyzeFile(filePath: string, baseBranch: string): Promise<BranchSummary> {
    const folder = this.repoScanner.getWorkspaceFolder();
    const git = new GitService(folder.uri.fsPath);

    if (!(await git.isGitRepo())) {
      throw new Error("The current workspace is not a git repository.");
    }

    const branchName = await git.getCurrentBranch();
    const mergeBase = await git.getMergeBase(baseBranch);

    // Get the diff for just this file (including uncommitted changes)
    const comparePoint = mergeBase ?? baseBranch;
    let fullDiff = "";

    try {
      // Get committed changes
      const committedDiff = await this.runGitCommand(folder.uri.fsPath, [
        "diff",
        "--unified=5",
        `${comparePoint}..HEAD`,
        "--",
        filePath,
      ]);
      fullDiff += committedDiff;
    } catch {
      // No committed changes
    }

    try {
      // Get uncommitted changes (staged + working directory)
      const uncommittedDiff = await this.runGitCommand(folder.uri.fsPath, [
        "diff",
        "--unified=5",
        "HEAD",
        "--",
        filePath,
      ]);
      if (uncommittedDiff && fullDiff) {
        fullDiff += "\n\n" + uncommittedDiff;
      } else if (uncommittedDiff) {
        fullDiff = uncommittedDiff;
      }
    } catch {
      // No uncommitted changes
    }

    if (!fullDiff) {
      throw new Error(`No changes found in ${path.basename(filePath)} compared to ${baseBranch}.`);
    }

    const provider = createProvider(getProviderConfig());
    const relativePath = path.relative(folder.uri.fsPath, filePath);
    const prompt = this.promptBuilder.buildFileComparisonPrompt({
      filePath: relativePath,
      branchName,
      baseBranch,
      diff: fullDiff,
    });

    const markdown = await provider.generate(prompt);
    const refs = [toFileRef(folder.uri.fsPath, filePath)];
    return toBranchSummary(markdown, branchName, baseBranch, refs);
  }

  private async runGitCommand(cwd: string, args: string[]): Promise<string> {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 1024 * 1024,
    });

    return stdout.trim();
  }
}
