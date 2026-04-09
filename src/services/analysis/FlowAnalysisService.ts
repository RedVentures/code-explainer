import * as vscode from "vscode";
import { FlowChart, FlowExplanation, FlowLane } from "../../models/types";
import { createProvider, getProviderConfig } from "../llm/ProviderFactory";
import { PromptBuilder } from "../llm/PromptBuilder";
import { GitService } from "../git/GitService";
import { RepoScanner } from "../repo/RepoScanner";
import { toFlowExplanation } from "./responseParsing";

type RawFlowNode = {
  id?: string;
  title?: string;
  subtitle?: string;
  lane?: string;
  order?: number;
  fileRef?: {
    path?: string;
    startLine?: number;
    label?: string;
  } | null;
};

type RawFlowEdge = {
  from?: string;
  to?: string;
  label?: string | null;
};

type RawFlowPayload = {
  headline?: string;
  summary?: string;
  notes?: string[];
  flowChart?: {
    title?: string;
    kind?: string;
    nodes?: RawFlowNode[];
    edges?: RawFlowEdge[];
  };
};

const validLanes: FlowLane[] = ["entry", "logic", "data", "external", "unknown"];

export class FlowAnalysisService {
  public constructor(
    private readonly repoScanner: RepoScanner,
    private readonly promptBuilder: PromptBuilder
  ) {}

  public async analyze(directoryPath?: string): Promise<FlowExplanation> {
    const folder = this.repoScanner.getWorkspaceFolder();
    const config = vscode.workspace.getConfiguration("codeExplainer");
    const maxFiles = config.get<number>("maxFilesInContext", 30);
    const git = new GitService(folder.uri.fsPath);

    if (!(await git.isGitRepo())) {
      throw new Error("The current workspace is not a git repository.");
    }

    const branchName = await git.getCurrentBranch();

    let repoContext;
    let scopeDescription = "Current branch";

    if (directoryPath) {
      // Scan only the specific directory
      const dirFiles = await this.repoScanner.scanDirectory(directoryPath, maxFiles);
      const fullRepoContext = await this.repoScanner.scan(50);

      // Create a limited context focused on the directory
      repoContext = {
        workspaceName: folder.name,
        rootPath: folder.uri.fsPath,
        files: dirFiles,
        topLevelEntries: fullRepoContext.topLevelEntries,
        manifests: fullRepoContext.manifests,
        readmes: dirFiles.filter((file) => /(^|\/)(readme|docs)(\.|$)/i.test(file)),
      };

      const relativePath = directoryPath.replace(folder.uri.fsPath, "").replace(/^\//, "");
      scopeDescription = `${relativePath} directory`;
    } else {
      // Scan the whole repo
      repoContext = await this.repoScanner.scan(maxFiles);
    }

    const provider = createProvider(getProviderConfig());
    const prompt = this.promptBuilder.buildBranchFlowPrompt({
      repo: repoContext,
      branchName,
      directoryScope: directoryPath ? scopeDescription : undefined,
    });

    const payload = this.parsePayload(await provider.generate(prompt), folder.uri.fsPath);

    return toFlowExplanation({
      headline: payload.headline,
      summary: payload.summary,
      notes: payload.notes,
      flowChart: payload.flowChart,
    });
  }

  private parsePayload(raw: string, defaultPath: string): {
    headline: string;
    summary: string;
    notes: string[];
    flowChart: FlowChart;
  } {
    const parsed = JSON.parse(this.extractJson(raw)) as RawFlowPayload;
    const rawChart = parsed.flowChart;

    if (!rawChart?.nodes?.length) {
      throw new Error("Flow-chart response did not include any nodes.");
    }

    const nodes = rawChart.nodes
      .filter((node): node is RawFlowNode & { id: string; title: string } => Boolean(node.id && node.title))
      .map((node, index) => ({
        id: node.id,
        title: node.title,
        subtitle: node.subtitle,
        lane: validLanes.includes((node.lane as FlowLane) ?? "unknown") ? (node.lane as FlowLane) : "unknown",
        order: typeof node.order === "number" ? node.order : index,
        fileRef: node.fileRef
          ? {
              path: node.fileRef.path || defaultPath,
              startLine: node.fileRef.startLine,
              label: node.fileRef.label || node.title,
            }
          : {
              path: defaultPath,
              label: node.title,
            },
      }));

    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = (rawChart.edges ?? []).filter(
      (edge): edge is RawFlowEdge & { from: string; to: string } =>
        Boolean(edge.from && edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to))
    ).map((edge) => ({
      from: edge.from,
      to: edge.to,
      label: edge.label ?? undefined,
    }));

    return {
      headline: parsed.headline?.trim() || "Current branch diagram",
      summary: parsed.summary?.trim() || "Diagram generated from the current branch snapshot.",
      notes: Array.isArray(parsed.notes) ? parsed.notes.filter(Boolean) : [],
      flowChart: {
        title: rawChart.title?.trim() || "Current Branch Architecture",
        kind: rawChart.kind === "impact" || rawChart.kind === "workflow" ? rawChart.kind : "workflow",
        nodes,
        edges,
      },
    };
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

    return trimmed;
  }
}
