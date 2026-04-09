import * as path from "path";
import * as vscode from "vscode";
import { RepoContext } from "../../models/types";

export class RepoScanner {
  public async scan(maxFiles: number): Promise<RepoContext> {
    const folder = this.getWorkspaceFolder();
    const files = await vscode.workspace.findFiles("**/*", "**/{node_modules,.git,out}/**", maxFiles);

    const relativeFiles = files
      .map((uri) => path.relative(folder.uri.fsPath, uri.fsPath))
      .sort();

    const topLevelEntries = Array.from(new Set(relativeFiles.map((file) => file.split(path.sep)[0]))).sort();
    const manifests = relativeFiles.filter((file) =>
      /(^|\/)(package\.json|tsconfig\.json|pyproject\.toml|Cargo\.toml|go\.mod)$/i.test(file)
    );
    const readmes = relativeFiles.filter((file) => /(^|\/)(readme|docs)(\.|$)/i.test(file));

    return {
      workspaceName: folder.name,
      rootPath: folder.uri.fsPath,
      files: relativeFiles,
      topLevelEntries,
      manifests,
      readmes,
    };
  }

  public async scanDirectory(directoryPath: string, maxFiles: number): Promise<string[]> {
    const folder = this.getWorkspaceFolder();
    const relativePath = path.relative(folder.uri.fsPath, directoryPath);

    // Scan only files within the specific directory
    const pattern = `${relativePath}/**/*`;
    const files = await vscode.workspace.findFiles(pattern, "**/{node_modules,.git,out}/**", maxFiles);

    return files
      .map((uri) => path.relative(folder.uri.fsPath, uri.fsPath))
      .sort();
  }

  public getWorkspaceFolder(): vscode.WorkspaceFolder {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      throw new Error("Open a workspace folder before using Code Explainer.");
    }

    return folder;
  }
}
