import type { ToolAnnotations, ToolMcpMeta } from "../registry/tool-annotations.js";

export type DescriptionHints = {
  description: string;
  annotations?: ToolAnnotations;
  mcpMeta?: ToolMcpMeta;
};

const RISK_RE = /\bRisk:\s*(read|write|none)\b/gi;
const IDENTITY_RE = /\bIdentity:\s*([^\n.]+)/gi;

/**
 * Pull structured MCP hints out of help/YAML descriptions (e.g. lark-cli trailing lines).
 * Remaining text is kept as the public description.
 */
export function applyDescriptionHints(description: string): DescriptionHints {
  let text = description.trim();
  const annotations: ToolAnnotations = {};
  const mcpMeta: ToolMcpMeta = {};
  let touched = false;

  const risks: string[] = [];
  text = text.replace(RISK_RE, (_, level: string) => {
    risks.push(level.toLowerCase());
    touched = true;
    return "";
  });

  text = text.replace(IDENTITY_RE, (_, id: string) => {
    mcpMeta["cli-to-mcp/identity"] = id.trim();
    touched = true;
    return "";
  });

  if (risks.length > 0) {
    const last = risks[risks.length - 1]!;
    if (last === "read") {
      annotations.readOnlyHint = true;
      annotations.destructiveHint = false;
    } else if (last === "write") {
      annotations.readOnlyHint = false;
      annotations.destructiveHint = true;
    } else if (last === "none") {
      annotations.readOnlyHint = true;
      annotations.destructiveHint = false;
    }
  }

  text = text.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();

  if (!touched) return { description: text || description };

  return {
    description: text || description,
    ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    ...(Object.keys(mcpMeta).length > 0 ? { mcpMeta } : {}),
  };
}

export function mergeAnnotations(
  base: ToolAnnotations | undefined,
  extra: ToolAnnotations | undefined,
): ToolAnnotations | undefined {
  if (!base && !extra) return undefined;
  return { ...base, ...extra };
}