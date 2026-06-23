import { describe, it, expect } from "vitest";
import {
  YamlSource,
  TemplateSource,
  HelpSource,
  mergeArtifacts,
  makeTemplateArtifact,
  makeHelpArtifact,
  type DiscoveryArtifact,
} from "../src/discovery/sources.js";
import { DiscoveryEngine } from "../src/discovery/discovery-engine.js";
import { TemplateRegistry, loadBuiltinPacks } from "../src/discovery/template-registry.js";
import { defineTool } from "../src/registry/tool-definition.js";
import { toolFromDiscovered, buildToolName } from "../src/builder/tool-from-discovered.js";
import type { LoadedConfig, ResolvedConnector } from "../src/config/config-loader.js";
import type { DiscoveredCommand } from "../src/discovery/types.js";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

function mkConnector(name: string, binary = name, discovery: any = { mode: "help" }): ResolvedConnector {
  return {
    name,
    binary,
    enabled: true,
    skills: [],
    skill_root: null,
    working_dir: null,
    discovery,
  };
}

function mkConfig(tools: Record<string, any> = {}): LoadedConfig {
  return {
    config: { version: 1, connectors: [], tools },
    configDir: ".",
    connectors: [],
    tools,
    configHash: "deadbeef",
  } as LoadedConfig;
}

describe("YamlSource", () => {
  it("produces tools from explicit YAML declarations", async () => {
    const connector = mkConnector("gh");
    const config = mkConfig({
      gh_pr_view: {
        enabled: true,
        connector: "gh",
        command: ["pr", "view"],
        description: "View a PR",
        args: { number: { type: "integer", required: true } },
        output: { format: "json" },
      },
    });
    const arts = await new YamlSource().discover(connector, config);
    expect(arts).toHaveLength(1);
    expect(arts[0].kind).toBe("yaml");
    expect(arts[0].confidence).toBe(1);
    expect(arts[0].tool.name).toBe("gh_pr_view");
    expect(arts[0].tool.binary).toBe("gh");
    expect(arts[0].tool.inputSchema.required).toEqual(["number"]);
  });

  it("skips tools whose connector does not match", async () => {
    const connector = mkConnector("gh");
    const config = mkConfig({
      lark_search: { connector: "lark", command: ["search"] },
    });
    const arts = await new YamlSource().discover(connector, config);
    expect(arts).toEqual([]);
  });

  it("respects disabled flag", async () => {
    const connector = mkConnector("gh");
    const config = mkConfig({
      gh_pr_view: { enabled: false, connector: "gh", command: ["pr", "view"] },
    });
    const arts = await new YamlSource().discover(connector, config);
    expect(arts[0].tool.enabled).toBe(false);
  });
});

describe("TemplateSource", () => {
  it("returns empty when no pack matches", async () => {
    const src = new TemplateSource(new TemplateRegistry());
    const arts = await src.discover(mkConnector("unknown-cli"), mkConfig());
    expect(arts).toEqual([]);
  });

  it("auto-matches git connector and yields 4 template tools", async () => {
    const registry = loadBuiltinPacks();
    const src = new TemplateSource(registry);
    const arts = await src.discover(mkConnector("git"), mkConfig());
    expect(arts.length).toBe(4);
    expect(arts.map((a) => a.key).sort()).toEqual([
      "git_branch",
      "git_diff_stat",
      "git_log",
      "git_status",
    ]);
  });

  it("auto-matches gh connector by name and yields 4 template tools", async () => {
    const registry = loadBuiltinPacks();
    const src = new TemplateSource(registry);
    const arts = await src.discover(mkConnector("gh"), mkConfig());
    expect(arts.length).toBe(4);
    const names = arts.map((a) => a.key).sort();
    expect(names).toEqual(["gh_issue_list", "gh_pr_list", "gh_pr_view", "gh_repo_view"]);
    for (const a of arts) {
      expect(a.kind).toBe("template");
      expect(a.confidence).toBeGreaterThan(0.7);
      expect(a.tool.source).toBe("template");
      expect(a.tool.output?.format).toBe("json");
    }
  });

  it("respects explicit discovery.template id over name match", async () => {
    const registry = loadBuiltinPacks();
    const src = new TemplateSource(registry);
    // connector named "mycli" but explicitly asking for the gh pack
    const connector = mkConnector("mycli", "gh", { mode: "manual", template: "gh" });
    const arts = await src.discover(connector, mkConfig());
    expect(arts.length).toBe(4);
    // template tools keep the connector name from the pack ("gh"), so they
    // only surface when the connector name matches. Verify the pack resolved.
    expect(arts.map((a) => a.key).sort()).toEqual([
      "gh_issue_list",
      "gh_pr_list",
      "gh_pr_view",
      "gh_repo_view",
    ]);
  });

  it("does not run when connector name mismatches and no template id set", async () => {
    const registry = loadBuiltinPacks();
    const src = new TemplateSource(registry);
    const arts = await src.discover(mkConnector("not-gh"), mkConfig());
    expect(arts).toEqual([]);
  });
});

