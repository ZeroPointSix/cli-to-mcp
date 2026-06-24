/**
 * 利用已有 help_cache 快速重建 tools（无需再跑 2h az -h）。
 * 适用：bench-until-1000 后台扫完 help 但未 merge 的旧 cache。
 *
 * Usage: node scripts/rebuild-tools-from-cache.mjs --cache-dir ./.bench-az-1k
 */
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const cacheDir = process.argv.includes("--cache-dir")
  ? process.argv[process.argv.indexOf("--cache-dir") + 1]
  : join(root, ".bench-az-1k");

const cfgPath = join(cacheDir, "az-only.yaml");
const cachePath = join(cacheDir, "cache.sqlite");
if (!existsSync(cachePath)) {
  console.error("missing cache:", cachePath);
  process.exit(1);
}

const { ConfigLoader } = await import(pathToFileURL(join(root, "dist/config/config-loader.js")).href);
const { CacheStore } = await import(pathToFileURL(join(root, "dist/cache/db.js")).href);
const { buildDiscoveryEngine } = await import(pathToFileURL(join(root, "dist/discovery/engine-factory.js")).href);
const { HelpSpawnGate } = await import(pathToFileURL(join(root, "dist/discovery/help-spawn-gate.js")).href);
const {
  discoverOneConnector,
  connectorWithoutStartupBudget,
  mergeToolsByConnector,
} = await import(pathToFileURL(join(root, "dist/cli/discovery-runner.js")).href);

const config = new ConfigLoader().load(cfgPath);
const cache = new CacheStore(cachePath);
const gate = new HelpSpawnGate(24);
const { engine } = await buildDiscoveryEngine(config, {
  log: (m) => process.stderr.write(`${m}\n`),
  cache,
  helpSpawnGate: gate,
});

const conn = config.connectors.find((c) => c.name === "az" && c.enabled);
if (!conn) throw new Error("no az connector");

const t0 = Date.now();
const discovered = await discoverOneConnector(
  engine,
  connectorWithoutStartupBudget(conn),
  config,
  (m) => process.stderr.write(`${m}\n`),
  cache,
);
const merged = mergeToolsByConnector(config, new Map([["az", discovered]]));
cache.replaceTools(config.configHash, merged);
cache.close();

console.log(`\nrebuild done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`tools=${merged.length} goal>=1000: ${merged.length >= 1000 ? "PASS" : "FAIL"}`);
process.exit(merged.length >= 1000 ? 0 : 1);