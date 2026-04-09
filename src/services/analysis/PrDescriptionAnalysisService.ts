import * as path from "path";
import * as vscode from "vscode";
import {
  ExplanationCard,
  FileRef,
  PrDescriptionExplanation,
  PrDescriptionStyle,
  PrDescriptionStyleOption,
  PrState,
} from "../../models/types";
import { GitHubPullRequest, GitHubService } from "../github/GitHubService";
import { createProvider, getProviderConfig } from "../llm/ProviderFactory";
import { PromptBuilder } from "../llm/PromptBuilder";
import { GitService } from "../git/GitService";
import { RepoScanner } from "../repo/RepoScanner";
import { toFileRef } from "../../utils/refs";

const GENERATED_BLOCK_START = "<!-- code-explainer:generated:start -->";
const GENERATED_BLOCK_END = "<!-- code-explainer:generated:end -->";

export class NoBranchChangesError extends Error {
  public constructor() {
    super("This branch has no edits compared with the base branch yet, so there is no PR description to generate.");
  }
}

type DraftPayload = {
  title?: string;
  generatedBody?: string;
};

type AnalyzeOptions = {
  style?: PrDescriptionStyle;
  customInstructions?: string;
};

type ApplyDraftOptions = {
  draft: PrDescriptionExplanation;
  title: string;
  body: string;
};

type ApplyDraftResult = {
  status: "cancelled" | "created" | "updated";
  pullRequest?: GitHubPullRequest;
};

export class PrDescriptionAnalysisService {
  public constructor(
    private readonly repoScanner: RepoScanner,
    private readonly promptBuilder: PromptBuilder,
    private readonly githubService: GitHubService
  ) {}

  public getAvailableStyles(config = vscode.workspace.getConfiguration("codeExplainer")): PrDescriptionStyleOption[] {
    const styles = [...this.getBuiltInStyles(), ...this.getCustomStyles(config)];
    const seen = new Set<string>();
    return styles.filter((style) => {
      if (seen.has(style.id)) {
        return false;
      }

      seen.add(style.id);
      return true;
    });
  }

  public async analyze(options: AnalyzeOptions = {}): Promise<PrDescriptionExplanation> {
    const folder = this.repoScanner.getWorkspaceFolder();
    const config = vscode.workspace.getConfiguration("codeExplainer");
    const git = new GitService(folder.uri.fsPath);

    if (!(await git.isGitRepo())) {
      throw new Error("The current workspace is not a git repository.");
    }

    const baseBranch = config.get<string>("baseBranch", "main");
    const availableStyles = this.getAvailableStyles(config);
    const selectedStyle = this.resolveStyle(availableStyles, options.style, config);
    const style = selectedStyle.id;
    const customInstructions = options.customInstructions?.trim() ?? "";
    const defaultGuidelines = config.get<string>("prDescription.defaultGuidelines", "").trim();
    const defaultTemplate = config.get<string>("prDescription.defaultTemplate", "").trim();
    const effectiveGuidelines = [defaultGuidelines, selectedStyle.guidelines?.trim() ?? ""]
      .filter(Boolean)
      .join("\n\n");
    const effectiveTemplate = selectedStyle.template?.trim() || defaultTemplate;

    const [branchName, changedFiles, diff] = await Promise.all([
      git.getCurrentBranch(),
      git.getChangedFiles(baseBranch),
      git.getDiff(baseBranch),
    ]);

    if (!changedFiles.length && !diff.trim()) {
      throw new NoBranchChangesError();
    }

    const repository = await this.githubService.resolveRepository(git);

    const hasRemoteBranch = await git.hasRemoteBranch(repository.remoteName, branchName);
    const existingPr = await this.githubService.findOpenPullRequest(repository, branchName, true);
    const prState = this.getPrState(existingPr);
    const existingBody = existingPr?.body ?? "";
    const hasManagedBlock = this.hasManagedBlock(existingBody);

    const provider = createProvider(getProviderConfig());
    const prompt = this.promptBuilder.buildPrDescriptionPrompt({
      branchName,
      baseBranch,
      changedFiles,
      diff,
      existingTitle: existingPr?.title,
      existingBody,
      styleLabel: selectedStyle.label,
      styleGuidance: selectedStyle.prompt?.trim() || this.getBuiltInStylePrompt(selectedStyle.id),
      customInstructions,
      teamGuidelines: effectiveGuidelines,
      template: effectiveTemplate,
    });
    const payload = this.parseDraftPayload(await provider.generate(prompt));

    const generatedBody = payload.generatedBody?.trim();
    if (!generatedBody) {
      throw new Error("PR description generation did not return any body content.");
    }

    const draftTitle = payload.title?.trim() || existingPr?.title || `Update ${branchName}`;
    const draftBody = this.composeDraftBody(existingBody, generatedBody);
    const cards = this.buildCards({
      rootPath: folder.uri.fsPath,
      changedFiles,
      prState,
      hasManagedBlock,
      existingPr,
      defaultGuidelines,
      defaultTemplate,
    });

    return {
      kind: "prDescription",
      headline: `Generate PR description for ${branchName}`,
      cards,
      draftTitle,
      draftBody,
      style,
      styleLabel: selectedStyle.label,
      availableStyles,
      customInstructions,
      branchName,
      baseBranch,
      prState,
      hasRemoteBranch,
      existingPrNumber: existingPr?.number,
      existingPrUrl: existingPr?.url,
      defaultGuidelines: effectiveGuidelines,
      defaultTemplate: effectiveTemplate,
    };
  }

