import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ConfigLoader } from "../src/config/config-loader.js";
import { startRuntime, type Runtime } from "../src/cli/runtime.js";

const GH_CONFIG = fileURLToPath(new URL("../examples/gh/cli-to-mcp.yaml", import.meta.url));

let dir: string;
let runtime: Runtime;
let port: number;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "c2m-gh-"));
});

afterEach(async () => {
  if (runtime) await runtime.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("gh demo connector config", () => {
  it("loads the example cli-to-mcp.yaml with 4 tools", () => {
    const loaded = new ConfigLoader().load(GH_CONFIG);
    const toolNames = Object.keys(loaded.tools).sort();
    expect(toolNames).toEqual(["gh_issue_list", "gh_pr_list", "gh_pr_view", "gh_repo_view"]);
    for (const name of toolNames) {
      const t = loaded.tools[name];
      expect(t.connector).toBe("gh");
      expect(t.output?.format).toBe("json");
      expect(t.command.length).toBeGreaterThan(0);
    }
    expect(loaded.connectors[0].binary).toBe("gh");
    expect(loaded.connectors[0].discovery.parser).toBe("cobra");
    expect(loaded.connectors[0].skills.length).toBe(1);
  });
});

/**
 * Mock-based smoke test: substitute `node` for `gh` so the test runs without
 * `gh` installed. The mock prints JSON that mimics gh's --json output, proving
 * the full runtime -> executor -> normalizer chain works on the real config.
 */
function writeMockGhConfig(): string {
  // Copy the gh config but override the binary to a mock node script so CI
  // doesn't depend on gh being installed.
  const skillSrc = fileURLToPath(new URL("../examples/gh/skills/gh-pr.md", import.meta.url));
  mkdirSync(join(dir, "skills"), { recursive: true });
  const ghSkillSrc = fileURLToPath(new URL("../examples/gh/skills/gh.md", import.meta.url));
  writeFileSync(join(dir, "skills", "gh.md"), readFileSync(ghSkillSrc, "utf8"), "utf8");
  writeFileSync(join(dir, "skills", "gh-pr.md"), readFileSync(skillSrc, "utf8"), "utf8");

  const mockScript = join(dir, "mock-gh.js");
  writeFileSync(
    mockScript,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
// Echo a JSON payload shaped like gh --json output.
if (args.includes("view")) {
  console.log(JSON.stringify({ number: 42, title: "Demo PR", state: "OPEN", author: { login: "alice" }, body: "demo", url: "https://example.com/pr/42" }));
} else if (args.includes("list")) {
  console.log(JSON.stringify([{ number: 42, title: "Demo PR", state: "OPEN", author: { login: "alice" }, url: "https://example.com/pr/42" }]));
} else {
  console.log(JSON.stringify({ nameWithOwner: "owner/repo", description: "demo", url: "https://example.com/repo", stargazerCount: 5 }));
}
`,
    "utf8",
  );

  const cfg = `
version: 1
connectors:
  - name: gh
    binary: ${process.execPath.replace(/\\/g, "/")}
    enabled: true
    default_timeout_seconds: 10
    discovery:
      mode: help
      parser: cobra
    skills:
      - ./skills/gh.md
tools:
  gh_pr_view:
    enabled: true
    connector: gh
    command: ["${mockScript.replace(/\\/g, "/")}", "pr", "view"]
    description: View a GitHub pull request.
    args:
      number:
        type: integer
        required: false
    default_args: ["--json", "number,title,state,author,body,url"]
    output:
      format: json
  gh_pr_list:
    enabled: true
    connector: gh
    command: ["${mockScript.replace(/\\/g, "/")}", "pr", "list"]
    description: List pull requests.
    args:
      limit:
        type: integer
        required: false
        default: 30
    default_args: ["--json", "number,title,state,author,url"]
    output:
      format: json
`;
  const p = join(dir, "cli-to-mcp.yaml");
  writeFileSync(p, cfg, "utf8");
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
  throw new Error(`could not parse: ${text.slice(0, 200)}`);
}

async function mcpRequest(method: string, params: any, id: number | undefined, sessionId?: string) {
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
  return { status: res.status, sid: res.headers.get("mcp-session-id"), body: text ? parseSse(text) : null };
}

async function handshake(): Promise<string> {
  const init = await mcpRequest(
    "initialize",
    { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
    1,
  );
  await mcpRequest("notifications/initialized", undefined, undefined, init.sid!);
  return init.sid!;
}

describe("gh demo runtime (mock CLI)", () => {
  it("loads tools from gh config and serves tools/list", async () => {
    port = 18801;
    const cfgPath = writeMockGhConfig();
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
    expect(names).toEqual(expect.arrayContaining(["gh_pr_view", "gh_pr_list", "list_connectors", "doctor", "refresh_tools", "get_skills", "get_tool_source"]));
  });

  it("gh_pr_view returns parsed JSON via the executor + normalizer", async () => {
    port = 18802;
    const cfgPath = writeMockGhConfig();
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });
    const sid = await handshake();
    const call = await mcpRequest("tools/call", { name: "gh_pr_view", arguments: { number: 42 } }, 2, sid);
    const payload = JSON.parse(call.body.result.content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.exit_code).toBe(0);
    expect(payload.parsed_output).toMatchObject({ number: 42, title: "Demo PR" });
  });

  it("gh_pr_list returns a JSON array", async () => {
    port = 18803;
    const cfgPath = writeMockGhConfig();
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });
    const sid = await handshake();
    const call = await mcpRequest("tools/call", { name: "gh_pr_list", arguments: {} }, 2, sid);
    const payload = JSON.parse(call.body.result.content[0].text);
    expect(payload.ok).toBe(true);
    expect(Array.isArray(payload.parsed_output)).toBe(true);
    expect(payload.parsed_output[0].number).toBe(42);
  });

  it("get_skills returns the gh skill content", async () => {
    port = 18804;
    const cfgPath = writeMockGhConfig();
    runtime = await startRuntime({
      host: "127.0.0.1",
      port,
      config: cfgPath,
      cachePath: join(dir, "cache.sqlite"),
      log: () => {},
    });
    const sid = await handshake();
    const call = await mcpRequest("tools/call", { name: "get_skills", arguments: { connector: "gh" } }, 2, sid);
    const payload = JSON.parse(call.body.result.content[0].text);
    expect(payload.ok).toBe(true);
    expect(payload.skills[0].content).toContain("GitHub CLI");
  });
});
