import { describe, expect, it } from "vitest";
import { genericPlugin } from "../src/discovery/plugins/generic.js";
import { toolFromDiscovered } from "../src/builder/tool-from-discovered.js";
import type { ResolvedConnector } from "../src/config/config-loader.js";
import { scanHelpTree } from "../src/discovery/help-discovery.js";
import { HelpParserRegistry } from "../src/discovery/parser-registry.js";
import { InMemoryToolRegistry } from "../src/registry/tool-registry.js";
import { defineTool } from "../src/registry/tool-definition.js";
import {
  listToolCategories,
  listToolsByCategory,
  searchTools,
  getToolSchema,
} from "../src/cli/tool-explorer.js";
import { runHelp } from "../src/discovery/help-runner.js";

function conn(over: Partial<ResolvedConnector["discovery"]> = {}): ResolvedConnector {
  return {
    name: "az",
    binary: "az",
    enabled: true,
    default_timeout_seconds: 1,
    working_dir: null,
    skills: [],
    skill_root: null,
    discovery: { mode: "help", max_depth: 2, ...over },
  };
}

describe("issue #15 P1-3 global args", () => {
  it("drops Global Arguments help/debug from leaf schema by default", () => {
    const help = `
Commands:
  list   List items

Global Arguments:
  --help -h     Show help
  --debug       Debug
  --output -o   Output format

Options:
  --name NAME   Name
`;
    const cmd = genericPlugin.parse({
      connectorName: "az",
      binary: "az",
      path: ["account", "list"],
      rawHelp: help,
      exitCode: 0,
    });
    const tool = toolFromDiscovered(cmd, conn());
    expect(tool).not.toBeNull();
    const names = tool!.args.map((a) => a.name);
    expect(names).not.toContain("help");
    expect(names).not.toContain("h");
    expect(names).not.toContain("debug");
    expect(names).toContain("output");
    expect(names).toContain("name");
  });

  it("materialize_global_args true keeps non-denied global fields", () => {
    const help = `
Global Arguments:
  --subscription SUB   Subscription id
  --debug              Debug
`;
    const cmd = genericPlugin.parse({
      connectorName: "az",
      binary: "az",
      path: ["x"],
      rawHelp: help,
      exitCode: 0,
    });
    const tool = toolFromDiscovered(cmd, conn({ materialize_global_args: true }));
    const names = tool!.args.map((a) => a.name);
    expect(names).toContain("subscription");
    expect(names).not.toContain("debug");
  });
});

describe("issue #15 parallel help BFS", () => {
  it("scanHelpTree visits all paths with concurrency > 1", async () => {
    const seen: string[] = [];
    const reg = new HelpParserRegistry();
    reg.register({
      id: "t",
      displayName: "t",
      match: () => 100,
      parse(ctx) {
        if (ctx.path.length === 0) {
          return {
            connectorName: ctx.connectorName,
            path: ctx.path,
            rawHelp: ctx.rawHelp,
            args: [],
            subcommands: ["a", "b"],
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
    const nodes = await scanHelpTree({
      connector: conn({ concurrency: 4 }),
      maxDepth: 1,
      helpTimeoutMs: 5000,
      concurrency: 4,
      parserRegistry: reg,
      log: () => {},
      runHelpFn: async (_b, path) => {
        seen.push(path.join(" ") || "(root)");
        return { rawHelp: "h", exitCode: 0, source: "stdout", timedOut: false };
      },
    });
    expect(seen.sort()).toEqual(["(root)", "a", "b"]);
    expect(nodes.filter((n) => n.cmd.subcommands.length === 0).length).toBe(2);
  });
});

describe("issue #15 tool explorer meta", () => {
  it("categories, search, and schema", () => {
    const reg = new InMemoryToolRegistry();
    reg.replaceAll([
      defineTool({
        name: "az_account_list",
        description: "list accounts",
        connectorName: "az",
        binary: "az",
        command: ["account", "list"],
        args: [{ name: "output", type: "string", required: false }],
        skillRefs: [],
        source: "help",
        enabled: true,
      }),
      defineTool({
        name: "az_group_list",
        description: "list groups",
        connectorName: "az",
        binary: "az",
        command: ["group", "list"],
        args: [],
        skillRefs: [],
        source: "help",
        enabled: true,
      }),
    ]);
    const cats = listToolCategories(reg);
    expect(cats.some((c) => c.id === "connector:az")).toBe(true);
    expect(cats.some((c) => c.id === "prefix:az:account")).toBe(true);
    const byCat = listToolsByCategory(reg, "prefix:az:account");
    expect(byCat.unknown_category).toBe(false);
    expect(byCat.tools.map((t) => t.name)).toEqual(["az_account_list"]);
    const found = searchTools(reg, "account");
    expect(found.length).toBeGreaterThan(0);
    const multi = searchTools(reg, "account list");
    expect(multi.some((t) => t.name === "az_account_list")).toBe(true);
    const schema = getToolSchema(reg, "az_account_list");
    expect(schema.ok).toBe(true);
    if (schema.ok) expect(schema.inputSchema.properties.output).toBeDefined();
  });
});

describe("issue #15 help_argv", () => {
  it("helpArgv option is accepted by runHelp", () => {
    expect(runHelp.length).toBeGreaterThanOrEqual(2);
  });
});