  public async applyDraft(options: ApplyDraftOptions): Promise<ApplyDraftResult> {
    const folder = this.repoScanner.getWorkspaceFolder();
    const git = new GitService(folder.uri.fsPath);
    const repository = await this.githubService.resolveRepository(git);
    const branchName = await git.getCurrentBranch();

    if (branchName !== options.draft.branchName) {
      throw new Error("The active branch changed while this PR draft was open. Regenerate the draft and try again.");
    }

    const existingPr = await this.githubService.findOpenPullRequest(repository, branchName, true);
    const hasRemoteBranch = await git.hasRemoteBranch(repository.remoteName, branchName);

    if (!existingPr) {
      if (!hasRemoteBranch) {
        const publish = await this.confirmAction(
          "This branch is only local. Publish it to GitHub and continue?",
          "Publish Branch"
        );
        if (!publish) {
          return { status: "cancelled" };
        }

        await git.pushCurrentBranch(repository.remoteName);
      }

      const create = await this.confirmAction(
        "No open PR was found for this branch. Create one with this reviewed title and description?",
        "Create PR"
      );
      if (!create) {
        return { status: "cancelled" };
      }

      const created = await this.githubService.createPullRequest(repository, {
        title: options.title,
        body: options.body,
        headBranch: branchName,
        baseBranch: options.draft.baseBranch,
      });

      return {
        status: "created",
        pullRequest: created,
      };
    }

    const update = await this.confirmAction(
      "An open PR already exists. Update its title and description with this reviewed draft?",
      "Update PR"
    );
    if (!update) {
      return { status: "cancelled" };
    }

    const updated = await this.githubService.updatePullRequest(repository, existingPr.number, {
      title: options.title,
      body: options.body,
    });

    return {
      status: "updated",
      pullRequest: updated,
    };
  }

  public withAppliedDraft(
    draft: PrDescriptionExplanation,
    title: string,
    body: string,
    pullRequest?: GitHubPullRequest
  ): PrDescriptionExplanation {
    const cards = [
      {
        title: "GitHub Status",
        body: pullRequest
          ? `Applied to pull request #${pullRequest.number}.`
          : "The reviewed draft is ready to apply.",
      },
      ...draft.cards.filter((card) => card.title !== "GitHub Status"),
    ];

    return {
      ...draft,
      cards,
      draftTitle: title,
      draftBody: body,
      prState: "existing-with-description",
      hasRemoteBranch: true,
      existingPrNumber: pullRequest?.number ?? draft.existingPrNumber,
      existingPrUrl: pullRequest?.url ?? draft.existingPrUrl,
    };
  }

  private resolveStyle(
    availableStyles: PrDescriptionStyleOption[],
    overrideStyle: PrDescriptionStyle | undefined,
    config: vscode.WorkspaceConfiguration
  ): PrDescriptionStyleOption {
    const configStyle = config.get<string>("prDescription.defaultStyle", "manager");
    const requestedStyle = overrideStyle ?? configStyle;
    return availableStyles.find((style) => style.id === requestedStyle)
      ?? availableStyles.find((style) => style.id === "manager")
      ?? availableStyles[0];
  }

  private getBuiltInStyles(): PrDescriptionStyleOption[] {
    return [
      {
        id: "business-stakeholder",
        label: "Business stakeholder",
        description: "Non-technical, impact-focused, and concise.",
        prompt: this.getBuiltInStylePrompt("business-stakeholder"),
        isBuiltIn: true,
      },
      {
        id: "code-collaborator",
        label: "Code collaborator",
        description: "Technical and implementation-aware.",
        prompt: this.getBuiltInStylePrompt("code-collaborator"),
        isBuiltIn: true,
      },
      {
        id: "manager",
        label: "Manager",
        description: "Semi-technical and delivery-focused.",
        prompt: this.getBuiltInStylePrompt("manager"),
        isBuiltIn: true,
      },
      {
        id: "other",
        label: "Other",
        description: "Use your own custom instructions after generation.",
        prompt: this.getBuiltInStylePrompt("other"),
        isBuiltIn: true,
      },
    ];
  }

  private getBuiltInStylePrompt(styleId: string): string {
    switch (styleId) {
      case "business-stakeholder":
        return "Business stakeholder: non-technical, impact-focused, concise, and outcome-oriented.";
      case "code-collaborator":
        return "Code collaborator: technical, implementation-aware, explicit about architecture, risks, and testing.";
      case "manager":
        return "Manager: semi-technical, balancing delivery impact with enough implementation detail to understand scope and risk.";
      case "other":
        return "Other: use the custom instructions as the primary guide and keep the tone professional.";
      default:
        return "Write a clear, professional pull request description that fits the requested audience.";
    }
  }

