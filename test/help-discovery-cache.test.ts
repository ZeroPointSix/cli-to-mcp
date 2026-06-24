import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanHelpTree } from "../src/discovery/help-discovery.js";
import { HelpParserRegistry } from "../src/discovery/parser-registry.js";
import type { ResolvedConnector } from "../src/config/config-loader.js";
import { CacheStore } from "../src/cache/db.js";

function conn(): ResolvedConnector {
  return {
    name: "az",
    binary: "az",
    enabled: true,
    default_timeout_seconds: 10,
    working_dir: null,
    skills: [],
    skill_root: null,
    discovery: { mode: "help", max_depth: 2, concurrency: 4 },
  };
}

describe("help discovery cache + worker pool", () => {
  it("second scan does not spawn when cache is warm", async () => {
    const dir = mkdtempSync(join(tmpdir(), "c2m-hc-"));
    const dbPath = join(dir, "c.sqlite");
    const cache = new CacheStore(dbPath);
    let spawns = 0;
    const reg = new HelpParserRegistry();
    reg.register({
      id: "t",
      displayName: "t",
      match: () => 100,
      parse(ctx) {
        const subs = ctx.path.length === 0 ? ["a"] : [];
        return {
          connectorName: ctx.connectorName,
          path: ctx.path,
          rawHelp: ctx.rawHelp,
          args: [],
          subcommands: subs,
        };
      },
    });
    const runHelpFn = async () => {
      spawns++;
      return { rawHelp: "h", exitCode: 0, source: "stdout" as const, timedOut: false };
    };
    const base = {
      connector: conn(),
      maxDepth: 1,
      helpTimeoutMs: 5000,
      concurrency: 8,
      parserRegistry: reg,
      log: () => {},
      cache,
      runHelpFn,
    };
    await scanHelpTree(base);
    expect(spawns).toBe(2);
    spawns = 0;
    await scanHelpTree(base);
    expect(spawns).toBe(0);
    cache.close();
    rmSync(dir, { recursive: true, force: true });
  });
});