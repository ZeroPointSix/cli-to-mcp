import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { startRuntime, type Runtime } from "../src/cli/runtime.js";

const MOCK_CLI = fileURLToPath(new URL("./fixtures/mock-cli.js", import.meta.url));
const NODE = process.execPath.replace(/\\/g, "/");

let dir: string;
let runtime: Runtime;
let port: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "c2m-http-"));
});

afterEach(async () => {
  if (runtime) await runtime.stop();
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(content: string): string {
  const p = join(dir, "cli-to-mcp.yaml");
  writeFileSync(p, content, "utf8");
  return p;
}

function parseSse(text: string): any {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  for (const line of trimmed.split("\n")) {
    const m = line.match(/^data:\s*(.+)$/);
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch {
        /* try next */
      }
    }
  }
  throw new Error(`could not parse response: ${text.slice(0, 200)}`);
}

async function mcpRequest(method: string, params: any, id: number | undefined, sessionId?: string): Promise<{ status: number; sid: string | null; body: any }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const body: any = { jsonrpc: "2.0", method };
  if (id !== undefined) body.id = id;
  if (params !== undefined) body.params = params;
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  if (text) parsed = parseSse(text);
  return { status: res.status, sid: res.headers.get("mcp-session-id"), body: parsed };
}

/** Full MCP handshake: initialize -> initialized notification -> returns session id. */
async function handshake(): Promise<string> {
  const init = await mcpRequest(
    "initialize",
    { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
    1,
  );
  const sid = init.sid!;
  await mcpRequest("notifications/initialized", undefined, undefined, sid);
  return sid;
}

describe("HTTP MCP server integration", () => {
  it("starts, responds to initialize and tools/list", async () => {
    port = 18787;
    const cfgPath = writeConfig(`
version: 1
connectors:
  - name: mock
    binary: node
    enabled: true
    default_timeout_seconds: 5
    working_dir: null
tools:
  mock_echo:
    enabled: true
    connector: mock
    command: ["-e", "console.log(JSON.stringify({hello:'world'}))"]
    description: Echo test
    output:
      format: json
`);
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });

    const sid = await handshake();
    const list = await mcpRequest("tools/list", {}, 2, sid);
    const names = list.body.result.tools.map((t: any) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "mock_echo",
        "list_connectors",
        "doctor",
        "refresh_tools",
        "get_skills",
        "get_tool_source",
      ]),
    );
  });

  it("tools/call executes the CLI and returns structured result", async () => {
    port = 18788;
    const cfgPath = writeConfig(`
version: 1
connectors:
  - name: mock
    binary: ${JSON.stringify(NODE)}
    enabled: true
    default_timeout_seconds: 5
tools:
  mock_echo:
    enabled: true
    connector: mock
    command: [${JSON.stringify(MOCK_CLI.replace(/\\/g, "/"))}]
    description: Echo test
    output:
      format: json
`);
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });
    const sid = await handshake();
    const call = await mcpRequest("tools/call", { name: "mock_echo", arguments: {} }, 2, sid);
    const payload = JSON.parse(call.body.result.content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.exit_code).toBe(0);
    expect(payload.parsed_output).toEqual({ args: [] });
  });

  it("second initialize without session id succeeds (new session)", async () => {
    port = 18791;
    const cfgPath = writeConfig(`
version: 1
connectors:
  - name: mock
    binary: node
    enabled: true
tools:
  mock_echo:
    enabled: true
    connector: mock
    command: ["-e", "console.log('hi')"]
    description: hi
`);
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });
    const sid1 = await handshake();
    const sid2 = await handshake();
    expect(sid1).toBeTruthy();
    expect(sid2).toBeTruthy();
    expect(sid1).not.toBe(sid2);
    const list = await mcpRequest("tools/list", {}, 3, sid2);
    expect(list.body.result.tools.length).toBeGreaterThan(0);
  });

  it("tools/call on missing tool returns ok:false", async () => {
    port = 18792;
    const cfgPath = writeConfig(`
version: 1
connectors:
  - name: mock
    binary: node
    enabled: true
tools:
  mock_echo:
    enabled: true
    connector: mock
    command: ["-e", "console.log('hi')"]
    description: hi
`);
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });
    const sid = await handshake();
    const call = await mcpRequest("tools/call", { name: "does_not_exist", arguments: {} }, 2, sid);
    const payload = JSON.parse(call.body.result.content[0].text);
    expect(payload.ok).toBe(false);
  });

  it("meta tool list_connectors works over HTTP", async () => {
    port = 18793;
    const cfgPath = writeConfig(`
version: 1
connectors:
  - name: gh
    binary: gh
    enabled: true
    default_timeout_seconds: 10
    discovery:
      mode: manual
tools: {}
`);
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });
    const sid = await handshake();
    const call = await mcpRequest("tools/call", { name: "list_connectors", arguments: {} }, 2, sid);
    const payload = JSON.parse(call.body.result.content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.connectors[0].name).toBe("gh");
  });

  it("exposure_mode lazy hides connector CLI tools but keeps meta tools in tools/list", async () => {
    port = 18794;
    const cfgPath = writeConfig(`
version: 1
connectors:
  - name: mock
    binary: node
    enabled: true
    default_timeout_seconds: 5
  - name: lazyconn
    binary: node
    enabled: true
    default_timeout_seconds: 5
    discovery:
      mode: none
      exposure_mode: lazy
tools:
  mock_echo:
    enabled: true
    connector: mock
    command: ["-e", "console.log('flat')"]
    description: flat connector tool
  lazy_static:
    enabled: true
    connector: lazyconn
    command: ["-e", "console.log('lazy')"]
    description: lazy connector yaml tool
`);
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });

    const sid = await handshake();
    const list = await mcpRequest("tools/list", {}, 2, sid);
    const names = list.body.result.tools.map((t: any) => t.name);

    expect(names).toContain("mock_echo");
    expect(names).not.toContain("lazy_static");
    expect(names).toEqual(
      expect.arrayContaining([
        "list_connectors",
        "doctor",
        "refresh_tools",
        "get_skills",
        "get_tool_source",
        "list_tool_categories",
        "list_tools_by_category",
        "search_tools",
        "get_tool_schema",
        "call_tool",
      ]),
    );
  });

  it("host/port/config flags take effect (binds to requested port)", async () => {
    port = 18791;
    const cfgPath = writeConfig(`
version: 1
connectors:
  - name: mock
    binary: node
    enabled: true
tools:
  mock_echo:
    enabled: true
    connector: mock
    command: ["-e", "console.log(1)"]
    description: x
`);
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });
    const sid = await handshake();
    const list = await mcpRequest("tools/list", {}, 2, sid);
    expect(list.status).toBe(200);
    expect(list.body.result.tools.length).toBeGreaterThan(0);
  });

  it("GET /health returns ok without MCP session", async () => {
    port = 18795;
    const cfgPath = writeConfig(`
version: 1
connectors:
  - name: mock
    binary: node
    enabled: true
tools:
  mock_echo:
    enabled: true
    connector: mock
    command: ["-e", "console.log(1)"]
    description: x
`);
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.mcp_auth).toBe(false);
  });

  it("rejects /mcp without bearer when CLI_TO_MCP_HTTP_BEARER_TOKEN is set", async () => {
    const prev = process.env.CLI_TO_MCP_HTTP_BEARER_TOKEN;
    process.env.CLI_TO_MCP_HTTP_BEARER_TOKEN = "test-secret-token";
    try {
      port = 18796;
      const cfgPath = writeConfig(`
version: 1
connectors:
  - name: mock
    binary: node
    enabled: true
tools:
  mock_echo:
    enabled: true
    connector: mock
    command: ["-e", "console.log(1)"]
    description: x
`);
      runtime = await startRuntime({
        host: "127.0.0.1",
        port,
        config: cfgPath,
        cachePath: join(dir, "cache.sqlite"),
        log: () => {},
      });
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "t", version: "0" },
          },
          id: 1,
        }),
      });
      expect(res.status).toBe(401);
      const bad = await res.json();
      expect(bad.error).toBe("authentication_required");

      const ok = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-secret-token",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "t", version: "0" },
          },
          id: 1,
        }),
      });
      expect(ok.status).toBe(200);
    } finally {
      if (prev !== undefined) process.env.CLI_TO_MCP_HTTP_BEARER_TOKEN = prev;
      else delete process.env.CLI_TO_MCP_HTTP_BEARER_TOKEN;
    }
  });
});
