/**
 * MCP Server Layer (architecture §5.1).
 *
 * Streamable HTTP stateful mode: one Server + one Transport per client session.
 * A single global transport caused HTTP 400 "Server already initialized" on reconnect.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
  type CallToolRequest,
  type ListToolsRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { ToolRegistry } from "../registry/tool-registry.js";
import type { CommandExecutor } from "../executor/command-executor.js";
import type { NormalizedResult } from "../executor/result-normalizer.js";
import { normalize } from "../executor/result-normalizer.js";
import type { ResolvedConnector } from "../config/config-loader.js";
import type { JsonSchema } from "../registry/tool-definition.js";

export type McpServerOptions = {
  host: string;
  port: number;
  registry: ToolRegistry;
  executor: CommandExecutor;
  connectors: Map<string, ResolvedConnector>;
  metaTools?: MetaToolHandlers;
  log?: (msg: string) => void;
};

export type MetaToolHandlers = {
  has(name: string): boolean;
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
  list(): Array<{ name: string; description: string; inputSchema?: JsonSchema }>;
};

type Session = {
  transport: StreamableHTTPServerTransport;
  server: Server;
};

export class CliToMcpServer {
  private readonly opts: McpServerOptions;
  private httpServer: ReturnType<typeof createServer> | null = null;
  private readonly sessions = new Map<string, Session>();

  constructor(opts: McpServerOptions) {
    this.opts = opts;
  }

  private createSessionServer(): Server {
    const server = new Server(
      { name: "cli-to-mcp", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async (_req: ListToolsRequest) => {
      const tools = this.opts.registry
        .listTools()
        .filter((t) => {
          const conn = this.opts.connectors.get(t.connectorName);
          return (conn?.discovery?.exposure_mode ?? "flat") !== "lazy";
        })
        .map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
      const meta = this.opts.metaTools?.list() ?? [];
      for (const m of meta) {
        tools.push({
          name: m.name,
          description: m.description,
          inputSchema: m.inputSchema ?? {
            type: "object" as const,
            properties: {},
            required: [],
            additionalProperties: false,
          },
        });
      }
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (req: CallToolRequest) => {
      const name = req.params.name;
      const args = req.params.arguments ?? {};

      if (this.opts.metaTools?.has(name)) {
        const result = await this.opts.metaTools.call(name, args);
        return toCallToolResult(result);
      }

      const tool = this.opts.registry.getTool(name);
      if (!tool || !tool.enabled) {
        return toCallToolResult({
          ok: false,
          error_type: "UNKNOWN_ERROR",
          hint: `Tool "${name}" not found or disabled.`,
        });
      }

      const connector = this.opts.connectors.get(tool.connectorName);
      const env = connector?.env;
      const cwd = connector?.working_dir ?? undefined;
      const timeoutMs = connector?.default_timeout_seconds
        ? connector.default_timeout_seconds * 1000
        : undefined;

      const raw = await this.opts.executor.execute({ tool, args, env, cwd, timeoutMs });
      const normalized: NormalizedResult = normalize(raw, tool);
      return toCallToolResult(normalized);
    });

    return server;
  }

  async start(): Promise<void> {
    this.httpServer = createServer(async (req, res) => {
      try {
        await this.handleHttp(req, res);
      } catch (err) {
        this.opts.log?.(`request error: ${String(err)}`);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "internal error" }));
        }
      }
    });

    await new Promise<void>((resolve) => {
      this.httpServer!.listen(this.opts.port, this.opts.host, () => resolve());
    });
    this.opts.log?.(`cli-to-mcp listening on http://${this.opts.host}:${this.opts.port}/mcp`);
  }

  private sessionIdFrom(req: IncomingMessage): string | undefined {
    const h = req.headers["mcp-session-id"];
    if (typeof h === "string" && h.length > 0) return h;
    if (Array.isArray(h) && h[0]) return h[0];
    return undefined;
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "/").split("?")[0];
    if (path !== "/mcp") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found; use POST/GET /mcp" }));
      return;
    }

    const sessionId = this.sessionIdFrom(req);
    let session = sessionId ? this.sessions.get(sessionId) : undefined;

    if (req.method === "GET" || req.method === "DELETE") {
      if (!session) {
        jsonRpcError(res, 400, -32000, "Bad Request: missing or unknown Mcp-Session-Id");
        return;
      }
      await session.transport.handleRequest(req, res);
      return;
    }

    if (req.method !== "POST") {
      jsonRpcError(res, 405, -32000, "Method not allowed");
      return;
    }

    const parsedBody = await readJsonBody(req);

    if (!session && isInitializeRequest(parsedBody)) {
      const mcpServer = this.createSessionServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          this.sessions.set(sid, { transport, server: mcpServer });
          this.opts.log?.(`mcp session initialized: ${sid}`);
        },
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          this.sessions.delete(sid);
          this.opts.log?.(`mcp session closed: ${sid}`);
        }
      };
      await mcpServer.connect(transport);
      session = { transport, server: mcpServer };
      await transport.handleRequest(req, res, parsedBody);
      return;
    }

    if (!session) {
      jsonRpcError(
        res,
        400,
        -32000,
        "Bad Request: send initialize first, or provide a valid Mcp-Session-Id",
      );
      return;
    }

    await session.transport.handleRequest(req, res, parsedBody);
  }

  async stop(): Promise<void> {
    for (const { transport, server } of this.sessions.values()) {
      try {
        await transport.close();
      } catch {
        /* ignore */
      }
      try {
        await server.close();
      } catch {
        /* ignore */
      }
    }
    this.sessions.clear();
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()));
      this.httpServer = null;
    }
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return undefined;
  return JSON.parse(text) as unknown;
}

function jsonRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

function toCallToolResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    isError:
      typeof payload === "object" &&
      payload !== null &&
      "ok" in payload &&
      payload.ok === false,
  };
}