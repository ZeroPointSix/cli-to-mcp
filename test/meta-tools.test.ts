import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DiscoveryEngine } from "../src/discovery/discovery-engine.js";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MetaTools, resolvePathUnderSkillRoot } from "../src/cli/meta-tools.js";
import { InMemoryToolRegistry } from "../src/registry/tool-registry.js";
import { CacheStore } from "../src/cache/db.js";
import { defineTool } from "../src/registry/tool-definition.js";
import type { LoadedConfig, ResolvedConnector } from "../src/config/config-loader.js";
import { createDefaultParserRegistry } from "../src/discovery/sources.js";

let dir: string;
let cache: CacheStore;
let registry: InMemoryToolRegistry;

function setup(opts: { toolsInRegistry?: ReturnType<typeof defineTool>[]; skills?: Record<string, string> } = {}) {
  dir = mkdtempSync(join(tmpdir(), "c2m-meta-"));
  if (opts.skills) {
    for (const [name, content] of Object.entries(opts.skills)) {
      writeFileSync(join(dir, name), content, "utf8");
    }
  }
  cache = new CacheStore(join(dir, "cache.sqlite"));
  registry = new InMemoryToolRegistry();
  const connector: ResolvedConnector = {
    name: "gh",
    binary: "gh",
    enabled: true,
    skills: opts.skills?.["gh.md"] ? [join(dir, "gh.md")] : [],
    skill_root: null,
    working_dir: null,
    discovery: { mode: "help" },
  };
  const config: LoadedConfig = {
    config: { version: 1, connectors: [], tools: {} },
    configDir: dir,
    connectors: [connector],
    tools: {},
    configHash: "abc12345",
  } as LoadedConfig;
  if (opts.toolsInRegistry) registry.replaceAll(opts.toolsInRegistry);
  const meta = new MetaTools({
    registry,
    cache,
    config,
    connectors: new Map([[connector.name, connector]]),
    log: () => {},
  });
  return { meta, connector, config };
}

afterEach(() => {
  if (cache) {
    try {
      cache.close();
    } catch {
      /* already closed */
    }
  }
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("MetaTools.list / has", () => {
  it("lists 5 fixed meta tools", () => {
    const { meta } = setup();
    const names = meta.list().map((m) => m.name);
    expect(names).toEqual([
      "list_connectors",
      "doctor",
      "refresh_tools",
      "get_skills",
      "get_tool_source",
    ]);
    expect(meta.has("doctor")).toBe(true);
    expect(meta.has("not_a_meta_tool")).toBe(false);
  });
});

describe("MetaTools.list_connectors", () => {
  it("returns configured connectors", async () => {
    const { meta } = setup();
    const res = await meta.call("list_connectors", {});
    expect(res).toMatchObject({
      ok: true,
      connectors: [{ name: "gh", binary: "gh", enabled: true }],
    });
  });
});

describe("MetaTools.doctor", () => {
  it("reports connector cache state", async () => {
    const { meta } = setup();
    cache.upsertConnector({
      name: "gh",
      binary: "gh",
      enabled: 1,
      version: "2.60.0",
      config_hash: "abc12345",
    });
    const res: any = await meta.call("doctor", {});
    expect(res.ok).toBe(true);
    expect(res.connectors[0].cached_version).toBe("2.60.0");
    expect(res.config_hash).toBe("abc12345");
  });
});

describe("MetaTools.get_tool_source", () => {
  it("reports source for a registered tool", async () => {
    const tool = defineTool({
      name: "gh_pr_view",
      description: "view pr",
      connectorName: "gh",
      binary: "gh",
      command: ["pr", "view"],
      args: [],
      skillRefs: [],
      source: "yaml",
      enabled: true,
    });
    const { meta } = setup({ toolsInRegistry: [tool] });
    const res: any = await meta.call("get_tool_source", { name: "gh_pr_view" });
    expect(res.ok).toBe(true);
    expect(res.source).toBe("yaml");
    expect(res.binary).toBe("gh");
    expect(res.command).toEqual(["pr", "view"]);
  });

  it("errors for unknown tool", async () => {
    const { meta } = setup();
    const res: any = await meta.call("get_tool_source", { name: "nope" });
    expect(res.ok).toBe(false);
  });
});

describe("MetaTools.get_skills", () => {
  it("reads skill file content", async () => {
    const { meta } = setup({ skills: { "gh.md": "# gh skill\nuse for github" } });
    const res: any = await meta.call("get_skills", { connector: "gh" });
    expect(res.ok).toBe(true);
    expect(res.skills[0].content).toContain("github");
  });

  it("reads tool-level skills", async () => {
    // tool + skillRefs must be built AFTER setup creates dir, so paths align.
    dir = mkdtempSync(join(tmpdir(), "c2m-meta-skill-"));
    const skillPath = join(dir, "pr-skill.md");
    writeFileSync(skillPath, "# pr skill", "utf8");
    cache = new CacheStore(join(dir, "cache.sqlite"));
    registry = new InMemoryToolRegistry();
    const tool = defineTool({
      name: "gh_pr_view",
      description: "view",
      connectorName: "gh",
      binary: "gh",
      command: ["pr", "view"],
      args: [],
      skillRefs: [skillPath],
      source: "yaml",
      enabled: true,
    });
    registry.replaceAll([tool]);
    const connector: ResolvedConnector = {
      name: "gh",
      binary: "gh",
      enabled: true,
      skills: [],
      skill_root: null,
      working_dir: null,
      discovery: { mode: "help" },
    };
    const config: LoadedConfig = {
      config: { version: 1, connectors: [], tools: {} },
      configDir: dir,
      connectors: [connector],
      tools: {},
      configHash: "abc12345",
    } as LoadedConfig;
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[connector.name, connector]]),
      log: () => {},
    });
    const res: any = await meta.call("get_skills", { tool: "gh_pr_view" });
    expect(res.skills[0].content).toContain("pr skill");
  });
});