  private getCustomStyles(config: vscode.WorkspaceConfiguration): PrDescriptionStyleOption[] {
    const rawStyles = config.get<unknown[]>("prDescription.customStyles", []);
    if (!Array.isArray(rawStyles)) {
      return [];
    }

    return rawStyles.flatMap((style): PrDescriptionStyleOption[] => {
      if (!style || typeof style !== "object") {
        return [];
      }

      const candidate = style as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
      const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
      if (!id || !label || !description) {
        return [];
      }

      return [{
        id,
        label,
        description,
        prompt: typeof candidate.prompt === "string" ? candidate.prompt.trim() : "",
        template: typeof candidate.template === "string" ? candidate.template.trim() : "",
        guidelines: typeof candidate.guidelines === "string" ? candidate.guidelines.trim() : "",
        isBuiltIn: false,
      }];
    });
  }

  private buildCards(options: {
    rootPath: string;
    changedFiles: string[];
    prState: PrState;
    hasManagedBlock: boolean;
    existingPr?: GitHubPullRequest;
    defaultGuidelines: string;
    defaultTemplate: string;
  }): ExplanationCard[] {
    const changedFileRefs = options.changedFiles
      .slice(0, 12)
      .map((file) => toFileRef(options.rootPath, path.join(options.rootPath, file)));

    const cards: ExplanationCard[] = [
      {
        title: "GitHub Status",
        body: this.describePrState(options.prState, options.hasManagedBlock, options.existingPr),
      },
      {
        title: "Apply Flow",
        body: this.describeApplyFlow(options.prState),
      },
      {
        title: "Branch Scope",
        body: options.changedFiles.length
          ? `This draft is based on ${options.changedFiles.length} changed file(s) in the current branch.`
          : "No changed files were detected against the base branch.",
        refs: changedFileRefs,
      },
    ];

    if (options.defaultGuidelines) {
      cards.push({
        title: "Default Guidelines",
        body: options.defaultGuidelines,
      });
    }

    if (options.defaultTemplate) {
      cards.push({
        title: "Default Template",
        body: options.defaultTemplate,
      });
    }

    return cards;
  }

  private describePrState(
    prState: PrState,
    hasManagedBlock: boolean,
    existingPr?: GitHubPullRequest
  ): string {
    switch (prState) {
      case "no-pr":
        return "No open pull request was found for the current branch. Applying this draft will create one.";
      case "existing-empty":
        return existingPr
          ? `Found open pull request #${existingPr.number} with an empty description. Applying this draft will fill it in.`
          : "Found an open pull request with an empty description.";
      case "existing-with-description":
        if (hasManagedBlock) {
          return existingPr
            ? `Found open pull request #${existingPr.number} with an existing generated section. Applying this draft will update the managed content and preserve the rest.`
            : "Found an open pull request with an existing generated section.";
        }

        return existingPr
          ? `Found open pull request #${existingPr.number} with an existing description. Applying this draft will preserve the current content and add or refresh the Code Explainer section.`
          : "Found an open pull request with an existing description.";
    }
  }

  private describeApplyFlow(prState: PrState): string {
    switch (prState) {
      case "no-pr":
        return "Apply to GitHub will confirm branch publishing if needed, then confirm PR creation before any remote changes are made.";
      case "existing-empty":
      case "existing-with-description":
        return "Apply to GitHub will ask for confirmation before updating the pull request title and description.";
    }
  }

  private getPrState(existingPr?: GitHubPullRequest): PrState {
    if (!existingPr) {
      return "no-pr";
    }

    return existingPr.body.trim() ? "existing-with-description" : "existing-empty";
  }

  private composeDraftBody(existingBody: string, generatedBody: string): string {
    const managedBlock = this.wrapManagedBlock(generatedBody);
    if (!existingBody.trim()) {
      return managedBlock;
    }

    if (this.hasManagedBlock(existingBody)) {
      return existingBody.replace(
        new RegExp(`${escapeRegExp(GENERATED_BLOCK_START)}[\\s\\S]*?${escapeRegExp(GENERATED_BLOCK_END)}`, "m"),
        managedBlock
      ).trim();
    }

    return `${existingBody.trim()}\n\n${managedBlock}`.trim();
  }

  private wrapManagedBlock(content: string): string {
    return [
      GENERATED_BLOCK_START,
      content.trim(),
      GENERATED_BLOCK_END,
    ].join("\n");
  }

  private hasManagedBlock(body: string): boolean {
    return body.includes(GENERATED_BLOCK_START) && body.includes(GENERATED_BLOCK_END);
  }

  private parseDraftPayload(raw: string): DraftPayload {
    const json = this.extractJson(raw);
    return JSON.parse(json) as DraftPayload;
  }

  private extractJson(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      return trimmed;
    }

    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match?.[1]) {
      return match[1].trim();
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return trimmed.slice(start, end + 1);
    }

    throw new Error("PR description generation did not return valid JSON.");
  }

  private async confirmAction(message: string, actionLabel: string): Promise<boolean> {
    const result = await vscode.window.showInformationMessage(
      message,
      { modal: true },
      actionLabel
    );

    return result === actionLabel;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
