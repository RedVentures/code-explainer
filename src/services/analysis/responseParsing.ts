import {
  AnalysisResult,
  BranchSummary,
  ExplanationCard,
  FileRef,
  FlowChart,
  FlowExplanation,
  RepoSummary,
  SelectionExplanation,
  TraceExplanation,
} from "../../models/types";

function markdownToCards(markdown: string): ExplanationCard[] {
  const sections = markdown
    .split(/\n(?=#{1,3}\s)/g)
    .map((section) => section.trim())
    .filter(Boolean);

  if (!sections.length) {
    return [{ title: "Summary", body: markdown.trim() }];
  }

  return sections.map((section) => {
    const lines = section.split("\n");
    const titleLine = lines.shift() ?? "Summary";
    const title = titleLine.replace(/^#{1,3}\s*/, "").trim() || "Summary";
    const body = lines.join("\n").trim() || title;
    return { title, body };
  });
}

export function toRepoSummary(markdown: string): RepoSummary {
  const cards = markdownToCards(markdown);
  return {
    kind: "repo",
    headline: cards[0]?.body.split("\n")[0] ?? "Repository overview",
    cards,
    nextActions: ["Explain current branch", "Explain selection", "Trace relationships"],
  };
}

export function toBranchSummary(markdown: string, branchName: string, baseBranch: string, changedFiles: FileRef[]): BranchSummary {
  const cards = markdownToCards(markdown)
    .map((card) => {
      // Clean up card titles for branch comparisons
      let title = card.title;

      // If title contains parenthetical text like "How It Works (Key Changes)", extract just the parenthetical part
      const parentheticalMatch = title.match(/^.*\(([^)]+)\)$/);
      if (parentheticalMatch) {
        title = parentheticalMatch[1];
      }

      return { ...card, title };
    })
    .filter((card) => {
      // Remove generic "How It Works" cards since we've extracted specific info
      return card.title !== "How It Works";
    });

  return {
    kind: "branch",
    headline: cards[0]?.body.split("\n")[0] ?? `Changes in ${branchName}`,
    branchName,
    baseBranch,
    cards,
    changedFiles,
    risks: [],
  };
}

export function toSelectionExplanation(
  markdown: string,
  fileName?: string,
  startLine?: number,
  endLine?: number
): SelectionExplanation {
  const cards = markdownToCards(markdown);
  let headline = "Selection overview";

  if (fileName && startLine !== undefined && endLine !== undefined) {
    headline = `Explain lines ${startLine}-${endLine} of ${fileName}`;
  }

  return {
    kind: "selection",
    headline,
    cards,
    nextActions: ["Draw current branch diagram", "Trace relationships", "Compare branch with main"],
  };
}

export function toTraceExplanation(markdown: string): TraceExplanation {
  const cards = markdownToCards(markdown);
  return {
    kind: "trace",
    headline: cards[0]?.body.split("\n")[0] ?? "Relationship overview",
    cards,
    nextActions: ["Draw current branch diagram", "Explain selection", "Compare branch with main"],
  };
}

export function toFlowExplanation(options: {
  headline: string;
  summary: string;
  notes: string[];
  flowChart: FlowChart;
}): FlowExplanation {
  const cards: ExplanationCard[] = [
    { title: "Summary", body: options.summary },
    ...(options.notes.length ? [{ title: "Notes", body: options.notes.join("\n") }] : []),
  ];

  return {
    kind: "flow",
    headline: options.headline,
    cards,
    nextActions: ["Explain selection", "Trace relationships", "Compare branch with main"],
    flowChart: options.flowChart,
  };
}