describe("MetaTools.refresh_tools", () => {
  it("runs discovery and updates registry", async () => {
    dir = mkdtempSync(join(tmpdir(), "c2m-meta-refresh-"));
    cache = new CacheStore(join(dir, "cache.sqlite"));
    registry = new InMemoryToolRegistry();
    const connector: ResolvedConnector = {
      name: "gh",
      binary: "gh",
      enabled: true,
      skills: [],
      skill_root: null,
      working_dir: null,
      discovery: { mode: "help" },
    };
    // ResolvedTool needs skills/connector/command; provide a full declaration.
    const resolvedTools = {
      gh_pr_view: {
        enabled: true,
        connector: "gh",
        command: ["pr", "view"],
        description: "view",
        skills: [],
      },
    };
    const config: LoadedConfig = {
      config: { version: 1, connectors: [], tools: {} },
      configDir: dir,
      connectors: [connector],
      tools: resolvedTools as any,
      configHash: "abc12345",
    } as LoadedConfig;
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[connector.name, connector]]),
      log: () => {},
    });
    const res: any = await meta.call("refresh_tools", {});
    expect(res.ok).toBe(true);
    expect(res.refreshed).toBeGreaterThanOrEqual(1);
    expect(registry.getTool("gh_pr_view")).not.toBeNull();
  });

  it("partial connector failure keeps previous tools for failed connector", async () => {
    dir = mkdtempSync(join(tmpdir(), "c2m-meta-partial-"));
    cache = new CacheStore(join(dir, "cache.sqlite"));
    registry = new InMemoryToolRegistry();
    const stale = defineTool({
      name: "bad_stale_tool",
      description: "stale",
      connectorName: "bad",
      binary: "bad",
      command: ["x"],
      args: [],
      skillRefs: [],
      source: "yaml",
      enabled: true,
    });
    const fresh = defineTool({
      name: "good_fresh_tool",
      description: "will be replaced",
      connectorName: "good",
      binary: "good",
      command: ["y"],
      args: [],
      skillRefs: [],
      source: "yaml",
      enabled: true,
    });
    registry.replaceAll([stale, fresh]);
    const goodConn: ResolvedConnector = {
      name: "good",
      binary: "good",
      enabled: true,
      skills: [],
      skill_root: null,
      working_dir: null,
      discovery: { mode: "manual" },
    };
    const badConn: ResolvedConnector = {
      name: "bad",
      binary: "bad",
      enabled: true,
      skills: [],
      skill_root: null,
      working_dir: null,
      discovery: { mode: "manual" },
    };
    const config: LoadedConfig = {
      config: { version: 1, connectors: [], tools: {} },
      configDir: dir,
      connectors: [goodConn, badConn],
      tools: {},
      configHash: "partial01",
    } as LoadedConfig;
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([
        [goodConn.name, goodConn],
        [badConn.name, badConn],
      ]),
      log: () => {},
    });
    const discoveredGood = defineTool({
      name: "good_new_tool",
      description: "new",
      connectorName: "good",
      binary: "good",
      command: ["z"],
      args: [],
      skillRefs: [],
      source: "yaml",
      enabled: true,
    });
    const discoverSpy = vi.spyOn(DiscoveryEngine.prototype, "discover").mockImplementation(async (conn) => {
      if (conn.name === "bad") throw new Error("discovery boom");
      return [discoveredGood];
    });
    try {
      const res: any = await meta.call("refresh_tools", {});
      expect(res.ok).toBe(false);
      expect(res.failures).toBe(1);
      expect(res.note).toContain("partial refresh");
      expect(registry.getTool("bad_stale_tool")).not.toBeNull();
      expect(registry.getTool("good_new_tool")).not.toBeNull();
      expect(registry.getTool("good_fresh_tool")).toBeNull();
      expect(registry.size()).toBe(2);
    } finally {
      discoverSpy.mockRestore();
    }
  });

  it("all connectors fail leaves registry unchanged", async () => {
    dir = mkdtempSync(join(tmpdir(), "c2m-meta-allfail-"));
    cache = new CacheStore(join(dir, "cache.sqlite"));
    registry = new InMemoryToolRegistry();
    const only = defineTool({
      name: "only_tool",
      description: "x",
      connectorName: "x",
      binary: "x",
      command: ["a"],
      args: [],
      skillRefs: [],
      source: "yaml",
      enabled: true,
    });
    registry.replaceAll([only]);
    const conn: ResolvedConnector = {
      name: "x",
      binary: "x",
      enabled: true,
      skills: [],
      skill_root: null,
      working_dir: null,
      discovery: { mode: "manual" },
    };
    const config: LoadedConfig = {
      config: { version: 1, connectors: [], tools: {} },
      configDir: dir,
      connectors: [conn],
      tools: {},
      configHash: "allfail1",
    } as LoadedConfig;
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[conn.name, conn]]),
      log: () => {},
    });
    const discoverSpy = vi.spyOn(DiscoveryEngine.prototype, "discover").mockRejectedValue(new Error("fail"));
    try {
      const res: any = await meta.call("refresh_tools", {});
      expect(res.ok).toBe(false);
      expect(res.note).toBe("old tools retained");
      expect(registry.size()).toBe(1);
      expect(registry.getTool("only_tool")).not.toBeNull();
    } finally {
      discoverSpy.mockRestore();
    }
  });
});

