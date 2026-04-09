import * as vscode from "vscode";
import { FileRef, SelectionExplanation, SelectionTarget, TraceExplanation } from "../../models/types";
import { createProvider, getProviderConfig } from "../llm/ProviderFactory";
import { PromptBuilder } from "../llm/PromptBuilder";
import { RelationshipService } from "../repo/RelationshipService";
import { RepoScanner } from "../repo/RepoScanner";
import { SymbolService } from "../repo/SymbolService";
import { toSelectionExplanation, toTraceExplanation } from "./responseParsing";

export class SelectionAnalysisService {
  public constructor(
    private readonly repoScanner: RepoScanner,
    private readonly symbolService: SymbolService,
    private readonly relationshipService: RelationshipService,
    private readonly promptBuilder: PromptBuilder
  ) {}

  public async explainSelection(target?: SelectionTarget): Promise<SelectionExplanation> {
    const editor = await this.symbolService.resolveEditor(target);
    const folder = this.repoScanner.getWorkspaceFolder();
    const context = await this.symbolService.getSelectionContext(editor);
    const provider = createProvider(getProviderConfig());
    const startLine = editor.selection.start.line + 1;
    const endLine = editor.selection.end.line + 1;
    const prompt = this.promptBuilder.buildSelectionPrompt({
      filePath: editor.document.uri.fsPath,
      selection: context.selectionText,
      startLine,
      endLine,
      symbolName: context.symbolName,
      imports: context.imports,
      surroundingText: context.surroundingText,
    });
    const markdown = await provider.generate(prompt);
    const fileName = editor.document.uri.fsPath.split("/").pop() ?? "file";
    const result = toSelectionExplanation(markdown, fileName, startLine, endLine);

    // Gather related files based on imports, references, and dependencies
    const relatedFiles = await this.gatherRelatedFiles(editor, folder.uri.fsPath, context.symbolName);

    result.cards.push({
      title: "Related Files",
      body: relatedFiles.length > 0
        ? "Files imported by, referencing, or related to the selected code."
        : "No directly related files were found for this selection.",
      refs: relatedFiles,
    });
    return result;
  }

  private async gatherRelatedFiles(
    editor: vscode.TextEditor,
    rootPath: string,
    symbolName?: string
  ): Promise<FileRef[]> {
    const allRefs: FileRef[] = [];
    const seen = new Set<string>();
    const currentFilePath = editor.document.uri.fsPath;

    // Helper to check if a file is in the workspace and not a config file
    const isWorkspaceFile = (ref: FileRef): boolean => {
      if (!ref.path.startsWith(rootPath)) {
        return false;
      }

      // Exclude common config files
      const filename = ref.path.split('/').pop() || '';
      const configPatterns = [
        /^package\.json$/,
        /^tsconfig\.json$/,
        /\.config\.(js|ts|mjs|cjs)$/,
        /^jest\.config/,
        /^vitest\.config/,
        /^vite\.config/,
        /^webpack\.config/,
        /^eslint\.config/,
        /^prettier\.config/,
      ];

      return !configPatterns.some(pattern => pattern.test(filename));
    };

    // 1. Get file-level imports/dependencies (most reliable)
    const dependsOn = await this.relationshipService["findDependsOn"](editor.document, rootPath);
    const workspaceDeps = dependsOn.filter(isWorkspaceFile);

    // 2. Get files that reference this code
    const usedBy = await this.relationshipService["findUsedBy"](editor, rootPath);
    const workspaceUsedBy = usedBy.filter(isWorkspaceFile);

    // 3. Get function-level relationships (may include workspace files)
    const dependsOnFunctions = await this.relationshipService["findDependsOnFunctions"](editor, rootPath, symbolName);
    const workspaceDepFunctions = dependsOnFunctions.filter(isWorkspaceFile);

    const usedByFunctions = await this.relationshipService["findUsedByFunctions"](editor, rootPath, symbolName);
    const workspaceUsedByFunctions = usedByFunctions.filter(isWorkspaceFile);

    // Prioritize: file imports > usages > function calls
    const prioritizedRefs = [
      ...workspaceDeps,
      ...workspaceUsedBy,
      ...workspaceDepFunctions,
      ...workspaceUsedByFunctions,
    ];

    // Add unique refs
    for (const ref of prioritizedRefs) {
      const key = `${ref.path}:${ref.startLine ?? 0}`;
      if (!seen.has(key) && ref.path !== currentFilePath) {
        seen.add(key);
        allRefs.push(ref);
        if (allRefs.length >= 8) {
          break;
        }
      }
    }

    // If we found few results, supplement with nearby files (tests, similar names)
    if (allRefs.length < 4) {
      const nearbyFiles = await this.relationshipService["findNearbyFiles"](currentFilePath, rootPath);
      for (const ref of nearbyFiles) {
        const key = `${ref.path}:${ref.startLine ?? 0}`;
        if (!seen.has(key) && ref.path !== currentFilePath && isWorkspaceFile(ref)) {
          seen.add(key);
          allRefs.push(ref);
          if (allRefs.length >= 8) {
            break;
          }
        }
      }
    }

    return allRefs.slice(0, 8);
  }

  public async traceRelationships(target?: SelectionTarget): Promise<TraceExplanation> {
    const editor = await this.symbolService.resolveEditor(target);
    const folder = this.repoScanner.getWorkspaceFolder();
    const context = await this.symbolService.getSelectionContext(editor);
    const selection = await this.explainSelection(target);
    const relationships = await this.relationshipService.analyzeSelectionRelationships(
      editor,
      folder.uri.fsPath,
      context.symbolName
    );

    const result = toTraceExplanation(
      [
        "# Summary",
        selection.headline,
        "",
        "## Key Relationships",
        "Trace focused on direct dependencies, usages, tests/config, and nearby context.",
      ].join("\n")
    );

    result.cards.push({
      title: "Depends On Functions",
      body: relationships.dependsOnFunctions.length
        ? "Functions called inside the selected section, with their `.py` or `.ipynb` definition files."
        : relationships.dependsOn.length
          ? "No specific function definitions were resolved, but local file dependencies were found."
          : "No called functions were identified from the selected section.",
      refs: relationships.dependsOnFunctions.length ? relationships.dependsOnFunctions : relationships.dependsOn,
    });
    result.cards.push({
      title: "Used By Functions",
      body: relationships.usedByFunctions.length
        ? "Other places in `.py` or `.ipynb` files that call the selected function."
        : relationships.usedBy.length
          ? "Incoming file-level references were found, but enclosing caller functions were not resolved."
          : "No calls to the selected function were found in other `.py` or `.ipynb` files.",
      refs: relationships.usedByFunctions.length ? relationships.usedByFunctions : relationships.usedBy,
    });
    result.cards.push({
      title: "Related Tests And Config",
      body: relationships.relatedTestsAndConfig.length
        ? "Likely tests, setup files, or configuration near this code."
        : "No nearby tests or configuration files were identified.",
      refs: relationships.relatedTestsAndConfig,
    });
    return result;
  }
}
