import { describe, expect, it } from "vitest";
import { scanHelpTree } from "../src/discovery/help-discovery.js";
import { HelpParserRegistry } from "../src/discovery/parser-registry.js";
import type { ResolvedConnector } from "../src/config/config-loader.js";

describe("startup budget", () => {
  it("stops dequeuing within budget + one in-flight wave", async () => {
    let spawns = 0;
    const reg = new HelpParserRegistry();
    reg.register({
      id: "t",
      displayName: "t",
      match: () => 100,
      parse(ctx) {
        const subs =
          ctx.path.length === 0
            ? Array.from({ length: 200 }, (_, i) => `s${i}`)
            : ctx.path.length === 1
              ? ["leaf"]
              : [];
        return {
          connectorName: ctx.connectorName,
          path: ctx.path,
          rawHelp: ctx.rawHelp,
          args: [],
          subcommands: subs,
        };
      },
    });
    const conn: ResolvedConnector = {
      name: "c",
      binary: "c",
      enabled: true,
      working_dir: null,
      skills: [],
      skill_root: null,
      discovery: { mode: "help", max_depth: 3, concurrency: 8 },
    };
    const t0 = Date.now();
    const nodes = await scanHelpTree({
      connector: conn,
      maxDepth: 3,
      helpTimeoutMs: 60_000,
      concurrency: 8,
      parserRegistry: reg,
      log: () => {},
      startupBudgetMs: 500,
      runHelpFn: async () => {
        spawns++;
        await new Promise((r) => setTimeout(r, 80));
        return { rawHelp: "h", exitCode: 0, source: "stdout", timedOut: false };
      },
    });
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(3500);
    expect(spawns).toBeLessThan(120);
    expect(nodes.length).toBeGreaterThan(0);
  });
});