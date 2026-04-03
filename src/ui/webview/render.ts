import { AnalysisResult, FileRef, FlowChart, FlowLane } from "../../models/types";
import { formatFileRef } from "../../utils/refs";

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderRefs(refs: FileRef[] | undefined): string {
  if (!refs?.length) {
    return "";
  }

  const items = refs
    .map((ref) => `<li><a href="#" data-file-ref="${escapeHtml(formatFileRef(ref))}">${escapeHtml(ref.label ?? formatFileRef(ref))}</a></li>`)
    .join("");

  return `<div class="refs"><div class="refs-title">Evidence</div><ul>${items}</ul></div>`;
}

function renderCards(result: AnalysisResult): string {
  return result.cards
    .map(
      (card) => `
        <section class="card">
          <h2>${escapeHtml(card.title)}</h2>
          <pre>${escapeHtml(card.body)}</pre>
          ${renderRefs(card.refs)}
        </section>
      `
    )
    .join("");
}

function renderActions(result: AnalysisResult): string {
  const actions = "nextActions" in result ? result.nextActions : ["Explain selection", "Compare branch with main"];
  return [
    `<button class="action" data-refresh="true">Refresh Result</button>`,
    ...actions.map((action) => `<button class="action" data-action="${escapeHtml(action)}">${escapeHtml(action)}</button>`),
  ].join("");
}

function renderTabs(result: AnalysisResult): string {
  if (!("flowChart" in result) || !result.flowChart) {
    return "";
  }

  return `
    <div class="tabs">
      <button class="tab is-active" data-tab="summary">Summary</button>
      <button class="tab" data-tab="flow">Flow Chart</button>
    </div>
  `;
}

function renderFlowPanel(result: AnalysisResult): string {
  if (!("flowChart" in result) || !result.flowChart) {
    return "";
  }

  const eyebrow = result.kind === "trace" ? "Relationship Graph" : "Branch Diagram";

  return `
    <section class="flow-panel is-hidden" data-panel="flow">
      <div class="flow-panel-header">
        <div>
          <div class="eyebrow">${escapeHtml(eyebrow)}</div>
          <h2>${escapeHtml(result.flowChart.title)}</h2>
        </div>
        <div class="flow-panel-actions">
          <button class="action save-png" data-save-png="true">Save PNG</button>
        </div>
      </div>
      <div class="legend">
        ${(["entry", "logic", "data", "external", "unknown"] as FlowLane[])
          .map((lane) => `<span class="legend-item lane-${lane}">${escapeHtml(lane)}</span>`)
          .join("")}
      </div>
      <div class="flow-stage" id="flow-stage">
        <svg class="flow-svg" id="flow-svg"></svg>
      </div>
    </section>
  `;
}

function encodeFlowChart(flowChart: FlowChart | undefined): string {
  return JSON.stringify(flowChart ?? null).replaceAll("<", "\\u003c");
}