describe("MetaTools.doctor (Phase A extensions)", () => {
  it("parsers.registered includes generic and cobra from the real registry", async () => {
    const { config, connector } = setup();
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[connector.name, connector]]),
      parserRegistry: createDefaultParserRegistry(),
      log: () => {},
    });
    const res: any = await meta.call("doctor", {});
    expect(res.ok).toBe(true);
    const ids = res.parsers.registered.map((p: any) => p.id);
    expect(ids).toContain("generic");
    expect(ids).toContain("cobra");
    // Each entry has at least {id}.
    for (const p of res.parsers.registered) {
      expect(typeof p.id).toBe("string");
    }
  });

  it("reports config_dir and cache.tools_count", async () => {
    const tool = defineTool({
      name: "gh_pr_view",
      description: "v",
      connectorName: "gh",
      binary: "gh",
      command: ["pr", "view"],
      args: [],
      skillRefs: [],
      source: "yaml",
      enabled: true,
    });
    const { config, connector } = setup({ toolsInRegistry: [tool] });
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[connector.name, connector]]),
      parserRegistry: createDefaultParserRegistry(),
      log: () => {},
    });
    const res: any = await meta.call("doctor", {});
    expect(res.config_dir).toBe(dir);
    expect(typeof res.cache.tools_count).toBe("number");
    expect(res.cache.tools_count).toBeGreaterThanOrEqual(1);
  });

  it("a fake parser id '__no_such__' -> parser_resolved false, doctor does NOT crash", async () => {
    const { config } = setup();
    const badConnector: ResolvedConnector = {
      ...config.connectors[0],
      discovery: { mode: "help", parser: "__no_such__" },
    };
    const badConfig: LoadedConfig = {
      ...config,
      connectors: [badConnector],
    } as LoadedConfig;
    const meta = new MetaTools({
      registry,
      cache,
      config: badConfig,
      connectors: new Map([[badConnector.name, badConnector]]),
      parserRegistry: createDefaultParserRegistry(),
      log: () => {},
    });
    const res: any = await meta.call("doctor", {});
    expect(res.ok).toBe(true);
    expect(res.connectors[0].discovery.parser).toBe("__no_such__");
    expect(res.connectors[0].parser_resolved).toBe(false);
    // binary_on_path is always a boolean, never throws.
    expect(typeof res.connectors[0].binary_on_path).toBe("boolean");
  });

  it("tool source counts are consistent with registry contents", async () => {
    const yamlTool = defineTool({
      name: "gh_yaml", description: "y", connectorName: "gh", binary: "gh",
      command: ["a"], args: [], skillRefs: [], source: "yaml", enabled: true,
    });
    const helpTool = defineTool({
      name: "gh_help", description: "h", connectorName: "gh", binary: "gh",
      command: ["b"], args: [], skillRefs: [], source: "help", enabled: true,
    });
    const tmplTool = defineTool({
      name: "gh_tmpl", description: "t", connectorName: "gh", binary: "gh",
      command: ["d"], args: [], skillRefs: [], source: "template", enabled: true,
    });
    const mixedTool = defineTool({
      name: "gh_mix", description: "m", connectorName: "gh", binary: "gh",
      command: ["c"], args: [], skillRefs: [], source: "mixed", enabled: true,
      sources: [
        { kind: "yaml", confidence: 1 },
        { kind: "help", confidence: 0.35 },
      ],
    });
    const { config, connector } = setup();
    registry.replaceAll([yamlTool, helpTool, tmplTool, mixedTool]);
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[connector.name, connector]]),
      parserRegistry: createDefaultParserRegistry(),
      log: () => {},
    });
    const res: any = await meta.call("doctor", {});
    expect(res.connectors[0].tools).toEqual({
      from_yaml: 1,
      from_template: 1,
      from_help: 1,
      mixed: 1,
    });
    expect(res.connectors[0].tool_count).toBe(4);
  });

  it("reports skills with exists flag", async () => {
    const { config } = setup();
    const skillExists = join(dir, "exists.md");
    const skillMissing = join(dir, "missing.md");
    writeFileSync(skillExists, "# skill", "utf8");
    const connWithSkills: ResolvedConnector = {
      ...config.connectors[0],
      skills: [skillExists, skillMissing],
    };
    const configWithSkills: LoadedConfig = {
      ...config,
      connectors: [connWithSkills],
    } as LoadedConfig;
    const meta = new MetaTools({
      registry,
      cache,
      config: configWithSkills,
      connectors: new Map([[connWithSkills.name, connWithSkills]]),
      parserRegistry: createDefaultParserRegistry(),
      log: () => {},
    });
    const res: any = await meta.call("doctor", {});
    const skills = res.connectors[0].skills;
    expect(skills).toHaveLength(2);
    const byPath = Object.fromEntries(skills.map((s: any) => [s.path, s.exists]));
    expect(byPath[skillExists]).toBe(true);
    expect(byPath[skillMissing]).toBe(false);
  });

  it("reports parser_resolved true when parser is unset (default resolves)", async () => {
    const { config, connector } = setup();
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[connector.name, connector]]),
      parserRegistry: createDefaultParserRegistry(),
      log: () => {},
    });
    const res: any = await meta.call("doctor", {});
    expect(res.connectors[0].parser_resolved).toBe(true);
    expect(res.connectors[0].discovery.parser).toBe("generic");
  });

  it("reports empty parsers + note when registry is unavailable", async () => {
    const { config, connector } = setup();
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[connector.name, connector]]),
      // parserRegistry intentionally omitted
      log: () => {},
    });
    const res: any = await meta.call("doctor", {});
    expect(res.parsers.registered).toEqual([]);
    expect(res.parsers.note).toBeDefined();
  });
});

