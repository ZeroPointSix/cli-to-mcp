import type { IncomingMessage } from "node:http";

/**
 * MCP Streamable HTTP SDK expects Accept to include both JSON and SSE (else 406).
 * Same pattern as metamcp-chatgpt streamable-http router.
 */
export function normalizeStreamableHttpAccept(req: IncomingMessage): void {
  const acceptHeader = req.headers.accept;
  const acceptsJson =
    typeof acceptHeader === "string" && acceptHeader.includes("application/json");
  const acceptsEventStream =
    typeof acceptHeader === "string" && acceptHeader.includes("text/event-stream");
  if (!acceptsJson || !acceptsEventStream) {
    req.headers.accept = "application/json, text/event-stream";
  }
}