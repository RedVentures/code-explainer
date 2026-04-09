import { BranchContext, PrDescriptionStyle, PromptInput, RepoContext, SelectionContext } from "../../models/types";

const sharedSystem = [
  "You are an expert software engineer helping a developer understand code.",
  "Return concise, structured markdown with these sections when relevant:",
  "Summary, Role in System, How It Works, Key Relationships, Changed From Main, What To Read Next, Open Questions.",
  "Ground claims in the supplied context. If context is insufficient, say so plainly.",
].join(" ");

export class PromptBuilder {
  public buildRepoPrompt(context: RepoContext): PromptInput {
    return {
      system: sharedSystem,
      user: [
        "Explain this repository at a high level.",
        `Workspace: ${context.workspaceName}`,
        `Root path: ${context.rootPath}`,
        `Top-level entries:\n${context.topLevelEntries.join("\n") || "(none)"}`,
        `Manifest files:\n${context.manifests.join("\n") || "(none)"}`,
        `README/docs files:\n${context.readmes.join("\n") || "(none)"}`,
        `Sample file list:\n${context.files.join("\n") || "(none)"}`,
      ].join("\n\n"),
    };
  }

  public buildDirectoryPrompt(context: {
    workspaceName: string;
    rootPath: string;
    directoryPath: string;
    directoryFiles: string[];
    repoTopLevel: string[];
    repoManifests: string[];
  }): PromptInput {
    return {
      system: sharedSystem,
      user: [
        `Explain this specific directory within a larger repository.`,
        `Focus primarily on the directory contents, but be aware of the broader repo context.`,
        `Workspace: ${context.workspaceName}`,
        `Root path: ${context.rootPath}`,
        `Directory being analyzed: ${context.directoryPath}`,
        `\nBroader repo context (for reference):`,
        `Top-level directories: ${context.repoTopLevel.join(", ") || "(none)"}`,
        `Key manifests: ${context.repoManifests.slice(0, 5).join(", ") || "(none)"}`,
        `\nFiles in this directory:\n${context.directoryFiles.join("\n") || "(none)"}`,
      ].join("\n\n"),
    };
  }

  public buildBranchPrompt(context: BranchContext): PromptInput {
    return {
      system: sharedSystem,
      user: [
        `Explain the current branch against ${context.baseBranch}.`,
        `Branch: ${context.branchName}`,
        `Merge base: ${context.mergeBase ?? "unknown"}`,
        `Changed files:\n${context.changedFiles.join("\n") || "(none)"}`,
        `Diff excerpt:\n${context.diff || "(no diff available)"}`,
      ].join("\n\n"),
    };
  }

  public buildFileComparisonPrompt(context: {
    filePath: string;
    branchName: string;
    baseBranch: string;
    diff: string;
  }): PromptInput {
    return {
      system: sharedSystem,
      user: [
        `Analyze the changes made to this file in the current branch compared to ${context.baseBranch}.`,
        `Focus on what changed, why it might have changed, and the impact of these changes.`,
        `Include both committed changes and any uncommitted local changes.`,
        `File: ${context.filePath}`,
        `Current branch: ${context.branchName}`,
        `Comparing against: ${context.baseBranch}`,
        `\nChanges:\n${context.diff}`,
      ].join("\n\n"),
    };
  }

  public buildSelectionPrompt(context: SelectionContext): PromptInput {
    return {
      system: sharedSystem,
      user: [
        "Explain the selected code in context.",
        `File: ${context.filePath}`,
        `Lines: ${context.startLine}-${context.endLine}`,
        `Enclosing symbol: ${context.symbolName ?? "unknown"}`,
        `Imports:\n${context.imports.join("\n") || "(none)"}`,
        `Selection:\n${context.selection}`,
        `Surrounding text:\n${context.surroundingText}`,
      ].join("\n\n"),
    };
  }

  public buildFlowPrompt(context: SelectionContext): PromptInput {
    return {
      system: [
        "You are an expert software engineer building a code-comprehension flow chart.",
        "Return valid JSON only. No markdown fences. No prose outside the JSON object.",
        'Use this schema: {"headline": string, "summary": string, "notes": string[], "flowChart": {"title": string, "kind": "execution", "nodes": [{"id": string, "title": string, "subtitle": string, "lane": "entry"|"logic"|"data"|"external"|"unknown", "order": number, "fileRef": {"path": string, "startLine": number, "label": string} | null}], "edges": [{"from": string, "to": string, "label": string | null}]}}.',
        "Keep the chart to 4-8 nodes. Prefer boxes that help a human read the code path.",
        "If something is inferred rather than explicit, say that in notes or subtitle.",
      ].join(" "),
      user: [
        "Draw a flow chart for the selected code.",
        `File: ${context.filePath}`,
        `Lines: ${context.startLine}-${context.endLine}`,
        `Enclosing symbol: ${context.symbolName ?? "unknown"}`,
        `Imports:\n${context.imports.join("\n") || "(none)"}`,
        `Selection:\n${context.selection}`,
        `Surrounding text:\n${context.surroundingText}`,
      ].join("\n\n"),
    };
  }

