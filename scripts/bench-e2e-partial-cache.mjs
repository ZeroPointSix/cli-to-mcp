/**
 * 模拟冷启只填满部分 help_cache：删 85% help_cache + 清空 tools → 冷启偏少 → 后台补全并 merge>=1000
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

const srcDir = process.argv.includes("--cache-dir")
  ? process.argv[process.argv.indexOf("--cache-dir") + 1]
  : join(root, ".bench-az-1k");
const workDir = join(root, ".bench-e2e-partial");
mkdirSync(workDir, { recursive: true });
const cachePath = join(workDir, "cache.sqlite");
const cfgPath = join(workDir, "az-only.yaml");

if (!existsSync(join(srcDir, "cache.sqlite"))) {
  console.error("missing source cache", srcDir);
  process.exit(2);
}
copyFileSync(join(srcDir, "cache.sqlite"), cachePath);
copyFileSync(join(srcDir, "az-only.yaml"), cfgPath);

const { ConfigLoader } = await import(pathToFileURL(join(root, "dist/config/config-loader.js")).href);
const hash = new ConfigLoader().load(cfgPath).configHash;

const db = new DatabaseSync(cachePath);
const rows = db.prepare("SELECT rowid FROM help_cache WHERE connector_name = 'az'").all();
const keep = new Set();
for (const r of rows) {
  if (Math.random() < 0.15) keep.add(r.rowid);
}
const del = rows.filter((r) => !keep.has(r.rowid));
for (const r of del) {
  db.prepare("DELETE FROM help_cache WHERE rowid = ?").run(r.rowid);
}
db.prepare("DELETE FROM tools WHERE config_hash = ?").run(hash);
const left = db.prepare("SELECT COUNT(*) AS n FROM help_cache WHERE connector_name = 'az'").get().n;
db.close();
console.log(`prep: help_cache kept=${left}/${rows.length} tools cleared`);

const { startRuntime } = await import(pathToFileURL(join(root, "dist/cli/runtime.js")).href);
const GOAL = 1000;
const t0 = Date.now();
const rt = await startRuntime({
  host: "127.0.0.1",
  port: 29004,
  config: cfgPath,
  cachePath,
  log: (m) => {
    if (/background|cold start|hard_wall|leaf_tools=|merged registry|finished registry/.test(m)) {
      process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}\n`);
    }
  },
});

const coldN = rt.registry.size();
console.log(`phase1: ${((Date.now() - t0) / 1000).toFixed(1)}s cold_registry=${coldN}`);

if (!rt.backgroundDiscovery) {
  console.error("no background task");
  await rt.stop();
  process.exit(1);
}

const BG_MAX = Number(process.env.BENCH_BG_MAX_MS ?? 7_200_000);
await Promise.race([
  rt.backgroundDiscovery.done,
  new Promise((_, rej) => setTimeout(() => rej(new Error("bg timeout")), BG_MAX)),
]).catch(async (e) => {
  console.error(e.message);
  await Promise.race([rt.backgroundDiscovery.done, new Promise((r) => setTimeout(r, 180_000))]);
});

const finalN = rt.registry.size();
await rt.stop();
const pass = finalN >= GOAL && coldN < GOAL;
console.log(`\n=== partial cache E2E ===`);
console.log(`cold=${coldN} final=${finalN} cold<${GOAL} && final>=${GOAL}: ${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);