describe("MetaTools.get_skills (Phase C skill_root)", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "c2m-skill-"));
    cache = new CacheStore(join(dir, "cache.sqlite"));
    registry = new InMemoryToolRegistry();
  });

  it("list: true lists one-level files under skill_root", async () => {
    const skillsDir = join(dir, "skills");
    mkdirSync(skillsDir);
    writeFileSync(join(skillsDir, "b.md"), "b", "utf8");
    writeFileSync(join(skillsDir, "a.md"), "a", "utf8");
    mkdirSync(join(skillsDir, "nested"));
    const connector: ResolvedConnector = {
      name: "gh",
      binary: "gh",
      enabled: true,
      skills: [],
      skill_root: skillsDir,
      working_dir: null,
      discovery: { mode: "help" },
    };
    const config: LoadedConfig = {
      config: { version: 1, connectors: [], tools: {} },
      configDir: dir,
      connectors: [connector],
      tools: {},
      configHash: "abc12345",
    } as LoadedConfig;
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[connector.name, connector]]),
      log: () => {},
    });
    const res: any = await meta.call("get_skills", { connector: "gh", list: true });
    expect(res.ok).toBe(true);
    expect(res.files).toEqual(["a.md", "b.md"]);
  });

  it("file reads content under skill_root", async () => {
    const skillsDir = join(dir, "skills");
    mkdirSync(skillsDir);
    writeFileSync(join(skillsDir, "note.md"), "# note body", "utf8");
    const connector: ResolvedConnector = {
      name: "gh",
      binary: "gh",
      enabled: true,
      skills: [],
      skill_root: skillsDir,
      working_dir: null,
      discovery: { mode: "help" },
    };
    const config: LoadedConfig = {
      config: { version: 1, connectors: [], tools: {} },
      configDir: dir,
      connectors: [connector],
      tools: {},
      configHash: "abc12345",
    } as LoadedConfig;
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[connector.name, connector]]),
      log: () => {},
    });
    const res: any = await meta.call("get_skills", { connector: "gh", file: "note.md" });
    expect(res.ok).toBe(true);
    expect(res.content).toContain("note body");
  });

  it("rejects path traversal via file argument", async () => {
    const skillsDir = join(dir, "skills");
    mkdirSync(skillsDir);
    writeFileSync(join(dir, "secret.txt"), "SECRET", "utf8");
    const connector: ResolvedConnector = {
      name: "gh",
      binary: "gh",
      enabled: true,
      skills: [],
      skill_root: skillsDir,
      working_dir: null,
      discovery: { mode: "help" },
    };
    const config: LoadedConfig = {
      config: { version: 1, connectors: [], tools: {} },
      configDir: dir,
      connectors: [connector],
      tools: {},
      configHash: "abc12345",
    } as LoadedConfig;
    const meta = new MetaTools({
      registry,
      cache,
      config,
      connectors: new Map([[connector.name, connector]]),
      log: () => {},
    });
    const res: any = await meta.call("get_skills", {
      connector: "gh",
      file: "../../../secret.txt",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/traversal|escapes|not allowed/i);
  });

  it("list/file without skill_root returns clear error", async () => {
    const { meta } = setup();
    const listRes: any = await meta.call("get_skills", { connector: "gh", list: true });
    expect(listRes.ok).toBe(false);
    expect(listRes.error).toContain("skill_root");
    const fileRes: any = await meta.call("get_skills", { connector: "gh", file: "x.md" });
    expect(fileRes.ok).toBe(false);
    expect(fileRes.error).toContain("skill_root");
  });

  it("legacy skills[] without skill_root still reads via connector", async () => {
    const { meta } = setup({ skills: { "gh.md": "# legacy skill" } });
    const res: any = await meta.call("get_skills", { connector: "gh" });
    expect(res.ok).toBe(true);
    expect(res.skills[0].content).toContain("legacy skill");
  });
});

describe("resolvePathUnderSkillRoot", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "c2m-path-"));
  });

  it("rejects .. segments", () => {
    const root = join(dir, "skills");
    const r = resolvePathUnderSkillRoot(root, "../package.json");
    expect(r.ok).toBe(false);
  });
});
