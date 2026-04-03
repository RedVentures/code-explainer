import * as vscode from "vscode";
import { SelectionExplanation, SelectionTarget, TraceExplanation } from "../../models/types";
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
    const prompt = this.promptBuilder.buildSelectionPrompt({
      filePath: editor.document.uri.fsPath,
      selection: context.selectionText,
      startLine: editor.selection.start.line + 1,
      endLine: editor.selection.end.line + 1,
      symbolName: context.symbolName,
      imports: context.imports,
      surroundingText: context.surroundingText,
    });
    const markdown = await provider.generate(prompt);
    const result = toSelectionExplanation(markdown);
    result.cards.push({
      title: "Related Files",
      body: "Likely nearby files worth reading next.",
      refs: await this.relationshipService.findNearbyFiles(editor.document.uri.fsPath, folder.uri.fsPath),
    });
    return result;
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
