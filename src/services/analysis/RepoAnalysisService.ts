import * as vscode from "vscode";
import { RepoSummary } from "../../models/types";
import { createProvider, getProviderConfig } from "../llm/ProviderFactory";
import { PromptBuilder } from "../llm/PromptBuilder";
import { RepoScanner } from "../repo/RepoScanner";
import { toRepoSummary } from "./responseParsing";

export class RepoAnalysisService {
  public constructor(
    private readonly repoScanner: RepoScanner,
    private readonly promptBuilder: PromptBuilder
  ) {}

  public async analyze(): Promise<RepoSummary> {
    const config = vscode.workspace.getConfiguration("codeExplainer");
    const maxFiles = config.get<number>("maxFilesInContext", 30);
    const repoContext = await this.repoScanner.scan(maxFiles);
    const provider = createProvider(getProviderConfig());
    const prompt = this.promptBuilder.buildRepoPrompt(repoContext);
    const markdown = await provider.generate(prompt);
    return toRepoSummary(markdown);
  }
}
