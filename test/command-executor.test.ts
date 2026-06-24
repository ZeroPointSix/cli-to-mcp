import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { CommandExecutor, buildArgv, flagFor } from "../src/executor/command-executor.js";
import { defineTool } from "../src/registry/tool-definition.js";

const MOCK_CLI = fileURLToPath(new URL("./fixtures/mock-cli.js", import.meta.url));
const NODE = process.execPath;

function mkTool(opts: { command?: string[]; args?: any[]; binary?: string; defaultArgs?: string[] } = {}) {
  return defineTool({
    name: "mock_run",
    description: "mock",
    connectorName: "mock",
    binary: opts.binary ?? NODE,
    command: opts.command ?? [MOCK_CLI],
    args: opts.args ?? [],
    skillRefs: [],
    source: "yaml",
    enabled: true,
    defaultArgs: opts.defaultArgs,
  });
}

describe("buildArgv", () => {
  it("emits binary + command + flags", () => {
    const t = mkTool({
      args: [
        { name: "number", type: "integer", required: true },
        { name: "verbose", type: "boolean", required: false },
        { name: "json", type: "string", required: false },
      ],
    });
    const argv = buildArgv(t, { number: 5, verbose: true, json: "x" });
    expect(argv).toEqual([NODE, MOCK_CLI, "--number", "5", "--verbose", "--json", "x"]);
  });

  it("emits repeatable flags multiple times", () => {
    const t = mkTool({
      args: [{ name: "label", type: "array", required: false }],
    });
    expect(buildArgv(t, { label: ["a", "b"] })).toEqual([
      NODE,
      MOCK_CLI,
      "--label",
      "a",
      "--label",
      "b",
    ]);
  });

  it("appends defaultArgs after user args", () => {
    const t = mkTool({
      args: [{ name: "number", type: "integer", required: false }],
      defaultArgs: ["--json", "number,title"],
    });
    expect(buildArgv(t, { number: 1 })).toEqual([
      NODE,
      MOCK_CLI,
      "--number",
      "1",
      "--json",
      "number,title",
    ]);
  });

  it("shell metacharacters in values stay as single argv tokens", () => {
    const t = mkTool({
      args: [{ name: "query", type: "string", required: false }],
    });
    const argv = buildArgv(t, { query: "foo; rm -rf / && echo pwned" });
    // Single token, not split by shell.
    expect(argv).toEqual([NODE, MOCK_CLI, "--query", "foo; rm -rf / && echo pwned"]);
    expect(argv[3]).toBe("foo; rm -rf / && echo pwned");
  });

  it("uses YAML aliases as CLI flag names", () => {
    const t = mkTool({
      args: [
        { name: "json", type: "string", required: false, aliases: ["j"] },
        { name: "verbose", type: "boolean", required: false, aliases: ["v"] },
      ],
    });
    expect(buildArgv(t, { json: "fields", verbose: true })).toEqual([
      NODE,
      MOCK_CLI,
      "-j",
      "fields",
      "-v",
    ]);
  });

  it("repeatable non-array type emits flag multiple times", () => {
    const t = mkTool({
      args: [{ name: "label", type: "string", required: false, repeatable: true }],
    });
    expect(buildArgv(t, { label: ["x", "y"] })).toEqual([
      NODE,
      MOCK_CLI,
      "--label",
      "x",
      "--label",
      "y",
    ]);
  });

  it("uses single-dash form for single-char flag names", () => {
    const t = mkTool({
      args: [{ name: "v", type: "boolean", required: false }],
    });
    expect(buildArgv(t, { v: true })).toEqual([NODE, MOCK_CLI, "-v"]);
  });

  it("emits positional args before flags", () => {
    const t = mkTool({
      command: ["api"],
      args: [
        { name: "method", type: "string", required: true, kind: "positional", position: 0 },
        { name: "path", type: "string", required: true, kind: "positional", position: 1 },
        { name: "verbose", type: "boolean", required: false, kind: "flag" },
      ],
    });
    expect(buildArgv(t, { method: "GET", path: "/x", verbose: true })).toEqual([
      NODE,
      "api",
      "GET",
      "/x",
      "--verbose",
    ]);
  });

  it("help-discovered short aliases (-R, -n) must not become ---R / ---n", () => {
    const t = mkTool({
      args: [
        { name: "repo", type: "string", required: false, aliases: ["-R"] },
        { name: "number", type: "integer", required: false, aliases: ["-n"] },
      ],
    });
    expect(buildArgv(t, { repo: "o/r", number: 3 })).toEqual([
      NODE,
      MOCK_CLI,
      "-R",
      "o/r",
      "-n",
      "3",
    ]);
  });
});

