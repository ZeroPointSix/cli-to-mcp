import { describe, expect, it } from "vitest";
import { discoverConnectorsParallel } from "../src/cli/discovery-runner.js";
import { DiscoveryEngine } from "../src/discovery/discovery-engine.js";
import { YamlSource } from "../src/discovery/sources.js";
import type { LoadedConfig, ResolvedConnector } from "../src/config/config-loader.js";
import { CacheStore } from "../src/cache/db.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function mkConn(name: string): ResolvedConnector {
  return {
    name,
    binary: name,
    enabled: true,
    working_dir: null,
    skills: [],
    skill_root: null,
    discovery: { mode: "manual" },
  };
}

describe("parallel connector discovery", () => {
  it("discovers two connectors concurrently", async () => {
    const delays: string[] = [];
    const engine = new DiscoveryEngine([
      {
        kind: "yaml",
        async discover(conn) {
          const ms = conn.name === "slow" ? 80 : 10;
          await new Promise((r) => setTimeout(r, ms));
          delays.push(conn.name);
          return [];
        },
      } as unknown as YamlSource,
    ]);
    const config = {
      config: { version: 1 as const, connectors: [], runtime: { parallel_connector_discovery: true } },
      runtime: { parallel_connector_discovery: true },
      configDir: ".",
      parserModules: [],
      connectors: [mkConn("fast"), mkConn("slow")],
      tools: {},
      configHash: "x",
    } as LoadedConfig;
    const dir = mkdtempSync(join(tmpdir(), "c2m-pd-"));
    const cache = new CacheStore(join(dir, "c.sqlite"));
    const t0 = Date.now();
    const map = await discoverConnectorsParallel(engine, config, () => {}, cache);
    const ms = Date.now() - t0;
    cache.close();
    rmSync(dir, { recursive: true, force: true });
    expect(map.size).toBe(2);
    expect(ms).toBeLessThan(150);
  });
});