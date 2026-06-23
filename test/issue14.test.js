import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { HelpSource } from "../dist/discovery/sources.js";
import { buildDiscoveryEngine } from "../dist/discovery/engine-factory.js";
import { CacheStore } from "../dist/cache/db.js";
import { defineTool } from "../dist/registry/tool-definition.js";
import { buildArgv } from "../dist/executor/command-executor.js";
import { prepareSpawnCommand } from "../dist/executor/spawn-command.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

function connector(overrides = {}) {
    return {
        name: "az",
        binary: "az",
        argv_prefix: undefined,
        enabled: true,
        default_timeout_seconds: 1,
        working_dir: null,
        env: undefined,
        skills: [],
        skill_root: null,
        discovery: { mode: "help", max_depth: 2, ...overrides.discovery },
        ...overrides,
    };
}

function fakeTool(name) {
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
    it("loads discovery.parser_module before help discovery", async () => {
        const dir = mkdtempSync(join(tmpdir(), "cli-to-mcp-parser-"));
        const parserPath = join(dir, "az-parser.mjs");
        writeFileSync(parserPath, `
export const plugin = {
  id: "az",
  displayName: "Azure Test Parser",
  match: () => 100,
  parse(ctx) {
    return {
      connectorName: ctx.connectorName,
      path: ctx.path,
      rawHelp: ctx.rawHelp,
      description: ctx.path.length ? "leaf" : "root",
      usage: undefined,
      args: [],
      subcommands: ctx.path.length === 0 ? ["account"] : []
    };
  }
};
`);
        const logs = [];
        const conn = connector({ discovery: { mode: "help", parser: "az", parser_module: parserPath, max_depth: 1 } });
        const config = { config: {}, configDir: dir, connectors: [conn], tools: {}, configHash: "abc" };
        const { engine, parserRegistry } = await buildDiscoveryEngine(config, {
            log: (msg) => logs.push(msg),
            runHelpFn: async () => ({ rawHelp: "help", exitCode: 0, source: "stdout", timedOut: false }),
        });
        const tools = await engine.discover(conn, config);
        expect(parserRegistry.list().map((p) => p.id)).toContain("az");
        expect(logs.some((line) => line.includes("parser=az"))).toBe(true);
        expect(tools.map((t) => t.name)).toEqual(["az_account"]);
    });

    it("applies include_subgroups only at the root BFS level", async () => {
        const seen = [];
        const parserRegistry = {
            selectPlugin: () => ({ id: "test" }),
            parse(ctx) {
                if (ctx.path.length === 0) {
                    return { connectorName: ctx.connectorName, path: ctx.path, rawHelp: ctx.rawHelp, args: [], subcommands: ["account", "group"] };
                }
                if (ctx.path.length === 1) {
                    return { connectorName: ctx.connectorName, path: ctx.path, rawHelp: ctx.rawHelp, args: [], subcommands: ["list", "show"] };
                }
                return { connectorName: ctx.connectorName, path: ctx.path, rawHelp: ctx.rawHelp, args: [], subcommands: [] };
            },
        };
        const source = new HelpSource({
            parserRegistry,
            runHelpFn: async (_binary, path) => {
                seen.push(path.join(" "));
                return { rawHelp: "help", exitCode: 0, source: "stdout", timedOut: false };
            },
        });
        const conn = connector({ discovery: { mode: "help", include_subgroups: ["account"], max_depth: 2 } });
        const tools = await source.discover(conn, { connectors: [conn], tools: {}, configHash: "abc", configDir: "." });
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
        oldDb.prepare(`INSERT INTO tools VALUES (?, ?, ?, ?, ?, ?)`).run(
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
        const prepared = prepareSpawnCommand(["az", "account", "list"], "win32", { ComSpec: "C:/Windows/System32/cmd.exe" });
        expect(prepared.command).toContain("cmd.exe");
        expect(prepared.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
        expect(prepared.args[3]).toContain('"az" "account" "list"');
    });
});
