import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { HelpSource } from "../src/discovery/sources.js";
import { buildDiscoveryEngine } from "../src/discovery/engine-factory.js";
import { HelpParserRegistry } from "../src/discovery/parser-registry.js";
import { CacheStore } from "../src/cache/db.js";
import { defineTool } from "../src/registry/tool-definition.js";
import { buildArgv } from "../src/executor/command-executor.js";
import { prepareSpawnCommand } from "../src/executor/spawn-command.js";
import type { LoadedConfig, ResolvedConnector } from "../src/config/config-loader.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    exec: (sql: string) => void;
    prepare: (sql: string) => { run: (...a: unknown[]) => void };
    close: () => void;
  };
};

function connector(overrides: { discovery?: ResolvedConnector["discovery"] } = {}): ResolvedConnector {
  return {
    name: "az",
    binary: "az",
    enabled: true,
    default_timeout_seconds: 1,
    working_dir: null,
    skills: [],
    skill_root: null,
    discovery: { mode: "help", max_depth: 2, ...overrides.discovery },
  };
}

function fakeTool(name: string) {
  return defineTool({
    name,
    description: name,
    connectorName: "az",
    binary: "az",
    command: ["account", "list"],
    args: [],
    skillRefs: [],
    source: "help",
    enabled: true,
  });
}

