import * as path from "path";
import * as vscode from "vscode";
import { FileRef, FlowChart, RelationshipSnapshot } from "../../models/types";
import { toFileRef } from "../../utils/refs";
import { SymbolService } from "./SymbolService";

export class RelationshipService {
  public constructor(private readonly symbolService: SymbolService) {}

  public async findNearbyFiles(filePath: string, rootPath: string): Promise<FileRef[]> {
    const basename = path.basename(filePath, path.extname(filePath));
    const pattern = `**/*${basename}*`;
    const uris = await vscode.workspace.findFiles(pattern, "**/{node_modules,.git,out}/**", 10);

    return uris
      .map((uri) => uri.fsPath)
      .filter((candidate) => candidate !== filePath)
      .slice(0, 6)
      .map((candidate) => toFileRef(rootPath, candidate));
  }

  public async analyzeSelectionRelationships(
    editor: vscode.TextEditor,
    rootPath: string,
    symbolName?: string
  ): Promise<RelationshipSnapshot> {
    const document = editor.document;
    if (this.isPythonLikeFile(document.uri.fsPath)) {
      return this.analyzePythonSelectionRelationships(editor, rootPath, symbolName);
    }

    const dependsOn = await this.findDependsOn(document, rootPath);
    const dependsOnFunctions = await this.findDependsOnFunctions(editor, rootPath, symbolName);
    const usedBy = await this.findUsedBy(editor, rootPath);
    const usedByFunctions = await this.findUsedByFunctions(editor, rootPath, symbolName);
    const relatedTestsAndConfig = await this.findRelatedTestsAndConfig(document.uri.fsPath, rootPath);
    const nearbyFiles = await this.findNearbyFiles(document.uri.fsPath, rootPath);
    const externalDependencies = this.extractExternalDependencies(document.getText());
    const graph = this.buildRelationshipGraph({
      filePath: document.uri.fsPath,
      rootPath,
      symbolName,
      dependsOn: dependsOnFunctions.length ? dependsOnFunctions : dependsOn,
      usedBy: usedByFunctions.length ? usedByFunctions : usedBy,
      relatedTestsAndConfig,
    });

    return {
      dependsOn,
      dependsOnFunctions,
      usedBy,
      usedByFunctions,
      relatedTestsAndConfig,
      nearbyFiles,
      externalDependencies,
      graph,
    };
  }

  private async analyzePythonSelectionRelationships(
    editor: vscode.TextEditor,
    rootPath: string,
    symbolName?: string
  ): Promise<RelationshipSnapshot> {
    const document = editor.document;
    const selectionText = document.getText(editor.selection);
    const selectedFunctionName = this.extractSelectedPythonFunctionName(selectionText) ?? symbolName;
    const dependsOnFunctions = selectedFunctionName
      ? await this.findPythonCalledFunctions(selectionText, rootPath, selectedFunctionName)
      : [];
    const usedByFunctions = selectedFunctionName
      ? await this.findPythonFunctionUsages(selectedFunctionName, document.uri.fsPath, editor.selection, rootPath)
      : [];
    const relatedTestsAndConfig = await this.findRelatedTestsAndConfig(document.uri.fsPath, rootPath);
    const nearbyFiles = await this.findNearbyFiles(document.uri.fsPath, rootPath);
    const graph = this.buildRelationshipGraph({
      filePath: document.uri.fsPath,
      rootPath,
      symbolName: selectedFunctionName ?? symbolName,
      dependsOn: dependsOnFunctions,
      usedBy: usedByFunctions,
      relatedTestsAndConfig,
    });

    return {
      dependsOn: [],
      dependsOnFunctions,
      usedBy: [],
      usedByFunctions,
      relatedTestsAndConfig,
      nearbyFiles,
      externalDependencies: [],
      graph,
    };
  }

  private async findDependsOn(document: vscode.TextDocument, rootPath: string): Promise<FileRef[]> {
    const lines = document.getText().split("\n");
    const refs: FileRef[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const specifier = this.extractModuleSpecifier(line);
      if (!specifier || !specifier.startsWith(".")) {
        continue;
      }

      const resolved = await this.resolveWorkspaceModule(document.uri.fsPath, specifier);
      if (!resolved || seen.has(resolved)) {
        continue;
      }

      seen.add(resolved);
      refs.push(toFileRef(rootPath, resolved));
      if (refs.length >= 8) {
        break;
      }
    }

    return refs;
  }

  private async findUsedBy(editor: vscode.TextEditor, rootPath: string): Promise<FileRef[]> {
    const references = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      editor.document.uri,
      editor.selection.active
    );

    if (!references?.length) {
      return [];
    }

