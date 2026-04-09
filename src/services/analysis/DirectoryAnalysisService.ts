import * as path from "path";
import * as vscode from "vscode";
import { RepoSummary } from "../../models/types";
import { createProvider, getProviderConfig } from "../llm/ProviderFactory";
import { PromptBuilder } from "../llm/PromptBuilder";
import { RepoScanner } from "../repo/RepoScanner";
import { toRepoSummary } from "./responseParsing";

export class DirectoryAnalysisService {
  public constructor(
    private readonly repoScanner: RepoScanner,
    private readonly promptBuilder: PromptBuilder
  ) {}

  public async analyze(directoryPath: string): Promise<RepoSummary> {
    const config = vscode.workspace.getConfiguration("codeExplainer");
    const maxFiles = config.get<number>("maxFilesInContext", 30);

    const folder = this.repoScanner.getWorkspaceFolder();
    const rootPath = folder.uri.fsPath;
    const relativePath = path.relative(rootPath, directoryPath);

    // Scan the specific directory
    const dirFiles = await this.repoScanner.scanDirectory(directoryPath, maxFiles);

    // Get broader repo context (top-level only for awareness)
    const repoContext = await this.repoScanner.scan(50);

    const provider = createProvider(getProviderConfig());
    const prompt = this.promptBuilder.buildDirectoryPrompt({
      workspaceName: folder.name,
      rootPath,
      directoryPath: relativePath,
      directoryFiles: dirFiles,
      repoTopLevel: repoContext.topLevelEntries,
      repoManifests: repoContext.manifests,
    });

    const markdown = await provider.generate(prompt);
    const summary = toRepoSummary(markdown);

    // Add custom action for drawing a directory diagram
    summary.nextActions = ["Draw directory diagram", ...summary.nextActions];

    return summary;
  }
}