describe("HelpSource", () => {
  it("returns empty when mode is manual/none", async () => {
    const src = new HelpSource();
    expect(await src.discover(mkConnector("x", "x", { mode: "manual" }), mkConfig())).toEqual([]);
    expect(await src.discover(mkConnector("x", "x", { mode: "none" }), mkConfig())).toEqual([]);
  });

  it("returns empty when help binary produces no output", async () => {
    const src = new HelpSource({
      runHelpFn: async () => ({ rawHelp: "", exitCode: 1, source: "stdout", timedOut: false }),
    });
    const arts = await src.discover(mkConnector("x"), mkConfig());
    expect(arts).toEqual([]);
  });

  it("generates tools from leaf subcommands using fixture help", async () => {
    // Simulate a CLI whose root help lists "run" and "list", and whose
    // subcommand help is a leaf with flags.
    const rootHelp = `My CLI

Usage: demo [command]

Commands:
  run       Run a task
  list      List items

Options:
  --help    Show help
`;
    const runHelp = `Run a task

Usage: demo run

Options:
  --name <string>   Name to use
  --verbose         Verbose output
  --help            Show help
`;
    const listHelp = `List items

Usage: demo list

Options:
  --limit <int>     Max items
  --help            Show help
`;
    const helpTexts = new Map<string, string>([
      ["", rootHelp],
      ["run", runHelp],
      ["list", listHelp],
    ]);
    const src = new HelpSource({
      runHelpFn: async (_bin, path) => ({
        rawHelp: helpTexts.get(path.join(" ")) ?? "",
        exitCode: 0,
        source: "stdout",
        timedOut: false,
      }),
    });
    const arts = await src.discover(mkConnector("demo", "demo"), mkConfig());
    const names = arts.map((a) => a.key).sort();
    expect(names).toEqual(["demo_list", "demo_run"]);
    for (const a of arts) {
      expect(a.kind).toBe("help");
      expect(a.confidence).toBeLessThan(0.5);
    }
    const run = arts.find((a) => a.key === "demo_run")!.tool;
    expect(run.args.map((x) => x.name).sort()).toEqual(["name", "verbose"]);
    expect(run.args.find((x) => x.name === "verbose").type).toBe("boolean");
    expect(run.args.find((x) => x.name === "name").type).toBe("string");
    // --help must never appear in schema
    expect(run.args.find((x) => x.name === "help")).toBeUndefined();
  });

  it("does not generate a tool for root command (no path)", async () => {
    const rootHelp = `root

Commands:
  sub       A subcommand
`;
    const subHelp = `sub command leaf

Options:
  --flag     A flag
`;
    const helpTexts = new Map([["", rootHelp], ["sub", subHelp]]);
    const src = new HelpSource({
      runHelpFn: async (_b, path) => ({
        rawHelp: helpTexts.get(path.join(" ")) ?? "",
        exitCode: 0,
        source: "stdout",
        timedOut: false,
      }),
    });
    const arts = await src.discover(mkConnector("c", "c"), mkConfig());
    expect(arts.map((a) => a.key)).toEqual(["c_sub"]);
  });

  it("respects max_depth (does not scan beyond it)", async () => {
    const rootHelp = `root

Commands:
  a     A
`;
    const aHelp = `a

Commands:
  b     B
`;
    const bHelp = `b leaf

Options:
  --x     x
`;
    const helpTexts = new Map([["", rootHelp], ["a", aHelp], ["a b", bHelp]]);
    const src = new HelpSource({
      runHelpFn: async (_bin, path) => ({
        rawHelp: helpTexts.get(path.join(" ")) ?? "",
        exitCode: 0,
        source: "stdout",
        timedOut: false,
      }),
    });
    // max_depth=1: only root scanned for subs, "a" scanned but its subs not.
    const arts = await src.discover(
      mkConnector("c", "c", { mode: "help", max_depth: 1 }),
      mkConfig(),
    );
    // "a" is a non-leaf at depth 1 (has subcommand "b"), so no tool; "b" never scanned.
    expect(arts).toEqual([]);
  });
});

describe("buildToolName / toolFromDiscovered", () => {
  it("builds name from connector + path", () => {
    expect(buildToolName("gh", ["pr", "view"])).toBe("gh_pr_view");
    expect(buildToolName("gcloud", ["storage", "buckets", "list"])).toBe(
      "gcloud_storage_buckets_list",
    );
  });

  it("strips illegal characters", () => {
    expect(buildToolName("my-cli", ["do-stuff"])).toBe("my_cli_do_stuff");
  });

  it("does not collide: connector-prefixed meta name (e.g. c_doctor) is allowed", () => {
    // buildToolName always prefixes connector name, so "c_doctor" never equals
    // the meta-tool "doctor". Only a connector literally named "doctor" with
    // an empty path would collide — but leaves always have path length >= 1,
    // so this is a safe guard rather than a reachable case.
    const cmd: DiscoveredCommand = {
      connectorName: "c",
      path: ["doctor"],
      rawHelp: "",
      args: [],
      subcommands: [],
    };
    const tool = toolFromDiscovered(cmd, mkConnector("c"));
    expect(tool).not.toBeNull();
    expect(tool!.name).toBe("c_doctor");
  });
});

