/**
 * ToolRegistry: holds the final MCP tool list exposed to Agent.
 *
 * - load() from Cache Store (Phase 1: populated by Discovery / Config).
 * - listTools() / getTool(name) for MCP server.
 * - register() / replaceAll() for dynamic registration at startup and refresh.
 *
 * Conflict policy (Phase 1): explicit YAML wins; on a true duplicate within the
 * same source, the later registration is rejected with an error so problems are
 * surfaced rather than silently shadowed. Disabled tools are kept internally
 * (so get_tool_source can still explain them) but hidden from listTools().
 */
import type { ToolDefinition } from "./tool-definition.js";
import { META_TOOL_NAMES } from "./tool-definition.js";

export interface ToolRegistry {
  load(): Promise<void>;
  listTools(): ToolDefinition[];
  /** Returns the tool even if disabled. Use isExposed() to filter. */
  getTool(name: string): ToolDefinition | null;
  isExposed(name: string): boolean;
  register(tool: ToolDefinition): void;
  replaceAll(tools: ToolDefinition[]): void;
  size(): number;
}

export class InMemoryToolRegistry implements ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  async load(): Promise<void> {
    // Phase 1: no cache wired yet; tools are pushed in by registry builder.
    // Cache Store integration replaces this body in Task 6.
  }

  listTools(): ToolDefinition[] {
    return [...this.tools.values()].filter((t) => t.enabled);
  }

  getTool(name: string): ToolDefinition | null {
    return this.tools.get(name) ?? null;
  }

  isExposed(name: string): boolean {
    const t = this.tools.get(name);
    return !!t && t.enabled;
  }

  register(tool: ToolDefinition): void {
    if (META_TOOL_NAMES.has(tool.name)) {
      throw new Error(
        `tool name "${tool.name}" is reserved for meta-tools; rename it in config`,
      );
    }
    if (this.tools.has(tool.name)) {
      throw new Error(
        `tool name "${tool.name}" is already registered; set an explicit name in config to avoid conflict`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  replaceAll(tools: ToolDefinition[]): void {
    this.tools.clear();
    for (const t of tools) {
      // replaceAll allows re-registration during refresh; skip the
      // duplicate-name check only because we just cleared.
      if (META_TOOL_NAMES.has(t.name)) {
        throw new Error(`tool name "${t.name}" is reserved for meta-tools`);
      }
      this.tools.set(t.name, t);
    }
  }

  size(): number {
    return this.tools.size;
  }
}
