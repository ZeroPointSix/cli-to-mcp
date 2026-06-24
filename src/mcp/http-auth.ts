import type { IncomingMessage, ServerResponse } from "node:http";

/** Constant-time compare for bearer secrets (single-operator deployments). */
export function safeEqualSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function extractBearerToken(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const alt = req.headers["x-cli-to-mcp-secret"];
  if (typeof alt === "string" && alt.trim()) return alt.trim();
  if (Array.isArray(alt) && alt[0]?.trim()) return alt[0].trim();
  return undefined;
}

export type McpHttpAuthConfig = {
  /** When set, POST/GET/DELETE /mcp require a matching bearer (health stays public). */
  bearerToken?: string;
};

export function readMcpHttpAuthFromEnv(): McpHttpAuthConfig {
  const bearerToken = process.env.CLI_TO_MCP_HTTP_BEARER_TOKEN?.trim();
  return bearerToken ? { bearerToken } : {};
}

export function assertMcpHttpAuthorized(
  req: IncomingMessage,
  res: ServerResponse,
  auth: McpHttpAuthConfig,
): boolean {
  if (!auth.bearerToken) return true;
  const provided = extractBearerToken(req);
  if (!provided) {
    writeAuthError(res, 401, "authentication_required", "Bearer token required (CLI_TO_MCP_HTTP_BEARER_TOKEN).");
    return false;
  }
  if (!safeEqualSecret(provided, auth.bearerToken)) {
    writeAuthError(res, 401, "invalid_token", "Invalid bearer token.");
    return false;
  }
  return true;
}

function writeAuthError(
  res: ServerResponse,
  status: number,
  error: string,
  error_description: string,
): void {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      error,
      error_description,
      supported_methods: [
        "Authorization: Bearer <CLI_TO_MCP_HTTP_BEARER_TOKEN>",
        "X-CLI-To-MCP-Secret: <CLI_TO_MCP_HTTP_BEARER_TOKEN>",
      ],
      timestamp: new Date().toISOString(),
    }),
  );
}