    const currentPath = editor.document.uri.fsPath;
    const currentLine = editor.selection.active.line + 1;
    const seen = new Set<string>();
    const refs: FileRef[] = [];

    for (const reference of references) {
      const filePath = reference.uri.fsPath;
      const line = reference.range.start.line + 1;
      const key = `${filePath}:${line}`;
      if (filePath === currentPath && line === currentLine) {
        continue;
      }
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      refs.push(toFileRef(rootPath, filePath, line));
      if (refs.length >= 8) {
        break;
      }
    }

    return refs;
  }

  private async findDependsOnFunctions(
    editor: vscode.TextEditor,
    rootPath: string,
    currentSymbolName?: string
  ): Promise<FileRef[]> {
    const document = editor.document;
    const selectionText = document.getText(editor.selection);
    const selectionStartOffset = document.offsetAt(editor.selection.start);
    const callPattern = /\b([A-Za-z_$][\w$]*)\s*\(/g;
    const ignore = new Set([
      "if",
      "for",
      "while",
      "switch",
      "catch",
      "return",
      "typeof",
      "new",
      "await",
      "import",
      "function",
      "console",
      currentSymbolName ?? "",
    ]);
    const refs: FileRef[] = [];
    const seen = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = callPattern.exec(selectionText)) !== null) {
      const callee = match[1];
      if (!callee || ignore.has(callee)) {
        continue;
      }

      const position = document.positionAt(selectionStartOffset + match.index);
      const definitions = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
        "vscode.executeDefinitionProvider",
        document.uri,
        position
      );

      for (const definition of definitions ?? []) {
        const location = this.toLocation(definition);
        if (!location) {
          continue;
        }

        const targetDocument = await vscode.workspace.openTextDocument(location.uri);
        const enclosing = await this.symbolService.getEnclosingSymbolAt(targetDocument, location.range.start);
        const label = enclosing?.name ? `${enclosing.name}() - ${path.relative(rootPath, location.uri.fsPath)}` : `${callee}() - ${path.relative(rootPath, location.uri.fsPath)}`;
        const key = `${location.uri.fsPath}:${enclosing?.name ?? callee}:${location.range.start.line + 1}`;
        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        refs.push({
          path: location.uri.fsPath,
          startLine: location.range.start.line + 1,
          label,
        });
        if (refs.length >= 8) {
          return refs;
        }
      }
    }

    return refs;
  }

  private async findUsedByFunctions(
    editor: vscode.TextEditor,
    rootPath: string,
    currentSymbolName?: string
  ): Promise<FileRef[]> {
    const references = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      editor.document.uri,
      editor.selection.active
    );

    if (!references?.length) {
      return [];
    }

    const currentPath = editor.document.uri.fsPath;
    const seen = new Set<string>();
    const refs: FileRef[] = [];

    for (const reference of references) {
      const targetDocument = await vscode.workspace.openTextDocument(reference.uri);
      const enclosing = await this.symbolService.getEnclosingSymbolAt(targetDocument, reference.range.start);
      const enclosingName = enclosing?.name;
      const isCurrentSymbol =
        reference.uri.fsPath === currentPath &&
        currentSymbolName &&
        enclosingName &&
        enclosingName === currentSymbolName;

      if (isCurrentSymbol) {
        continue;
      }

      const labelBase = enclosingName ? `${enclosingName}()` : path.basename(reference.uri.fsPath);
      const label = `${labelBase} - ${path.relative(rootPath, reference.uri.fsPath)}`;
      const line = enclosing?.selectionRange.start.line ?? reference.range.start.line;
      const key = `${reference.uri.fsPath}:${enclosingName ?? "unknown"}:${line + 1}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      refs.push({
        path: reference.uri.fsPath,
        startLine: line + 1,
        label,
      });
      if (refs.length >= 8) {
        break;
      }
    }

    return refs;
  }

  private async findRelatedTestsAndConfig(filePath: string, rootPath: string): Promise<FileRef[]> {
    const basename = path.basename(filePath, path.extname(filePath));
    const currentDir = path.dirname(filePath);
    const patterns = [
      `**/*${basename}*.{test,spec}.*`,
      `**/*${basename}*`,
      "**/{package.json,tsconfig.json,jest.config.*,vitest.config.*,vite.config.*,webpack.config.*,eslint.config.*,prettier.config.*,playwright.config.*,cypress.config.*,*.config.*}",
    ];

    const collected: string[] = [];
    for (const pattern of patterns) {
      const matches = await vscode.workspace.findFiles(pattern, "**/{node_modules,.git,out}/**", 30);
      for (const match of matches) {
        collected.push(match.fsPath);
      }
    }

    const filtered = collected.filter((candidate) => {
      if (candidate === filePath) {
        return false;
      }

      const name = path.basename(candidate).toLowerCase();
      const relativeDir = path.relative(currentDir, path.dirname(candidate));
      const nearCurrent = !relativeDir.startsWith("..") || relativeDir.split(path.sep).length <= 2;

      return nearCurrent && (
        /\.(test|spec)\./i.test(name) ||
        /(^|\.)(config|setup|mock)\./i.test(name) ||
        name === "package.json" ||
        name === "tsconfig.json"
      );
    });

    return this.uniqueFileRefs(filtered, rootPath).slice(0, 8);
  }

  private async findPythonCalledFunctions(
    selectionText: string,
    rootPath: string,
    selectedFunctionName: string
  ): Promise<FileRef[]> {
    const ignore = new Set([
      "if",
      "for",
      "while",
      "return",
      "print",
      "len",
      "range",
      "str",
      "int",
      "float",
      "dict",
      "list",
      "set",
      "tuple",
      "super",
      selectedFunctionName,
    ]);
    const candidates = new Set<string>();
    const callPattern = /\b([A-Za-z_]\w*)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = callPattern.exec(selectionText)) !== null) {
      const name = match[1];
      if (name && !ignore.has(name)) {
        candidates.add(name);
      }
    }

    const refs: FileRef[] = [];
    for (const name of candidates) {
      const matches = await this.findPythonFunctionDefinitions(name, rootPath, 2);
      refs.push(...matches);
      if (refs.length >= 10) {
        break;
      }
    }

    return this.uniqueRefsByPathAndLine(refs).slice(0, 10);
  }

  private async findPythonFunctionUsages(
    functionName: string,
    currentFilePath: string,
    selection: vscode.Selection,
    rootPath: string
  ): Promise<FileRef[]> {
    const refs: FileRef[] = [];
    const seen = new Set<string>();
    const pattern = new RegExp(`\\b${this.escapeRegExp(functionName)}\\s*\\(`);
    const uris = await this.findPythonLikeFiles(200);

    for (const uri of uris) {
      const filePath = uri.fsPath;
      const text = await this.readSearchableText(uri);
      const lines = text.split("\n");

      for (let index = 0; index < lines.length; index += 1) {
        if (!pattern.test(lines[index])) {
          continue;
        }

        const line = index + 1;
        if (filePath === currentFilePath && selection.start.line + 1 <= line && line <= selection.end.line + 1) {
          continue;
        }

        const key = `${filePath}:${line}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        refs.push({
          path: filePath,
          startLine: line,
          label: `${functionName}() - ${path.relative(rootPath, filePath)}`,
        });
        if (refs.length >= 12) {
          return refs;
        }
      }
    }

    return refs.slice(0, 12);
  }

  private async findPythonFunctionDefinitions(
    functionName: string,
    rootPath: string,
    limit: number
  ): Promise<FileRef[]> {
    const refs: FileRef[] = [];
    const seen = new Set<string>();
    const pattern = new RegExp(`(?:async\\s+def|def)\\s+${this.escapeRegExp(functionName)}\\s*\\(`);
    const uris = await this.findPythonLikeFiles(100);

    for (const uri of uris) {
      const text = await this.readSearchableText(uri);
      const lines = text.split("\n");

      for (let index = 0; index < lines.length; index += 1) {
        if (!pattern.test(lines[index])) {
          continue;
        }

        const line = index + 1;
        const key = `${uri.fsPath}:${line}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        refs.push({
          path: uri.fsPath,
          startLine: line,
          label: `${functionName}() - ${path.relative(rootPath, uri.fsPath)}`,
        });
        if (refs.length >= limit) {
          return refs;
        }
      }
    }

    return refs.slice(0, limit);
  }

  private extractExternalDependencies(text: string): string[] {
    const deps = new Set<string>();

    for (const line of text.split("\n")) {
      const specifier = this.extractModuleSpecifier(line);
      if (!specifier || specifier.startsWith(".")) {
        continue;
      }

      const clean = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      if (clean) {
        deps.add(clean);
      }
      if (deps.size >= 6) {
        break;
      }
    }

    return Array.from(deps);
  }

  private buildRelationshipGraph(options: {
    filePath: string;
    rootPath: string;
    symbolName?: string;
    dependsOn: FileRef[];
    usedBy: FileRef[];
    relatedTestsAndConfig: FileRef[];
  }): FlowChart {
    const centerTitle = options.symbolName || path.basename(options.filePath);
    const nodes = [
      {
        id: "current",
        title: centerTitle,
        subtitle: "Selected code context",
        lane: "logic" as const,
        order: 1,
        fileRef: toFileRef(options.rootPath, options.filePath),
      },
      ...options.usedBy.slice(0, 3).map((ref, index) => ({
        id: `used-by-${index}`,
        title: ref.label ?? path.basename(ref.path),
        subtitle: "Calls or references this",
        lane: "entry" as const,
        order: index,
        fileRef: ref,
      })),
      ...options.dependsOn.slice(0, 3).map((ref, index) => ({
        id: `depends-on-${index}`,
        title: ref.label ?? path.basename(ref.path),
        subtitle: "Dependency or imported module",
        lane: "data" as const,
        order: index,
        fileRef: ref,
      })),
      ...options.relatedTestsAndConfig.slice(0, 2).map((ref, index) => ({
        id: `related-${index}`,
        title: ref.label ?? path.basename(ref.path),
        subtitle: "Test or config context",
        lane: "external" as const,
        order: index,
        fileRef: ref,
      })),
    ];

    const edges = [
      ...options.usedBy.slice(0, 3).map((_, index) => ({
        from: `used-by-${index}`,
        to: "current",
        label: "uses",
      })),
      ...options.dependsOn.slice(0, 3).map((_, index) => ({
        from: "current",
        to: `depends-on-${index}`,
        label: "depends on",
      })),
      ...options.relatedTestsAndConfig.slice(0, 2).map((_, index) => ({
        from: "current",
        to: `related-${index}`,
        label: "related",
      })),
    ];

    return {
      title: "Relationship Graph",
      kind: "workflow",
      nodes,
      edges,
    };
  }

  private extractModuleSpecifier(line: string): string | undefined {
    const importMatch = line.match(/from\s+["']([^"']+)["']/);
    if (importMatch?.[1]) {
      return importMatch[1];
    }

    const requireMatch = line.match(/require\(\s*["']([^"']+)["']\s*\)/);
    if (requireMatch?.[1]) {
      return requireMatch[1];
    }

    const sideEffectMatch = line.match(/^\s*import\s+["']([^"']+)["']/);
    return sideEffectMatch?.[1];
  }

  private toLocation(definition: vscode.Location | vscode.LocationLink): vscode.Location | undefined {
    if ("targetUri" in definition) {
      return new vscode.Location(definition.targetUri, definition.targetSelectionRange ?? definition.targetRange);
    }

    return definition;
  }

  private extractSelectedPythonFunctionName(selectionText: string): string | undefined {
    const match = selectionText.match(/^\s*(?:async\s+def|def)\s+([A-Za-z_]\w*)\s*\(/m);
    return match?.[1];
  }

  private isPythonLikeFile(filePath: string): boolean {
    return filePath.endsWith(".py") || filePath.endsWith(".ipynb") || filePath.endsWith(".pynb");
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private uniqueRefsByPathAndLine(refs: FileRef[]): FileRef[] {
    const seen = new Set<string>();
    return refs.filter((ref) => {
      const key = `${ref.path}:${ref.startLine ?? 0}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private async findPythonLikeFiles(limit: number): Promise<vscode.Uri[]> {
    return vscode.workspace.findFiles("**/*.{py,ipynb,pynb}", "**/{node_modules,.git,out}/**", limit);
  }

  private async readSearchableText(uri: vscode.Uri): Promise<string> {
    const document = await vscode.workspace.openTextDocument(uri);
    if (uri.fsPath.endsWith(".ipynb") || uri.fsPath.endsWith(".pynb")) {
      try {
        const parsed = JSON.parse(document.getText()) as {
          cells?: Array<{ cell_type?: string; source?: string[] | string }>;
        };
        const sources = parsed.cells
          ?.filter((cell) => cell.cell_type === "code")
          .flatMap((cell) => Array.isArray(cell.source) ? cell.source : [cell.source ?? ""]);
        return sources?.join("\n") ?? document.getText();
      } catch {
        return document.getText();
      }
    }

    return document.getText();
  }

  private async resolveWorkspaceModule(fromFilePath: string, specifier: string): Promise<string | undefined> {
    const basePath = path.resolve(path.dirname(fromFilePath), specifier);
    const candidates = [
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}.jsx`,
      `${basePath}.mts`,
      `${basePath}.cts`,
      path.join(basePath, "index.ts"),
      path.join(basePath, "index.tsx"),
      path.join(basePath, "index.js"),
      path.join(basePath, "index.jsx"),
    ];

    for (const candidate of candidates) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
        return candidate;
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private uniqueFileRefs(filePaths: string[], rootPath: string): FileRef[] {
    const seen = new Set<string>();
    const refs: FileRef[] = [];

    for (const filePath of filePaths) {
      if (seen.has(filePath)) {
        continue;
      }
      seen.add(filePath);
      refs.push(toFileRef(rootPath, filePath));
    }

    return refs;
  }
}
