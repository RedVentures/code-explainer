import * as vscode from "vscode";
import { CacheService } from "../../storage/CacheService";

type SidebarNode = {
  id: string;
  label: string;
  description?: string;
  command?: vscode.Command;
};

export class CodeExplainerProvider implements vscode.TreeDataProvider<SidebarNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SidebarNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(private readonly cacheService: CacheService) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: SidebarNode): vscode.TreeItem {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.id = element.id;
    item.description = element.description;
    item.command = element.command;
    return item;
  }

  public getChildren(): SidebarNode[] {
    const actions: SidebarNode[] = [
      {
        id: "repo",
        label: "Explain Repo",
        command: { command: "codeExplainer.explainRepo", title: "Explain Repo" },
      },
      {
        id: "branch",
        label: "Compare Branch With Main",
        command: { command: "codeExplainer.compareBranch", title: "Compare Branch" },
      },
      {
        id: "selection",
        label: "Explain Selection",
        command: { command: "codeExplainer.explainSelection", title: "Explain Selection" },
      },
      {
        id: "relationships",
        label: "Trace Relationships",
        command: { command: "codeExplainer.traceRelationships", title: "Trace Relationships" },
      },
      {
        id: "flow",
        label: "Draw Branch Diagram",
        command: { command: "codeExplainer.drawFlowChart", title: "Draw Branch Diagram" },
      },
    ];

    const recents = this.cacheService.list().map((entry) => ({
      id: `recent:${entry.key}`,
      label: entry.label,
      description: new Date(entry.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      command: {
        command: "codeExplainer.openCachedResult",
        title: "Open Cached Result",
        arguments: [entry.key],
      },
    }));

    return [...actions, ...recents];
  }
}
