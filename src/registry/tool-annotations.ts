/**
 * MCP ToolAnnotations (tools/list) — hints for clients, not security boundaries.
 * @see @modelcontextprotocol/sdk ToolAnnotationsSchema
 */
export type ToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

/** Non-standard hints we expose via MCP `_meta` on tools/list (e.g. lark-cli Identity). */
export type ToolMcpMeta = Record<string, unknown>;