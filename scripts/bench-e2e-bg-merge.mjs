/**
 * E2E：有满 help_cache、无 tools 行 → 冷启(预算) → 后台全缓存扫树 → registry>=1000
 *
 * Usage:
 *   npm run build
 *   node scripts/bench-e2e-bg-merge.mjs --cache-dir ./.bench-az-1k
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

const idx = process.argv.indexOf("--cache-dir");
const cacheDir = idx >= 0 ? process.argv[idx + 1] : join(root, ".bench-az-1k");
const cachePath = join(cacheDir, "cache.sqlite");
const cfgPath = join(cacheDir, "az-only.yaml");

if (!existsSync(cachePath) || !existsSync(cfgPath)) {
  console.error("need cache.sqlite + az-only.yaml in", cacheDir);
  process.exit(2);
}

const { ConfigLoader } = await import(pathToFileURL(join(root, "dist/config/config-loader.js")).href);
const { CacheStore } = await import(pathToFileURL(join(root, "dist/cache/db.js")).href);
const { startRuntime } = await import(pathToFileURL(join(root, "dist/cli/runtime.js")).href);

const config = new ConfigLoader().load(cfgPath);
const hash = config.configHash;

const db = new DatabaseSync(cachePath);
const beforeTools = db.prepare("SELECT COUNT(*) AS n FROM tools WHERE config_hash = ?").get(hash)?.n ?? 0;
const helpPages = db.prepare("SELECT COUNT(*) AS n FROM help_cache WHERE connector_name = 'az'").get()?.n ?? 0;
db.prepare("DELETE FROM tools WHERE config_hash = ?").run(hash);
const afterDel = db.prepare("SELECT COUNT(*) AS n FROM tools WHERE config_hash = ?").get(hash)?.n ?? 0;
db.close();

console.log(`prep: help_cache_pages=${helpPages} tools_before=${beforeTools} tools_after_delete=${afterDel} config_hash=${hash.slice(0, 12)}…`);

const GOAL = 1000;
const BG_MAX_MS = Number(process.env.BENCH_BG_MAX_MS ?? 900_000);
const t0 = Date.now();

const rt = await startRuntime({
  host: "127.0.0.1",
  port: 29003,
  config: cfgPath,
  cachePath,
  log: (m) => {
    if (
      /background discovery|cold start total|hard_wall|leaf_tools=|merged registry|finished registry/.test(m)
    ) {
      process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}\n`);
    }
  },
});

const coldMs = Date.now() - t0;
const coldN = rt.registry.size();
console.log(`\nphase1 serve: ${(coldMs / 1000).toFixed(1)}s registry=${coldN}`);

if (!rt.backgroundDiscovery) {
  console.error("FAIL: no background discovery (expected cold discovery + budget config)");
  await rt.stop();
  process.exit(1);
}

console.log(`phase2: wait background (max ${(BG_MAX_MS / 60_000).toFixed(0)} min)`);
const poll = setInterval(() => {
  const st = rt.backgroundDiscoveryStatus();
  process.stderr.write(`[poll] registry=${rt.registry.size()} running=${st?.running}\n`);
}, 15_000);

try {
  await Promise.race([
    rt.backgroundDiscovery.done,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${BG_MAX_MS}ms`)), BG_MAX_MS)),
  ]);
} catch (e) {
  console.error(String(e));
  await Promise.race([rt.backgroundDiscovery.done, new Promise((r) => setTimeout(r, 120_000))]);
} finally {
  clearInterval(poll);
}

const finalN = rt.registry.size();
const st = rt.backgroundDiscoveryStatus();
await rt.stop();

const totalS = ((Date.now() - t0) / 1000).toFixed(0);
const pass = finalN >= GOAL;
console.log(`\n=== E2E background merge ===`);
console.log(`total_s=${totalS} cold_registry=${coldN} final_registry=${finalN}`);
console.log(`bg_finished=${st?.finished_at ?? "?"} last_error=${st?.last_error ?? "null"}`);
console.log(`goal>=${GOAL}: ${pass ? "PASS" : "FAIL"}`);

process.exit(pass ? 0 : 1);