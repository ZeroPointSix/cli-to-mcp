import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigLoader } from "../src/config/config-loader.js";
import { validateConfig } from "../src/config/schema.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "c2m-cfg-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(name: string, content: string): string {
  const p = join(dir, name);
  writeFileSync(p, content, "utf8");
  return p;
}

describe("validateConfig", () => {
  it("accepts a minimal valid config", () => {
    const cfg = validateConfig({
      version: 1,
      connectors: [{ name: "gh", binary: "gh" }],
    });
    expect(cfg.connectors[0].enabled).toBe(true); // default
    expect(cfg.connectors[0].discovery).toBeUndefined();
  });

  it("rejects wrong version", () => {
    expect(() => validateConfig({ version: 2, connectors: [] })).toThrow(/version/);
  });

  it("rejects missing connectors", () => {
    expect(() => validateConfig({ version: 1 })).toThrow(/connectors/);
  });

  it("rejects connector missing binary", () => {
    expect(() =>
      validateConfig({ version: 1, connectors: [{ name: "x" }] }),
    ).toThrow(/binary/);
  });

  it("rejects connector with empty name", () => {
    expect(() =>
      validateConfig({ version: 1, connectors: [{ name: "", binary: "x" }] }),
    ).toThrow(/name/);
  });

  it("rejects bad arg type", () => {
    expect(() =>
      validateConfig({
        version: 1,
        connectors: [{ name: "x", binary: "x" }],
        tools: {
          x_run: {
            connector: "x",
            command: ["run"],
            args: { q: { type: "bool" } },
          },
        },
      }),
    ).toThrow(/type/);
  });

  it("rejects tool with empty command", () => {
    expect(() =>
      validateConfig({
        version: 1,
        connectors: [{ name: "x", binary: "x" }],
        tools: { x_run: { connector: "x", command: [] } },
      }),
    ).toThrow(/command/);
  });

  it("applies arg defaults", () => {
    const cfg = validateConfig({
      version: 1,
      connectors: [{ name: "x", binary: "x" }],
      tools: {
        x_run: { connector: "x", command: ["run"], args: { q: {} } },
      },
    });
    expect(cfg.tools!.x_run.args!.q.type).toBe("string");
    expect(cfg.tools!.x_run.args!.q.required).toBe(false);
  });

  it("parses env and timeout", () => {
    const cfg = validateConfig({
      version: 1,
      connectors: [
        {
          name: "lark",
          binary: "lark",
          default_timeout_seconds: 45,
          env: { LARK_PROFILE: "default" },
        },
      ],
    });
    expect(cfg.connectors[0].default_timeout_seconds).toBe(45);
    expect(cfg.connectors[0].env).toEqual({ LARK_PROFILE: "default" });
  });

  it("parses discovery block", () => {
    const cfg = validateConfig({
      version: 1,
      connectors: [
        {
          name: "gh",
          binary: "gh",
          discovery: { mode: "help", max_depth: 3, parser: "cobra" },
        },
      ],
    });
    expect(cfg.connectors[0].discovery).toEqual({
      mode: "help",
      max_depth: 3,
      parser: "cobra",
    });
  });
});

describe("ConfigLoader.load", () => {
  it("loads a full valid YAML file", () => {
    const p = writeConfig(
      "cli-to-mcp.yaml",
      `
version: 1
connectors:
  - name: gh
    binary: gh
    enabled: true
    default_timeout_seconds: 30
    working_dir: ./repo
    env:
      GH_TOKEN: abc
    discovery:
      mode: help
      max_depth: 3
      parser: cobra
    skills:
      - ./skills/gh.md
tools:
  gh_pr_view:
    enabled: true
    connector: gh
    command: ["pr", "view"]
    description: View a pull request
    args:
      number:
        type: integer
        required: true
      json:
        type: string
        default: "number,title"
    output:
      format: json
    skills:
      - ./skills/gh-pr.md
`,
    );
    const loaded = new ConfigLoader().load(p);
    expect(loaded.config.version).toBe(1);
    expect(loaded.connectors[0].name).toBe("gh");
    expect(loaded.connectors[0].enabled).toBe(true);
    expect(loaded.connectors[0].working_dir).toBe(join(dir, "repo"));
    expect(loaded.connectors[0].skills).toEqual([join(dir, "skills/gh.md")]);
    expect(loaded.connectors[0].skill_root).toBeNull();
    expect(loaded.connectors[0].discovery.parser).toBe("cobra");
    expect(loaded.tools.gh_pr_view.command).toEqual(["pr", "view"]);
    expect(loaded.tools.gh_pr_view.args!.number.required).toBe(true);
    expect(loaded.tools.gh_pr_view.output!.format).toBe("json");
    expect(loaded.tools.gh_pr_view.skills).toEqual([join(dir, "skills/gh-pr.md")]);
    expect(loaded.configHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("config hash is stable for identical content", () => {
    const content = "version: 1\nconnectors:\n  - name: x\n    binary: x\n";
    const p1 = writeConfig("a.yaml", content);
    const p2 = writeConfig("b.yaml", content);
    const loader = new ConfigLoader();
    expect(loader.load(p1).configHash).toBe(loader.load(p2).configHash);
  });

  it("resolves skill_root relative to config dir", () => {
    const p = writeConfig(
      "skill-root.yaml",
      `
version: 1
connectors:
  - name: gh
    binary: gh
    skill_root: ./skills
`,
    );
    const loaded = new ConfigLoader().load(p);
    expect(loaded.connectors[0].skill_root).toBe(join(dir, "skills"));
  });

  it("resolves parser_module relative to config dir", () => {
    const p = writeConfig(
      "c.yaml",
      `
version: 1
connectors:
  - name: x
    binary: x
    discovery:
      parser_module: ./parsers/my.ts
`,
    );
    const loaded = new ConfigLoader().load(p);
    expect(loaded.connectors[0].discovery.parser_module).toBe(join(dir, "parsers/my.ts"));
  });

  it("throws on missing file", () => {
    expect(() => new ConfigLoader().load(join(dir, "nope.yaml"))).toThrow();
  });

  it("throws on malformed YAML with clear message", () => {
    const p = writeConfig(
      "bad.yaml",
      `
version: 1
connectors:
  - name: x
    binary: x
tools:
  x_run:
    connector: y
    command: ["run"]
    args:
      q:
        type: not-a-real-type
`,
    );
    expect(() => new ConfigLoader().load(p)).toThrow(/type/);
  });
});
