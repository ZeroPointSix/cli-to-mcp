/**
 * Run a registry CLI tool (including lazy-hidden tools). Used by MCP server
 * and meta tool `call_tool` for hosts that only register tools/list names.
 */
import type { CommandExecutor } from "../executor/command-executor.js";
import { normalize, type NormalizedResult } from "../executor/result-normalizer.js";
import type { ResolvedConnector } from "../config/config-loader.js";
import type { InMemoryToolRegistry } from "../registry/tool-registry.js";

export type ExecuteDynamicDeps = {
  registry: InMemoryToolRegistry;
  executor: CommandExecutor;
  connectors: Map<string, ResolvedConnector>;
};

export async function executeDynamicTool(
  deps: ExecuteDynamicDeps,
  toolName: string,
  args: Record<string, unknown>,
): Promise<NormalizedResult & { ok: boolean; tool: string }> {
  const tool = deps.registry.getTool(toolName);
  if (!tool || !tool.enabled) {
    return {
      ok: false,
      tool: toolName,
      exit_code: null,
      stdout: "",
      stderr: "",
      duration_ms: 0,
      parsed_output: null,
      error_type: "UNKNOWN_ERROR",
      hint: `Tool "${toolName}" not found or disabled.`,
    };
  }
  const connector = deps.connectors.get(tool.connectorName);
  const raw = await deps.executor.execute({
    tool,
    args,
    env: connector?.env,
    cwd: connector?.working_dir ?? undefined,
    timeoutMs: connector?.default_timeout_seconds
      ? connector.default_timeout_seconds * 1000
      : undefined,
  });
  const normalized = normalize(raw, tool);
  return { tool: toolName, ...normalized };
}