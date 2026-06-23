/**
 * MCP Server Layer (architecture §5.1).
 *
 * Streamable HTTP stateful mode: one Server + one Transport per client session.
 * A single global transport caused HTTP 400 "Server already initialized" on reconnect.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest, } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { normalize } from "../executor/result-normalizer.js";
export class CliToMcpServer {
    opts;
    httpServer = null;
    sessions = new Map();
    constructor(opts) {
        this.opts = opts;
    }
    createSessionServer() {
        const server = new Server({ name: "cli-to-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });
        server.setRequestHandler(ListToolsRequestSchema, async (_req) => {
            const tools = this.opts.registry.listTools().map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            }));
            const meta = this.opts.metaTools?.list() ?? [];
            for (const m of meta) {
                tools.push({
                    name: m.name,
                    description: m.description,
                    inputSchema: {
                        type: "object",
                        properties: {},
                        required: [],
                        additionalProperties: true,
                    },
                });
            }
            return { tools };
        });
        server.setRequestHandler(CallToolRequestSchema, async (req) => {
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
            const normalized = normalize(raw, tool);
            return toCallToolResult(normalized);
        });
        return server;
    }
    async start() {
        this.httpServer = createServer(async (req, res) => {
            try {
                await this.handleHttp(req, res);
            }
            catch (err) {
                this.opts.log?.(`request error: ${String(err)}`);
                if (!res.headersSent) {
                    res.writeHead(500, { "content-type": "application/json" });
                    res.end(JSON.stringify({ error: "internal error" }));
                }
            }
        });
        await new Promise((resolve) => {
            this.httpServer.listen(this.opts.port, this.opts.host, () => resolve());
        });
        this.opts.log?.(`cli-to-mcp listening on http://${this.opts.host}:${this.opts.port}/mcp`);
    }
    sessionIdFrom(req) {
        const h = req.headers["mcp-session-id"];
        if (typeof h === "string" && h.length > 0)
            return h;
        if (Array.isArray(h) && h[0])
            return h[0];
        return undefined;
    }
    async handleHttp(req, res) {
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
            jsonRpcError(res, 400, -32000, "Bad Request: send initialize first, or provide a valid Mcp-Session-Id");
            return;
        }
        await session.transport.handleRequest(req, res, parsedBody);
    }
    async stop() {
        for (const { transport, server } of this.sessions.values()) {
            try {
                await transport.close();
            }
            catch {
                /* ignore */
            }
            try {
                await server.close();
            }
            catch {
                /* ignore */
            }
        }
        this.sessions.clear();
        if (this.httpServer) {
            await new Promise((resolve) => this.httpServer.close(() => resolve()));
            this.httpServer = null;
        }
    }
}
async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (!text)
        return undefined;
    return JSON.parse(text);
}
function jsonRpcError(res, status, code, message) {
    if (res.headersSent)
        return;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}
function toCallToolResult(payload) {
    return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        isError: typeof payload === "object" &&
            payload !== null &&
            "ok" in payload &&
            payload.ok === false,
    };
}
//# sourceMappingURL=server.js.map