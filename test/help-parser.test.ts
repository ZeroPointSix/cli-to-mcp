import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { genericPlugin } from "../src/discovery/plugins/generic.js";
import { cobraPlugin } from "../src/discovery/plugins/cobra.js";
import { HelpParserRegistry, type HelpParserContext } from "../src/discovery/parser-registry.js";
import { runHelp } from "../src/discovery/help-runner.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`./fixtures/help/${name}`, import.meta.url)),
    "utf8",
  );
}

function ctx(raw: string, opts: Partial<HelpParserContext> = {}): HelpParserContext {
  return {
    connectorName: opts.connectorName ?? "gh",
    binary: opts.binary ?? "gh",
    path: opts.path ?? [],
    rawHelp: raw,
    exitCode: 0,
  };
}

describe("genericPlugin", () => {
  it("extracts subcommands from Commands: section", () => {
    const cmd = genericPlugin.parse(ctx(fixture("generic-demo.txt"), { connectorName: "demo", binary: "demo" }));
    expect(cmd.subcommands).toEqual(expect.arrayContaining(["run", "list", "status"]));
  });

  it("extracts options and infers types", () => {
    const cmd = genericPlugin.parse(ctx(fixture("generic-demo.txt"), { connectorName: "demo", binary: "demo" }));
    const names = cmd.args.map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(["name", "count", "verbose"]));
    const count = cmd.args.find((a) => a.name === "count")!;
    expect(count.inferredType).toBe("integer");
    expect(count.kind).toBe("option");
    const verbose = cmd.args.find((a) => a.name === "verbose")!;
    expect(verbose.inferredType).toBe("boolean");
    expect(verbose.kind).toBe("flag");
  });

  it("filters out -h / --help so they never enter inputSchema", () => {
    const cmd = genericPlugin.parse(ctx(fixture("generic-demo.txt"), { connectorName: "demo", binary: "demo" }));
    expect(cmd.args.find((a) => a.name === "help")).toBeUndefined();
  });

  it("preserves rawHelp", () => {
    const raw = fixture("generic-demo.txt");
    const cmd = genericPlugin.parse(ctx(raw, { connectorName: "demo", binary: "demo" }));
    expect(cmd.rawHelp).toBe(raw);
  });

  it("captures description from top of help", () => {
    const cmd = genericPlugin.parse(ctx(fixture("generic-demo.txt"), { connectorName: "demo", binary: "demo" }));
    expect(cmd.description).toMatch(/simple CLI tool/i);
  });

  it("falls back gracefully on unrecognizable input (empty result, rawHelp kept)", () => {
    const cmd = genericPlugin.parse(ctx("totally unstructured text\nno sections here", {}));
    expect(cmd.subcommands).toEqual([]);
    expect(cmd.args).toEqual([]);
    expect(cmd.rawHelp).toContain("totally unstructured");
  });
});

describe("cobraPlugin", () => {
  it("matches gh root help with high score", () => {
    const score = cobraPlugin.match(ctx(fixture("gh-root.txt")));
    expect(score).toBeGreaterThan(0);
  });

  it("parses gh root: CORE COMMANDS subcommands", () => {
    const cmd = cobraPlugin.parse(ctx(fixture("gh-root.txt")));
    expect(cmd.subcommands).toEqual(expect.arrayContaining(["auth", "pr", "issue", "repo"]));
  });

  it("parses gh pr view: flags, filters --help", () => {
    const cmd = cobraPlugin.parse(
      ctx(fixture("gh-pr-view.txt"), { path: ["pr", "view"] }),
    );
    const names = cmd.args.map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(["number", "json", "comments"]));
    expect(names).not.toContain("help");
    const number = cmd.args.find((a) => a.name === "number")!;
    expect(number.inferredType).toBe("integer");
  });

  it("does not match unrelated help (score 0)", () => {
    expect(
      cobraPlugin.match(ctx("random text\nno cobra markers", { connectorName: "demo", binary: "demo" })),
    ).toBe(0);
  });
});

describe("HelpParserRegistry", () => {
  it("selects cobra by explicit id", () => {
    const reg = new HelpParserRegistry();
    reg.register(genericPlugin);
    reg.register(cobraPlugin);
    const cmd = reg.parse(ctx(fixture("gh-root.txt")), "cobra");
    expect(cmd.subcommands).toEqual(expect.arrayContaining(["pr", "issue"]));
  });

  it("falls back to generic when no explicit id and no match", () => {
    const reg = new HelpParserRegistry();
    reg.register(cobraPlugin);
    reg.register(genericPlugin);
    const cmd = reg.parse(ctx("random text with no markers"));
    // generic.match returns 1, cobra returns 0 -> generic wins
    expect(cmd.subcommands).toEqual([]);
  });

  it("cobra wins by match score over generic for gh help", () => {
    const reg = new HelpParserRegistry();
    reg.register(genericPlugin); // score 1 always
    reg.register(cobraPlugin); // score 80 for gh
    const cmd = reg.parse(ctx(fixture("gh-root.txt")));
    expect(cmd.subcommands).toEqual(expect.arrayContaining(["auth", "pr", "issue", "repo"]));
  });

  it("plugin parse failure falls back to rawHelp-preserving command", () => {
    const reg = new HelpParserRegistry();
    reg.register({
      id: "broken",
      displayName: "broken",
      match: () => 100,
      parse: () => {
        throw new Error("boom");
      },
    });
    reg.register(genericPlugin);
    const cmd = reg.parse(ctx(fixture("gh-root.txt")));
    // broken threw -> registry caught -> returned minimal command with rawHelp
    expect(cmd.rawHelp).toContain("GitHub");
  });
});

describe("runHelp", () => {
  it("runs binary --help and returns stdout", async () => {
    // Use node itself to print a stable help text.
    const out = await runHelp(process.execPath, ["-e", "console.log('Usage: node [options]')"], {
      timeoutMs: 5000,
    });
    expect(out.exitCode).toBe(0);
    expect(out.rawHelp).toContain("Usage: node");
    expect(out.source).toBe("stdout");
  });

  it("returns empty rawHelp when binary missing", async () => {
    // Use a path-shaped name so Windows does not route through cmd.exe (which prints errors to stdout).
    const out = await runHelp("C:/definitely-not-a-real-binary-xyz.exe", []);
    expect(out.rawHelp).toBe("");
  });
});