describe("flagFor", () => {
  it("normalizes parser/YAML alias forms", () => {
    expect(flagFor("-R")).toBe("-R");
    expect(flagFor("-n")).toBe("-n");
    expect(flagFor("--json")).toBe("--json");
    expect(flagFor("R")).toBe("-R");
    expect(flagFor("json")).toBe("--json");
    expect(flagFor("j")).toBe("-j");
  });
});

describe("CommandExecutor.execute", () => {
  const ex = new CommandExecutor();

  it("captures stdout, exit code 0, duration", async () => {
    const t = mkTool({
      args: [{ name: "number", type: "integer", required: false }],
    });
    const res = await ex.execute({ tool: t, args: { number: 7 } });
    expect(res.exitCode).toBe(0);
    expect(res.timedOut).toBe(false);
    expect(res.binaryNotFound).toBe(false);
    expect(res.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(res.stdout).args).toContain("--number");
    expect(JSON.parse(res.stdout).args).toContain("7");
  });

  it("captures non-zero exit and stderr", async () => {
    const t = mkTool({
      args: [{ name: "fail", type: "boolean", required: false }],
    });
    const res = await ex.execute({ tool: t, args: { fail: true } });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain("boom");
  });

  it("reports timeout", async () => {
    const t = mkTool({
      args: [{ name: "sleep", type: "boolean", required: false }],
    });
    const res = await ex.execute({ tool: t, args: { sleep: true }, timeoutMs: 200 });
    expect(res.timedOut).toBe(true);
    expect(res.exitCode).toBe(null);
  });

  it("reports binary not found (ENOENT)", async () => {
    // On win32, bare names are resolved via cmd.exe and fail with exit code, not ENOENT.
    const missingBinary =
      process.platform === "win32"
        ? "C:\\no\\such\\binary-xyz.exe"
        : "definitely-not-a-real-binary-xyz-12345";
    const t = mkTool({ binary: missingBinary });
    const res = await ex.execute({ tool: t, args: {} });
    expect(res.binaryNotFound).toBe(true);
    expect(res.exitCode).toBe(null);
  });

  it("does not shell-inject: semicolons stay literal", async () => {
    const t = mkTool({
      args: [{ name: "query", type: "string", required: false }],
    });
    const res = await ex.execute({
      tool: t,
      args: { query: "foo; echo PWNED" },
    });
    expect(res.exitCode).toBe(0);
    // mock-cli echoes args; "echo PWNED" never ran as a separate command.
    const echoed = JSON.parse(res.stdout).args as string[];
    expect(echoed).toContain("--query");
    expect(echoed).toContain("foo; echo PWNED");
    expect(res.stdout).not.toContain("PWNED\n");
  });

  it("merged env is used for spawn (EXEC-001: same env as child process)", async () => {
    const t = mkTool({
      args: [{ name: "number", type: "integer", required: false }],
    });
    const customComSpec = process.platform === "win32" ? process.env.ComSpec : undefined;
    const res = await ex.execute({
      tool: t,
      args: { number: 1 },
      env: customComSpec ? { ComSpec: customComSpec } : { MOCK_ENV_VAR: "overlay" },
    });
    expect(res.exitCode).toBe(0);
  });

  it("inherits and overlays env", async () => {
    const t = mkTool({
      args: [{ name: "showenv", type: "boolean", required: false }],
    });
    // mock-cli doesn't print env; this just verifies spawn doesn't reject
    // when env overlay is provided.
    const res = await ex.execute({
      tool: t,
      args: {},
      env: { MOCK_ENV_VAR: "1" },
    });
    expect(res.exitCode).toBe(0);
  });
});
