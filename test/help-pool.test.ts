import { describe, expect, it } from "vitest";
import { scanHelpTree } from "../src/discovery/help-discovery.js";
import { HelpParserRegistry } from "../src/discovery/parser-registry.js";
import type { ResolvedConnector } from "../src/config/config-loader.js";

describe("help worker pool concurrency", () => {
  it("runs at least 4 overlapping fetches when concurrency=8", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const reg = new HelpParserRegistry();
    reg.register({
      id: "t",
      displayName: "t",
      match: () => 100,
      parse(ctx) {
        const n = ctx.path.length;
        const subs =
          n === 0
            ? ["a", "b", "c", "d", "e", "f", "g", "h"]
            : n === 1
              ? ["x"]
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
      discovery: { mode: "help", max_depth: 2, concurrency: 8 },
    };
    await scanHelpTree({
      connector: conn,
      maxDepth: 2,
      helpTimeoutMs: 5000,
      concurrency: 8,
      parserRegistry: reg,
      log: () => {},
      runHelpFn: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 40));
        inFlight--;
        return { rawHelp: "h", exitCode: 0, source: "stdout", timedOut: false };
      },
    });
    expect(maxInFlight).toBeGreaterThanOrEqual(4);
  });
});