describe("issue #14 config-only connector fixes", () => {
  it("loads top-level parsers: before help discovery", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-to-mcp-parser-"));
    const parserPath = join(dir, "shared-parser.mjs");
    writeFileSync(
      parserPath,
      `export const plugin = {
  id: "shared",
  displayName: "Shared",
  match: () => 100,
  parse(ctx) {
    return {
      connectorName: ctx.connectorName,
      path: ctx.path,
      rawHelp: ctx.rawHelp,
      args: [],
      subcommands: ctx.path.length === 0 ? ["a", "b"] : []
    };
  }
};`,
    );
    const logs: string[] = [];
    const connA = connector({
      discovery: { mode: "help", parser: "shared", max_depth: 1 },
    });
    const connB: ResolvedConnector = {
      ...connector({ discovery: { mode: "help", parser: "shared", max_depth: 1 } }),
      name: "other",
      binary: "other",
    };
    const config: LoadedConfig = {
      config: { version: 1, connectors: [], parsers: [parserPath] },
      configDir: dir,
      parserModules: [parserPath],
      connectors: [connA, connB],
      tools: {},
      configHash: "abc",
    };
    const { engine, parserRegistry } = await buildDiscoveryEngine(config, {
      log: (msg) => logs.push(msg),
      runHelpFn: async () => ({
        rawHelp: "help",
        exitCode: 0,
        source: "stdout" as const,
        timedOut: false,
      }),
    });
    const tools = await engine.discover(connA, config);
    expect(parserRegistry.list().map((p) => p.id)).toContain("shared");
    expect(logs.filter((l) => l.includes("loaded parser module")).length).toBe(1);
    expect(tools.map((t) => t.name).sort()).toEqual(["az_a", "az_b"]);
  });

  it("loads discovery.parser_module before help discovery", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-to-mcp-parser-"));
    const parserPath = join(dir, "az-parser.mjs");
    writeFileSync(
      parserPath,
      `export const plugin = {
  id: "az",
  displayName: "Azure Test Parser",
  match: () => 100,
  parse(ctx) {
    return {
      connectorName: ctx.connectorName,
      path: ctx.path,
      rawHelp: ctx.rawHelp,
      description: ctx.path.length ? "leaf" : "root",
      args: [],
      subcommands: ctx.path.length === 0 ? ["account"] : []
    };
  }
};`,
    );
    const logs: string[] = [];
    const conn = connector({
      discovery: { mode: "help", parser: "az", parser_module: parserPath, max_depth: 1 },
    });
    const config: LoadedConfig = {
      config: { version: 1, connectors: [] },
      configDir: dir,
      parserModules: [],
      connectors: [conn],
      tools: {},
      configHash: "abc",
    };
    const { engine, parserRegistry } = await buildDiscoveryEngine(config, {
      log: (msg) => logs.push(msg),
      runHelpFn: async () => ({
        rawHelp: "help",
        exitCode: 0,
        source: "stdout" as const,
        timedOut: false,
      }),
    });
    const tools = await engine.discover(conn, config);
    expect(parserRegistry.list().map((p) => p.id)).toContain("az");
    expect(logs.some((line) => line.includes("parser=az"))).toBe(true);
    expect(tools.map((t) => t.name)).toEqual(["az_account"]);
  });

  it("applies include_subgroups only at the root BFS level", async () => {
    const seen: string[] = [];
    const reg = new HelpParserRegistry();
    reg.register({
      id: "test",
      displayName: "Test",
      match: () => 100,
      parse(ctx) {
        if (ctx.path.length === 0) {
          return {
            connectorName: ctx.connectorName,
            path: ctx.path,
            rawHelp: ctx.rawHelp,
            args: [],
            subcommands: ["account", "group"],
          };
        }
        if (ctx.path.length === 1) {
          return {
            connectorName: ctx.connectorName,
            path: ctx.path,
            rawHelp: ctx.rawHelp,
            args: [],
            subcommands: ["list", "show"],
          };
        }
        return {
          connectorName: ctx.connectorName,
          path: ctx.path,
          rawHelp: ctx.rawHelp,
          args: [],
          subcommands: [],
        };
      },
    });
    const source = new HelpSource({
      parserRegistry: reg,
      runHelpFn: async (_binary, path) => {
        seen.push(path.join(" "));
        return { rawHelp: "help", exitCode: 0, source: "stdout", timedOut: false };
      },
    });
    const conn = connector({ discovery: { mode: "help", include_subgroups: ["account"], max_depth: 2 } });
    const tools = await source.discover(conn, {
      connectors: [conn],
      tools: {},
      configHash: "abc",
      configDir: ".",
      config: { version: 1, connectors: [] },
    });
    expect(seen).toEqual(["", "account", "account list", "account show"]);
    expect(tools.map((a) => a.tool.name).sort()).toEqual(["az_account_list", "az_account_show"]);
  });

  it("migrates old cache schema and keeps same tool names isolated by config hash", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-to-mcp-cache-"));
    const dbPath = join(dir, "cache.sqlite");
    const oldDb = new DatabaseSync(dbPath);
    oldDb.exec(`
      CREATE TABLE tools (
        name TEXT PRIMARY KEY,
        connector_name TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        source TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    oldDb
      .prepare(`INSERT INTO tools VALUES (?, ?, ?, ?, ?, ?)`)
      .run(
        "az_account_list",
        "az",
        JSON.stringify(fakeTool("az_account_list")),
        "help",
        "hash-a",
        new Date(0).toISOString(),
      );
    oldDb.close();

    const cache = new CacheStore(dbPath);
    cache.replaceTools("hash-b", [fakeTool("az_account_list")]);
    expect(cache.loadTools("hash-a")).toHaveLength(1);
    expect(cache.loadTools("hash-b")).toHaveLength(1);
    expect(cache.loadLatestTools()).toHaveLength(1);
    cache.close();
  });

  it("builds argv_prefix into execution argv and uses cmd.exe shim on Windows", () => {
    const tool = defineTool({
      name: "az_account_list",
      description: "list accounts",
      connectorName: "az",
      binary: "python.exe",
      argvPrefix: ["-IBm", "azure.cli"],
      command: ["account", "list"],
      args: [],
      defaultArgs: ["--output", "json"],
      skillRefs: [],
      source: "help",
      enabled: true,
    });
    const argv = buildArgv(tool, {});
    expect(argv).toEqual(["python.exe", "-IBm", "azure.cli", "account", "list", "--output", "json"]);
    const prepared = prepareSpawnCommand(["az", "account", "list"], "win32", {
      ComSpec: "C:/Windows/System32/cmd.exe",
      PATH: "",
    });
    expect(prepared.command).toContain("cmd.exe");
    if (prepared.args[1] === "/s") {
      expect(prepared.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
      expect(prepared.args[3]).toMatch(/account.*list/);
      expect(prepared.args[3]).toMatch(/az(\.cmd)?"/i);
    } else {
      // Resolved full-path az.cmd uses cmd /d /c path arg...
      expect(prepared.args[0]).toBe("/d");
      expect(prepared.args[1]).toBe("/c");
      expect(prepared.args[2]).toMatch(/az\.cmd$/i);
      expect(prepared.args.slice(3)).toEqual(["account", "list"]);
    }
  });
});