  public buildBranchFlowPrompt(context: { repo: RepoContext; branchName: string; directoryScope?: string }): PromptInput {
    const scopeInstruction = context.directoryScope
      ? `Focus specifically on the ${context.directoryScope}. `
      : "";

    return {
      system: [
        "You are an expert software engineer building a branch-level code-comprehension flow chart.",
        "Return valid JSON only. No markdown fences. No prose outside the JSON object.",
        'Use this schema: {"headline": string, "summary": string, "notes": string[], "flowChart": {"title": string, "kind": "workflow"|"impact", "nodes": [{"id": string, "title": string, "subtitle": string, "lane": "entry"|"logic"|"data"|"external"|"unknown", "order": number, "fileRef": {"path": string, "startLine": number, "label": string} | null}], "edges": [{"from": string, "to": string, "label": string | null}]}}.',
        "The chart should describe the overall architecture of the current branch as it exists now.",
        "Keep the chart to 5-10 nodes. Group related files or subsystems into meaningful boxes instead of listing everything.",
        "Prefer a vertical top-to-bottom architecture diagram with clear layers.",
        "Every node must have a short subtitle describing what it does in 3-7 words.",
        "Use clear full words only. Never use broken abbreviations or clipped words like des, mgr, svc, cfg unless they are exact code identifiers the user would already know.",
        "Titles should usually be 1-3 words and at most 24 characters when possible.",
        "Subtitles should usually be 1 line and at most 36 characters. Keep them concrete and human-readable.",
        "Do not cram multiple ideas into one node. Split them into separate nodes if needed.",
        "Avoid crossing relationships. Favor a simple mainline flow with a few side connections at most.",
        "Focus on the current branch snapshot, not on diffs versus another branch.",
        "If architectural intent is partially inferred, say that in notes or subtitle.",
      ].join(" "),
      user: [
        `Draw an overall diagram for the current branch. ${scopeInstruction}`,
        `Workspace: ${context.repo.workspaceName}`,
        `Root path: ${context.repo.rootPath}`,
        `Top-level entries:\n${context.repo.topLevelEntries.join("\n") || "(none)"}`,
        `Manifest files:\n${context.repo.manifests.join("\n") || "(none)"}`,
        `README/docs files:\n${context.repo.readmes.join("\n") || "(none)"}`,
        `Branch: ${context.branchName}`,
        `Sample file list:\n${context.repo.files.join("\n") || "(none)"}`,
      ].join("\n\n"),
    };
  }

  public buildPrDescriptionPrompt(context: {
    branchName: string;
    baseBranch: string;
    changedFiles: string[];
    diff: string;
    existingTitle?: string;
    existingBody?: string;
    style: PrDescriptionStyle;
    customInstructions?: string;
    teamGuidelines?: string;
    template?: string;
  }): PromptInput {
    return {
      system: [
        "You write polished GitHub pull request titles and PR summary sections.",
        "Return valid JSON only. No markdown fences. No prose outside the JSON object.",
        'Use this schema: {"title": string, "generatedBody": string}.',
        "The generatedBody will be inserted into a managed section inside the full PR description, so do not mention markers, automation, or implementation notes about the tool itself.",
        "Default shape: a short executive summary followed by clear markdown sections.",
        "Be accurate to the supplied diff. If something is inferred, say so carefully.",
        "Keep the language readable and specific rather than generic release-note filler.",
      ].join(" "),
      user: [
        "Generate a PR title and PR description section for the current branch.",
        `Audience/style: ${this.getPrStyleGuidance(context.style)}`,
        `Current branch: ${context.branchName}`,
        `Base branch: ${context.baseBranch}`,
        `Changed files:\n${context.changedFiles.join("\n") || "(none)"}`,
        `Diff excerpt:\n${context.diff || "(no diff available)"}`,
        `Existing PR title:\n${context.existingTitle?.trim() || "(none)"}`,
        `Existing PR body:\n${context.existingBody?.trim() || "(none)"}`,
        `Team guidelines:\n${context.teamGuidelines?.trim() || "(none)"}`,
        `Preferred template:\n${context.template?.trim() || "(none)"}`,
        `Custom run instructions:\n${context.customInstructions?.trim() || "(none)"}`,
      ].join("\n\n"),
    };
  }

  private getPrStyleGuidance(style: PrDescriptionStyle): string {
    switch (style) {
      case "business-stakeholder":
        return "Business stakeholder: non-technical, impact-focused, concise, and outcome-oriented.";
      case "code-collaborator":
        return "Code collaborator: technical, implementation-aware, explicit about architecture, risks, and testing.";
      case "manager":
        return "Manager: semi-technical, balancing delivery impact with enough implementation detail to understand scope and risk.";
      case "other":
        return "Other: use the custom instructions as the primary guide and keep the tone professional.";
    }
  }
}