describe("mergeArtifacts", () => {
  const yamlTool = defineTool({
    name: "gh_pr_view",
    description: "from yaml",
    connectorName: "gh",
    binary: "gh",
    command: ["pr", "view"],
    args: [{ name: "number", type: "integer", required: true }],
    skillRefs: [],
    source: "yaml",
    enabled: true,
  });
  const helpTool = defineTool({
    name: "gh_pr_view",
    description: "from help",
    connectorName: "gh",
    binary: "gh",
    command: ["pr", "view"],
    args: [],
    skillRefs: [],
    source: "help",
    enabled: true,
  });
  const templateTool = defineTool({
    name: "gh_pr_view",
    description: "from template",
    connectorName: "gh",
    binary: "gh",
    command: ["pr", "view"],
    args: [{ name: "json", type: "string", required: false }],
    skillRefs: [],
    source: "template",
    enabled: true,
  });

  it("yaml wins over help and template", () => {
    const merged = mergeArtifacts([
      makeHelpArtifact({ ...helpTool, source: undefined as any }),
      makeTemplateArtifact({ ...templateTool, source: undefined as any }),
      { tool: yamlTool, kind: "yaml", confidence: 1, key: "gh_pr_view" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].description).toBe("from yaml");
  });

  it("records mixed source when multiple sources contribute", () => {
    const merged = mergeArtifacts([
      makeHelpArtifact({ ...helpTool, source: undefined as any }),
      { tool: yamlTool, kind: "yaml", confidence: 1, key: "gh_pr_view" },
    ]);
    expect(merged[0].source).toBe("mixed");
    const kinds = merged[0].sources.map((s) => s.kind).sort();
    expect(kinds).toEqual(["help", "yaml"]);
  });

  it("single source keeps its own label", () => {
    const merged = mergeArtifacts([
      { tool: yamlTool, kind: "yaml", confidence: 1, key: "gh_pr_view" },
    ]);
    expect(merged[0].source).toBe("yaml");
  });

  it("preserves confidence per source", () => {
    const merged = mergeArtifacts([
      makeHelpArtifact({ ...helpTool, source: undefined as any }, 0.4),
      { tool: yamlTool, kind: "yaml", confidence: 1, key: "gh_pr_view" },
    ]);
    const helpSrc = merged[0].sources.find((s) => s.kind === "help");
    expect(helpSrc?.confidence).toBe(0.4);
  });
});

describe("DiscoveryEngine (integration)", () => {
  it("template + help + yaml merge: yaml wins on overlap, template fills the rest", async () => {
    // connector gh + builtin template pack (4 tools) + yaml override on gh_pr_view
    // + help source disabled (mode manual) so we isolate yaml+template.
    const connector = mkConnector("gh", "gh", { mode: "manual" });
    const config = mkConfig({
      gh_pr_view: {
        enabled: true,
        connector: "gh",
        command: ["pr", "view"],
        description: "YAML override desc",
        args: { number: { type: "integer", required: true } },
      },
    });
    const engine = new DiscoveryEngine();
    const tools = await engine.discover(connector, config);
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.size).toBe(4);
    // Overridden tool: yaml fields win, source mixed (yaml + template).
    const prView = byName.get("gh_pr_view")!;
    expect(prView.description).toBe("YAML override desc");
    expect(prView.source).toBe("mixed");
    expect(prView.sources.map((s) => s.kind).sort()).toEqual(["template", "yaml"]);
    // Non-overridden template tools stay pure template.
    const prList = byName.get("gh_pr_list")!;
    expect(prList.source).toBe("template");
  });

  it("connector-only (no tools:) + manual mode yields template tools", async () => {
    const connector = mkConnector("gh", "gh", { mode: "manual" });
    const engine = new DiscoveryEngine();
    const tools = await engine.discover(connector, mkConfig());
    expect(tools.map((t) => t.name).sort()).toEqual([
      "gh_issue_list",
      "gh_pr_list",
      "gh_pr_view",
      "gh_repo_view",
    ]);
    expect(tools.every((t) => t.source === "template")).toBe(true);
  });

  it("unknown connector + no tools + manual mode returns empty", async () => {
    const connector = mkConnector("unknown-cli", "unknown-cli", { mode: "manual" });
    const engine = new DiscoveryEngine();
    const tools = await engine.discover(connector, mkConfig());
    expect(tools).toEqual([]);
  });
});