export function renderHtml(title: string, result: AnalysisResult): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(title)}</title>
        <style>
          :root {
            color-scheme: light dark;
            --bg: #07111f;
            --panel: #0f1b2d;
            --panel-alt: #15243c;
            --text: #ecf3ff;
            --muted: #98abc9;
            --accent: #7dd3fc;
            --border: rgba(125, 211, 252, 0.18);
          }
          body {
            margin: 0;
            padding: 24px;
            background:
              radial-gradient(circle at top right, rgba(125, 211, 252, 0.15), transparent 32%),
              linear-gradient(180deg, #07111f 0%, #0a1324 100%);
            color: var(--text);
            font: 14px/1.5 "SF Mono", Monaco, Consolas, monospace;
          }
          h1 {
            margin: 0 0 16px;
            font-size: 24px;
          }
          .headline {
            padding: 16px 18px;
            border: 1px solid var(--border);
            border-radius: 16px;
            background: rgba(21, 36, 60, 0.85);
            margin-bottom: 20px;
          }
          .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin: 0 0 20px;
          }
          .action {
            border: 1px solid var(--border);
            border-radius: 999px;
            padding: 8px 12px;
            background: transparent;
            color: var(--accent);
            cursor: pointer;
          }
          .card {
            margin-bottom: 16px;
            padding: 16px 18px;
            border: 1px solid var(--border);
            border-radius: 16px;
            background: rgba(15, 27, 45, 0.9);
          }
          .tabs {
            display: flex;
            gap: 8px;
            margin: 0 0 20px;
          }
          .tab {
            border: 1px solid var(--border);
            border-radius: 999px;
            padding: 8px 12px;
            background: transparent;
            color: var(--muted);
            cursor: pointer;
          }
          .tab.is-active {
            color: var(--text);
            background: rgba(125, 211, 252, 0.12);
          }
          .panel-view.is-hidden,
          .flow-panel.is-hidden {
            display: none;
          }
          h2 {
            margin: 0 0 12px;
            font-size: 16px;
          }
          pre {
            margin: 0;
            color: var(--text);
            white-space: pre-wrap;
            font: inherit;
          }
          .refs {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--border);
          }
          .refs-title {
            margin-bottom: 8px;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-size: 11px;
          }
          ul {
            margin: 0;
            padding-left: 18px;
          }
          a {
            color: var(--accent);
          }
          .flow-panel {
            border: 1px solid var(--border);
            border-radius: 18px;
            background: #ffffff;
            padding: 18px;
            color: #1a1a2e;
          }
          .flow-panel-header {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
            margin-bottom: 14px;
          }
          .eyebrow {
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-size: 11px;
            margin-bottom: 6px;
          }
          .flow-panel-actions {
            display: flex;
            gap: 10px;
          }
          .flow-panel .save-png {
            color: #0c4a6e;
            border-color: #d1d5db;
            background: #f9fafb;
          }
          .legend {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 14px;
          }
          .legend-item {
            padding: 4px 8px;
            border-radius: 999px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .lane-entry { background: #e0f2fe; color: #0c4a6e; }
          .lane-logic { background: #ede9fe; color: #5b21b6; }
          .lane-data { background: #ecfdf5; color: #065f46; }
          .lane-external { background: #fffbeb; color: #92400e; }
          .lane-unknown { background: #f9fafb; color: #374151; }
          .flow-stage {
            position: relative;
            min-height: 680px;
            border: 1px solid #e5e7eb;
            border-radius: 16px;
            overflow: auto;
            background: #f8f9fb;
            padding: 16px;
          }
          .flow-svg {
            width: 100%;
            height: auto;
            display: block;
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <div class="headline">${escapeHtml(result.headline)}</div>
        <div class="actions">${renderActions(result)}</div>
        ${renderTabs(result)}
        <div class="panel-view" data-panel="summary">
          ${renderCards(result)}
        </div>
        ${renderFlowPanel(result)}
        <script id="flow-data" type="application/json">${encodeFlowChart("flowChart" in result ? result.flowChart : undefined)}</script>
        <script>
          const vscode = acquireVsCodeApi();
          const flowChart = JSON.parse(document.getElementById("flow-data")?.textContent || "null");
          const laneOrder = ["entry", "logic", "data", "external", "unknown"];
          const laneMeta = {
            entry: { fill: "#e0f2fe", stroke: "#0284c7", text: "#0c4a6e" },
            logic: { fill: "#ede9fe", stroke: "#7c3aed", text: "#5b21b6" },
            data: { fill: "#ecfdf5", stroke: "#047857", text: "#065f46" },
            external: { fill: "#fffbeb", stroke: "#b45309", text: "#92400e" },
            unknown: { fill: "#f9fafb", stroke: "#9ca3af", text: "#374151" }
          };

          function activateTab(tabName) {
            document.querySelectorAll("[data-panel]").forEach((panel) => {
              panel.classList.toggle("is-hidden", panel.getAttribute("data-panel") !== tabName);
            });
            document.querySelectorAll("[data-tab]").forEach((tab) => {
              tab.classList.toggle("is-active", tab.getAttribute("data-tab") === tabName);
            });
          }

          function wrapText(text, maxChars) {
            if (!text) {
              return [];
            }

            const words = text.split(/\s+/);
            const lines = [];
            let current = "";

            words.forEach((word) => {
              const next = current ? current + " " + word : word;
              if (next.length > maxChars && current) {
                lines.push(current);
                current = word;
              } else {
                current = next;
              }
            });

            if (current) {
              lines.push(current);
            }

            return lines.slice(0, 2).map((line, index, array) => {
              if (index === array.length - 1 && line.length > maxChars) {
                return line.slice(0, Math.max(maxChars - 1, 1)) + "…";
              }
              return line;
            });
          }

          function clampLine(line, maxChars) {
            if (!line) {
              return "";
            }
            return line.length > maxChars ? line.slice(0, Math.max(maxChars - 1, 1)) + "…" : line;
          }

          function createSvg(tag) {
            return document.createElementNS("http://www.w3.org/2000/svg", tag);
          }

          function renderFlowChart(chart) {
            if (!chart) {
              return;
            }

            const svg = document.getElementById("flow-svg");
            const stage = document.getElementById("flow-stage");
            if (!svg || !stage) {
              return;
            }

            const nodes = [...chart.nodes].sort((a, b) => a.order - b.order);
            const usedLanes = laneOrder.filter((lane) => nodes.some((node) => node.lane === lane));
            const laneIndexMap = new Map(usedLanes.map((lane, index) => [lane, index]));
            const paddingX = 60;
            const paddingTop = 86;
            const laneGap = 240;
            const rowGap = 30;
            const laneWidth = 200;
            const nodeWidth = 176;
            const laneHeights = new Map();

            const positioned = nodes.map((node) => {
              const index = laneIndexMap.get(node.lane) ?? 0;
              const titleLines = wrapText(node.title, 20);
              const subtitleLines = wrapText(node.subtitle || "", 28);
              const refLine = node.fileRef?.label ? 1 : 0;
              const textHeight = titleLines.length * 14 + subtitleLines.length * 12 + refLine * 10;
              const nodeHeight = Math.max(92, 28 + textHeight + 16);
              const laneOffset = laneHeights.get(node.lane) || 0;
              laneHeights.set(node.lane, laneOffset + nodeHeight + rowGap);
              return {
                ...node,
                titleLines,
                subtitleLines,
                x: paddingX + index * laneGap,
                y: paddingTop + laneOffset,
                width: nodeWidth,
                height: nodeHeight,
              };
            });

            const width = Math.max(860, paddingX * 2 + Math.max(usedLanes.length - 1, 0) * laneGap + laneWidth);
            const height = Math.max(680, ...positioned.map((node) => node.y + node.height + 72));
            svg.setAttribute("viewBox", "0 0 " + width + " " + height);
            svg.setAttribute("width", String(width));
            svg.setAttribute("height", String(height));
            svg.innerHTML = "";

            const defs = createSvg("defs");
            const marker = createSvg("marker");
            marker.setAttribute("id", "arrow");
            marker.setAttribute("markerWidth", "8");
            marker.setAttribute("markerHeight", "6");
            marker.setAttribute("refX", "8");
            marker.setAttribute("refY", "3");
            marker.setAttribute("orient", "auto");
            const markerPath = createSvg("path");
            markerPath.setAttribute("d", "M0,0 L8,3 L0,6");
            markerPath.setAttribute("fill", "#9ca3af");
            marker.appendChild(markerPath);
            defs.appendChild(marker);
            svg.appendChild(defs);

            usedLanes.forEach((lane) => {
              const index = laneIndexMap.get(lane) ?? 0;
              const meta = laneMeta[lane];
              const group = createSvg("g");
              const x = paddingX - 14 + index * laneGap;
              const rect = createSvg("rect");
              rect.setAttribute("x", String(x));
              rect.setAttribute("y", "28");
              rect.setAttribute("width", String(laneWidth));
              rect.setAttribute("height", String(height - 56));
              rect.setAttribute("rx", "16");
              rect.setAttribute("fill", meta.fill);
              rect.setAttribute("fill-opacity", "0.38");
              rect.setAttribute("stroke", "#d1d5db");
              rect.setAttribute("stroke-width", "1.2");
              group.appendChild(rect);

              const label = createSvg("text");
              label.setAttribute("x", String(x + laneWidth / 2));
              label.setAttribute("y", "52");
              label.setAttribute("text-anchor", "middle");
              label.setAttribute("font-size", "13");
              label.setAttribute("font-weight", "700");
              label.setAttribute("fill", meta.text);
              label.textContent = lane.toUpperCase();
              group.appendChild(label);
              svg.appendChild(group);
            });

            const byId = new Map(positioned.map((node) => [node.id, node]));
            chart.edges.forEach((edge) => {
              const from = byId.get(edge.from);
              const to = byId.get(edge.to);
              if (!from || !to) {
                return;
              }

              const startX = from.x + from.width / 2;
              const startY = from.y + from.height;
              const endX = to.x + to.width / 2;
              const endY = to.y;
              const sameLane = from.lane === to.lane;
              const path = createSvg("path");
              const midY = Math.round((startY + endY) / 2);
              const d = sameLane
                ? "M " + startX + "," + startY + " L " + endX + "," + endY
                : "M " + startX + "," + startY + " L " + startX + "," + midY + " L " + endX + "," + midY + " L " + endX + "," + endY;
              path.setAttribute("d", d);
              path.setAttribute("fill", "none");
              path.setAttribute("stroke", "#9ca3af");
              path.setAttribute("stroke-width", "2");
              path.setAttribute("marker-end", "url(#arrow)");
              svg.appendChild(path);

              if (edge.label) {
                const labelX = sameLane ? startX + 14 : Math.round((startX + endX) / 2);
                const labelY = sameLane ? Math.round((startY + endY) / 2) - 8 : midY - 8;
                const bg = createSvg("rect");
                bg.setAttribute("x", String(labelX - 48));
                bg.setAttribute("y", String(labelY - 11));
                bg.setAttribute("width", "96");
                bg.setAttribute("height", "18");
                bg.setAttribute("rx", "6");
                bg.setAttribute("fill", "#ffffff");
                svg.appendChild(bg);

                const text = createSvg("text");
                text.setAttribute("x", String(labelX));
                text.setAttribute("y", String(labelY + 2));
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("font-size", "10");
                text.setAttribute("fill", "#6b7280");
                text.textContent = edge.label;
                svg.appendChild(text);
              }
            });

            positioned.forEach((node) => {
              const meta = laneMeta[node.lane] || laneMeta.unknown;
              const group = createSvg("g");
              if (node.fileRef) {
                const suffix = node.fileRef.startLine ? ":" + node.fileRef.startLine : "";
                group.setAttribute("data-file-ref", node.fileRef.path + suffix);
                group.style.cursor = "pointer";
              }

              const box = createSvg("rect");
              box.setAttribute("x", String(node.x));
              box.setAttribute("y", String(node.y));
              box.setAttribute("width", String(node.width));
              box.setAttribute("height", String(node.height));
              box.setAttribute("rx", "10");
              box.setAttribute("fill", "#ffffff");
              box.setAttribute("stroke", meta.stroke);
              box.setAttribute("stroke-width", "1.4");
              group.appendChild(box);

              node.titleLines.forEach((line, lineIndex) => {
                const text = createSvg("text");
                text.setAttribute("x", String(node.x + node.width / 2));
                text.setAttribute("y", String(node.y + 24 + lineIndex * 14));
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("font-size", "12");
                text.setAttribute("font-weight", "600");
                text.setAttribute("fill", meta.text);
                text.textContent = line;
                group.appendChild(text);
              });

              const subtitleStartY = node.y + 24 + node.titleLines.length * 14 + 10;
              node.subtitleLines.forEach((line, lineIndex) => {
                const text = createSvg("text");
                text.setAttribute("x", String(node.x + node.width / 2));
                text.setAttribute("y", String(subtitleStartY + lineIndex * 12));
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("font-size", "9");
                text.setAttribute("fill", "#6b7280");
                text.textContent = line;
                group.appendChild(text);
              });

              if (node.fileRef?.label) {
                const ref = createSvg("text");
                ref.setAttribute("x", String(node.x + node.width / 2));
                ref.setAttribute("y", String(node.y + node.height - 10));
                ref.setAttribute("text-anchor", "middle");
                ref.setAttribute("font-size", "8");
                ref.setAttribute("fill", meta.stroke);
                ref.textContent = clampLine(node.fileRef.label, 28);
                group.appendChild(ref);
              }

              svg.appendChild(group);
            });
          }

          async function saveFlowAsPng() {
            const svg = document.getElementById("flow-svg");
            if (!(svg instanceof SVGSVGElement)) {
              return;
            }

            const serializer = new XMLSerializer();
            const source = serializer.serializeToString(svg);
            const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const image = new Image();

            image.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = image.width * 2;
              canvas.height = image.height * 2;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                URL.revokeObjectURL(url);
                return;
              }

              ctx.fillStyle = "#f8f9fb";
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.scale(2, 2);
              ctx.drawImage(image, 0, 0);
              URL.revokeObjectURL(url);

              const link = document.createElement("a");
              link.download = "branch-flow-chart.png";
              link.href = canvas.toDataURL("image/png");
              link.click();
            };

            image.src = url;
          }

          renderFlowChart(flowChart);
          document.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof Element)) {
              return;
            }

            const tabElement = target.closest("[data-tab]");
            const tabName = tabElement ? tabElement.getAttribute("data-tab") : null;
            if (tabName) {
              activateTab(tabName);
              return;
            }

            const refreshElement = target.closest("[data-refresh]");
            const refresh = refreshElement ? refreshElement.getAttribute("data-refresh") : null;
            if (refresh) {
              vscode.postMessage({ type: "refresh" });
              return;
            }

            const saveElement = target.closest("[data-save-png]");
            if (saveElement) {
              void saveFlowAsPng();
              return;
            }

            const actionElement = target.closest("[data-action]");
            const action = actionElement ? actionElement.getAttribute("data-action") : null;
            if (action) {
              vscode.postMessage({ type: "action", action });
              return;
            }

            const fileRefElement = target.closest("[data-file-ref]");
            const fileRef = fileRefElement ? fileRefElement.getAttribute("data-file-ref") : null;
            if (fileRef) {
              event.preventDefault();
              vscode.postMessage({ type: "fileRef", fileRef });
            }
          });
        </script>
      </body>
    </html>
  `;
}

export function renderLoadingHtml(title: string, message: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(title)}</title>
        <style>
          :root {
            --bg: #07111f;
            --panel: rgba(15, 27, 45, 0.92);
            --text: #ecf3ff;
            --muted: #98abc9;
            --accent: #7dd3fc;
            --border: rgba(125, 211, 252, 0.18);
          }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background:
              radial-gradient(circle at top right, rgba(125, 211, 252, 0.15), transparent 32%),
              linear-gradient(180deg, #07111f 0%, #0a1324 100%);
            color: var(--text);
            font: 14px/1.5 "SF Mono", Monaco, Consolas, monospace;
          }
          .panel {
            width: min(520px, calc(100vw - 48px));
            padding: 28px;
            border-radius: 18px;
            background: var(--panel);
            border: 1px solid var(--border);
            text-align: center;
          }
          .spinner {
            width: 40px;
            height: 40px;
            margin: 0 auto 16px;
            border-radius: 999px;
            border: 3px solid rgba(125, 211, 252, 0.18);
            border-top-color: var(--accent);
            animation: spin 0.9s linear infinite;
          }
          h1 {
            margin: 0 0 8px;
            font-size: 20px;
          }
          p {
            margin: 0;
            color: var(--muted);
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="panel">
          <div class="spinner"></div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(message)}</p>
        </div>
      </body>
    </html>
  `;
}
