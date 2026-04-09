import * as vscode from "vscode";
import { CacheService } from "../../storage/CacheService";

type SidebarNode = {
  id: string;
  label: string;
  description?: string;
  command?: vscode.Command;
  collapsibleState?: vscode.TreeItemCollapsibleState;
  contextValue?: string;
};

export class CodeExplainerProvider implements vscode.TreeDataProvider<SidebarNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<SidebarNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  public constructor(private readonly cacheService: CacheService) {}

  public refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(element: SidebarNode): vscode.TreeItem {
    const collapsibleState = element.collapsibleState ?? vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(element.label, collapsibleState);
    item.id = element.id;
    item.description = element.description;
    item.command = element.command;
    item.contextValue = element.contextValue;
    return item;
  }

  public getChildren(element?: SidebarNode): SidebarNode[] {
    // Root level - show actions and history parent
    if (!element) {
      const actions: SidebarNode[] = [
        {
          id: "repo",
          label: "Explain Repo",
          command: { command: "codeExplainer.explainRepo", title: "Explain Repo" },
        },
        {
          id: "directory",
          label: "Explain Directory",
          command: { command: "codeExplainer.explainDirectory", title: "Explain Directory" },
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
        {
          id: "pr-description",
          label: "Generate PR Description",
          command: { command: "codeExplainer.generatePrDescription", title: "Generate PR Description" },
        },
      ];

      const cachedItems = this.cacheService.list();
      if (cachedItems.length > 0) {
        const historyNode: SidebarNode = {
          id: "history",
          label: "History",
          description: `${cachedItems.length} item${cachedItems.length === 1 ? "" : "s"}`,
          collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
          contextValue: "history",
        };
        return [...actions, historyNode];
      }

      return actions;
    }

    // History node - show category subcategories
    if (element.id === "history") {
      const cachedItems = this.cacheService.list();
      const categories = [
        { id: "history:repo", label: "Explain Repo", kind: "repo" },
        { id: "history:directory", label: "Explain Directory", kind: "directory" },
        { id: "history:branch", label: "Compare Branch With Main", kind: "branch" },
        { id: "history:selection", label: "Explain Selection", kind: "selection" },
        { id: "history:trace", label: "Trace Relationships", kind: "trace" },
        { id: "history:flow", label: "Draw Branch Diagram", kind: "flow" },
      ];

      const categoryNodes: SidebarNode[] = [];
      for (const category of categories) {
        const itemsInCategory = cachedItems.filter((entry) => entry.source.kind === category.kind);
        if (itemsInCategory.length > 0) {
          categoryNodes.push({
            id: category.id,
            label: category.label,
            description: `${itemsInCategory.length}`,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            contextValue: "historyCategory",
          });
        }
      }

      return categoryNodes;
    }

    // History category nodes - show cached items for that category
    if (element.id?.startsWith("history:")) {
      const kind = element.id.split(":")[1];
      return this.cacheService
        .list()
        .filter((entry) => entry.source.kind === kind)
        .map((entry) => ({
          id: `recent:${entry.key}`,
          label: entry.label,
          description: new Date(entry.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          command: {
            command: "codeExplainer.openCachedResult",
            title: "Open Cached Result",
            arguments: [entry.key],
          },
        }));
    }

    return [];
  }
}
