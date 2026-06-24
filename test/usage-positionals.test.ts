import { describe, it, expect } from "vitest";
import { positionalsFromUsage } from "../src/builder/usage-positionals.js";
import { toolFromDiscovered } from "../src/builder/tool-from-discovered.js";
import { buildArgv } from "../src/executor/command-executor.js";
import { applyDescriptionHints } from "../src/builder/infer-annotations.js";
import type { DiscoveredCommand } from "../src/discovery/types.js";
import type { ResolvedConnector } from "../src/config/config-loader.js";

describe("positionalsFromUsage", () => {
  it("parses required and optional placeholders before [flags]", () => {
    const args = positionalsFromUsage("lark-cli api <method> <path> [flags]");
    expect(args.map((a) => a.name)).toEqual(["method", "path"]);
    expect(args[0].kind).toBe("positional");
    expect(args[0].required).toBe(true);
    expect(args[0].position).toBe(0);
  });

  it("parses gh-style optional positional", () => {
    const args = positionalsFromUsage("gh pr view [<number> | <url> | <branch>] [flags]");
    expect(args.some((a) => a.name === "number")).toBe(true);
    expect(args.find((a) => a.name === "number")!.required).toBe(false);
  });
});

describe("toolFromDiscovered positionals + argv", () => {
  const connector: ResolvedConnector = {
    name: "lark",
    binary: "lark-cli",
    enabled: true,
    skills: [],
    skill_root: null,
    working_dir: null,
    discovery: { mode: "help" },
  };

  it("materializes usage positionals and builds bare argv tokens", () => {
    const cmd: DiscoveredCommand = {
      connectorName: "lark",
      path: ["api"],
      rawHelp: "",
      usage: "lark-cli api <method> <path> [flags]",
      description: "Call Open API. Risk: write Identity: bot only",
      args: [],
      subcommands: [],
    };
    const tool = toolFromDiscovered(cmd, connector)!;
    expect(tool.args.map((a) => a.name)).toEqual(["method", "path"]);
    expect(tool.args[0].kind).toBe("positional");
    expect(tool.annotations?.destructiveHint).toBe(true);
    expect(tool.mcpMeta?.["cli-to-mcp/identity"]).toBe("bot only");
    expect(tool.description).not.toMatch(/Risk:/);

    const argv = buildArgv(tool, { method: "GET", path: "/open-apis/foo" });
    expect(argv).toEqual(["lark-cli", "api", "GET", "/open-apis/foo"]);
  });
});

describe("applyDescriptionHints", () => {
  it("maps Risk: read to readOnlyHint", () => {
    const r = applyDescriptionHints("List items. Risk: read");
    expect(r.annotations?.readOnlyHint).toBe(true);
    expect(r.description).toBe("List items.");
  });
});