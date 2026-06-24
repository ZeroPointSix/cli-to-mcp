/**
 * 在已有 help_cache（可部分）上清空 tools，冷启+后台续扫，等待 registry>=1000
 * Usage: node scripts/resume-bg-merge.mjs --cache-dir ./.bench-e2e-partial
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

const idx = process.argv.indexOf("--cache-dir");
const cacheDir = idx >= 0 ? process.argv[idx + 1] : join(root, ".bench-e2e-partial");
const cachePath = join(cacheDir, "cache.sqlite");
const cfgPath = join(cacheDir, "az-only.yaml");

const { ConfigLoader } = await import(pathToFileURL(join(root, "dist/config/config-loader.js")).href);
const hash = new ConfigLoader().load(cfgPath).configHash;

const db = new DatabaseSync(cachePath);
const hc = db.prepare("SELECT COUNT(*) AS n FROM help_cache WHERE connector_name='az'").get().n;
db.prepare("DELETE FROM tools WHERE config_hash = ?").run(hash);
db.close();
console.log(`resume: help_cache=${hc} tools cleared`);

const { startRuntime } = await import(pathToFileURL(join(root, "dist/cli/runtime.js")).href);
const GOAL = 1000;
const BG_MAX = Number(process.env.BENCH_BG_MAX_MS ?? 7_200_000);
const t0 = Date.now();

const rt = await startRuntime({
  host: "127.0.0.1",
  port: 29005,
  config: cfgPath,
  cachePath,
  log: (m) => {
    if (/background|cold start|hard_wall|leaf_tools=|merged registry|finished registry|discovery summary/.test(m)) {
      process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}\n`);
    }
  },
});

const coldN = rt.registry.size();
console.log(`phase1 cold_registry=${coldN} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

if (!rt.backgroundDiscovery) {
  console.log(`no bg (registry already full?) final=${coldN}`);
  await rt.stop();
  process.exit(coldN >= GOAL ? 0 : 1);
}

const poll = setInterval(() => {
  process.stderr.write(`[poll ${((Date.now() - t0) / 60_000).toFixed(1)}m] registry=${rt.registry.size()}\n`);
}, 120_000);

try {
  await Promise.race([
    rt.backgroundDiscovery.done,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), BG_MAX)),
  ]);
} catch (e) {
  console.error(e.message);
  await Promise.race([rt.backgroundDiscovery.done, new Promise((r) => setTimeout(r, 300_000))]);
} finally {
  clearInterval(poll);
}

const finalN = rt.registry.size();
const st = rt.backgroundDiscoveryStatus();
await rt.stop();

console.log(`\nfinal_registry=${finalN} cold_was=${coldN} bg_error=${st?.last_error ?? "null"}`);
console.log(`goal>=${GOAL}: ${finalN >= GOAL ? "PASS" : "FAIL"}`);
process.exit(finalN >= GOAL ? 0 : 1);