import * as vscode from "vscode";
import { SelectionTarget } from "../../models/types";
import { MAX_SELECTION_CHARS, MAX_SURROUNDING_CHARS } from "../../utils/limits";

export class SymbolService {
  public async resolveEditor(target?: SelectionTarget): Promise<vscode.TextEditor> {
    if (!target) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw new Error("Open a file and select code before using Code Explainer.");
      }

      return editor;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target.filePath));
    const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One, true);
    const start = new vscode.Position(Math.max(target.startLine - 1, 0), 0);
    const endLine = Math.max(target.endLine - 1, 0);
    const end = new vscode.Position(endLine, document.lineAt(Math.min(endLine, document.lineCount - 1)).text.length);
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
    return editor;
  }

  public async getSelectionContext(editor: vscode.TextEditor): Promise<{
    selectionText: string;
    surroundingText: string;
    symbolName?: string;
    imports: string[];
  }> {
    const document = editor.document;
    const selection = editor.selection;

    const selectionText = document.getText(selection).slice(0, MAX_SELECTION_CHARS);
    if (!selectionText.trim()) {
      throw new Error("Select some code before asking for an explanation.");
    }

    const startLine = Math.max(selection.start.line - 20, 0);
    const endLine = Math.min(selection.end.line + 20, document.lineCount - 1);
    const surroundingRange = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
    const surroundingText = document.getText(surroundingRange).slice(0, MAX_SURROUNDING_CHARS);

    const imports = this.extractImports(document.getText());
    const symbolName = await this.findEnclosingSymbol(document, selection.active);

    return {
      selectionText,
      surroundingText,
      symbolName,
      imports,
    };
  }

  public async getEnclosingSymbolAt(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.DocumentSymbol | undefined> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    );

    if (!symbols?.length) {
      return undefined;
    }

    return this.findSymbol(symbols, position);
  }

  private extractImports(text: string): string[] {
    return text
      .split("\n")
      .filter((line) => /^\s*(import|from|const .* require\()/.test(line))
      .slice(0, 30);
  }

  private async findEnclosingSymbol(document: vscode.TextDocument, position: vscode.Position): Promise<string | undefined> {
    return (await this.getEnclosingSymbolAt(document, position))?.name;
  }

  private findSymbol(symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol | undefined {
    for (const symbol of symbols) {
      if (!symbol.range.contains(position)) {
        continue;
      }

      return this.findSymbol(symbol.children, position) ?? symbol;
    }

    return undefined;
  }
}
