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
}
