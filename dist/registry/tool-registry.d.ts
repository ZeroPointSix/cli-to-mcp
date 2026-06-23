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
export declare class InMemoryToolRegistry implements ToolRegistry {
    private tools;
    load(): Promise<void>;
    listTools(): ToolDefinition[];
    getTool(name: string): ToolDefinition | null;
    isExposed(name: string): boolean;
    register(tool: ToolDefinition): void;
    replaceAll(tools: ToolDefinition[]): void;
    size(): number;
}
