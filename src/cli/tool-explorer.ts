/**
 * MetaMCP-style progressive tool discovery (issue #15).
 */
import type { ToolDefinition } from "../registry/tool-definition.js";
import type { ToolRegistry } from "../registry/tool-registry.js";

export type ToolSummary = {
  name: string;
  description: string;
  connector: string;
  source: string;
  command_prefix: string[];
};

export type ToolCategory = {
  id: string;
  label: string;
  tool_count: number;
};

export function listToolCategories(registry: ToolRegistry): ToolCategory[] {
  const tools = registry.listTools().filter((t) => t.enabled);
  const byConnector = new Map<string, ToolDefinition[]>();
  for (const t of tools) {
    const list = byConnector.get(t.connectorName) ?? [];
    list.push(t);
    byConnector.set(t.connectorName, list);
  }
  const categories: ToolCategory[] = [];
  for (const [connector, list] of byConnector) {
    categories.push({
      id: `connector:${connector}`,
      label: `connector ${connector}`,
      tool_count: list.length,
    });
    const prefixCounts = new Map<string, number>();
    for (const t of list) {
      const seg = t.command[0];
      if (!seg) continue;
      const id = `prefix:${connector}:${seg}`;
      prefixCounts.set(id, (prefixCounts.get(id) ?? 0) + 1);
    }
    for (const [id, count] of [...prefixCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const seg = id.split(":").slice(2).join(":");
      categories.push({
        id,
        label: `${connector} / ${seg}`,
        tool_count: count,
      });
    }
  }
  return categories.sort((a, b) => a.id.localeCompare(b.id));
}

export function listToolsByCategory(
  registry: ToolRegistry,
  categoryId: string,
  limit = 200,
): { tools: ToolSummary[]; unknown_category: boolean } {
  const tools = registry.listTools().filter((t) => t.enabled);
  let filtered: ToolDefinition[];
  const validIds = new Set(listToolCategories(registry).map((c) => c.id));
  const unknown_category = !validIds.has(categoryId);
  if (categoryId.startsWith("connector:")) {
    const conn = categoryId.slice("connector:".length);
    filtered = tools.filter((t) => t.connectorName === conn);
  } else if (categoryId.startsWith("prefix:")) {
    const parts = categoryId.split(":");
    const conn = parts[1];
    const seg = parts.slice(2).join(":");
    filtered = tools.filter((t) => t.connectorName === conn && t.command[0] === seg);
  } else {
    filtered = [];
  }
  return { tools: filtered.slice(0, limit).map(toSummary), unknown_category };
}

export function searchTools(registry: ToolRegistry, query: string, limit = 50): ToolSummary[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return [];
  const tools = registry.listTools().filter((t) => t.enabled);
  const scored = tools
    .map((t) => {
      const hay = `${t.name} ${t.description} ${t.command.join(" ")}`.toLowerCase();
      const allMatch = tokens.every((tok) => hay.includes(tok));
      if (!allMatch) return { t, idx: -1 };
      const idx = hay.indexOf(tokens[0]);
      return { t, idx };
    })
    .filter((x) => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  return scored.slice(0, limit).map((x) => toSummary(x.t));
}

export function getToolSchema(registry: ToolRegistry, name: string) {
  const tool = registry.getTool(name);
  if (!tool || !tool.enabled) return { ok: false as const, error: `tool '${name}' not found` };
  return {
    ok: true as const,
    name: tool.name,
    description: tool.description,
    connector: tool.connectorName,
    command: tool.command,
    inputSchema: tool.inputSchema,
    source: tool.source,
  };
}

function toSummary(t: ToolDefinition): ToolSummary {
  return {
    name: t.name,
    description: t.description,
    connector: t.connectorName,
    source: t.source,
    command_prefix: t.command.slice(0, 2),
  };
}