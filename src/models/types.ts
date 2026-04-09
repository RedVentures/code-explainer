export type ProviderName = "openai" | "anthropic";
export type PrDescriptionStyle = string;
export type PrState = "no-pr" | "existing-empty" | "existing-with-description";

export type PrDescriptionStyleOption = {
  id: PrDescriptionStyle;
  label: string;
  description: string;
  prompt?: string;
  template?: string;
  guidelines?: string;
  isBuiltIn?: boolean;
};

export type FileRef = {
  path: string;
  startLine?: number;
  label?: string;
};

export type ExplanationCard = {
  title: string;
  body: string;
  refs?: FileRef[];
};

export type FlowLane = "entry" | "logic" | "data" | "external" | "unknown";

export type FlowNode = {
  id: string;
  title: string;
  subtitle?: string;
  lane: FlowLane;
  order: number;
  fileRef?: FileRef;
};

export type FlowEdge = {
  from: string;
  to: string;
  label?: string;
};

export type FlowChart = {
  title: string;
  kind: "execution" | "workflow" | "impact";
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type RelationshipSnapshot = {
  dependsOn: FileRef[];
  dependsOnFunctions: FileRef[];
  usedBy: FileRef[];
  usedByFunctions: FileRef[];
  relatedTestsAndConfig: FileRef[];
  nearbyFiles: FileRef[];
  externalDependencies: string[];
  graph: FlowChart;
};

export type RepoSummary = {
  kind: "repo";
  headline: string;
  cards: ExplanationCard[];
  nextActions: string[];
  flowChart?: FlowChart;
};

export type BranchSummary = {
  kind: "branch";
  headline: string;
  branchName: string;
  baseBranch: string;
  cards: ExplanationCard[];
  changedFiles: FileRef[];
  risks: string[];
  flowChart?: FlowChart;
};

export type SelectionExplanation = {
  kind: "selection";
  headline: string;
  cards: ExplanationCard[];
  nextActions: string[];
  flowChart?: FlowChart;
};

export type TraceExplanation = {
  kind: "trace";
  headline: string;
  cards: ExplanationCard[];
  nextActions: string[];
  flowChart?: FlowChart;
};

export type FlowExplanation = {
  kind: "flow";
  headline: string;
  cards: ExplanationCard[];
  nextActions: string[];
  flowChart: FlowChart;
};

export type PrDescriptionExplanation = {
  kind: "prDescription";
  headline: string;
  cards: ExplanationCard[];
  draftTitle: string;
  draftBody: string;
  style: PrDescriptionStyle;
  styleLabel: string;
  availableStyles: PrDescriptionStyleOption[];
  customInstructions: string;
  branchName: string;
  baseBranch: string;
  prState: PrState;
  hasRemoteBranch: boolean;
  existingPrNumber?: number;
  existingPrUrl?: string;
  defaultGuidelines?: string;
  defaultTemplate?: string;
};

export type AnalysisResult =
  | RepoSummary
  | BranchSummary
  | SelectionExplanation
  | TraceExplanation
  | FlowExplanation
  | PrDescriptionExplanation;

export type RepoContext = {
  workspaceName: string;
  rootPath: string;
  files: string[];
  topLevelEntries: string[];
  manifests: string[];
  readmes: string[];
};

export type BranchContext = {
  branchName: string;
  baseBranch: string;
  mergeBase?: string;
  changedFiles: string[];
  diff: string;
};

export type SelectionContext = {
  filePath: string;
  selection: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  imports: string[];
  surroundingText: string;
};

export type PromptInput = {
  system: string;
  user: string;
};

export type ProviderConfig = {
  provider: ProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
};

export type SelectionTarget = {
  filePath: string;
  startLine: number;
  endLine: number;
};

export type CachedResultSource =
  | { kind: "repo" }
  | { kind: "directory"; directoryPath: string }
  | { kind: "branch"; baseBranch: string }
  | ({ kind: "selection" } & SelectionTarget)
  | ({ kind: "trace" } & SelectionTarget)
  | { kind: "flow"; branchName: string };

export type CachedResultEntry = {
  key: string;
  label: string;
  updatedAt: number;
  result: AnalysisResult;
  source: CachedResultSource;
};
