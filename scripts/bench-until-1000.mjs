/**
 * 实测：冷启动 → serve → 等待 background discovery 结束 → 统计工具数（目标 1000+）
 *
 * Usage:
 *   npm run build
 *   node scripts/bench-until-1000.mjs                    # mega gh+az
 *   node scripts/bench-until-1000.mjs --az-only          # 仅 az 全量 depth=3（更易冲 1000+）
 *   node scripts/bench-until-1000.mjs --keep-cache ./tmp # 保留 cache 便于二次加速
 */
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { startRuntime } = await import(pathToFileURL(join(root, "dist/cli/runtime.js")).href);

const args = process.argv.slice(2);
const azOnly = args.includes("--az-only");
const keepIdx = args.indexOf("--keep-cache");
const keepDir = keepIdx >= 0 ? args[keepIdx + 1] : null;

const baseDir = keepDir ?? mkdtempSync(join(tmpdir(), "c2m-1k-"));
if (keepDir) mkdirSync(keepDir, { recursive: true });

let cfgPath;
if (azOnly) {
  cfgPath = join(baseDir, "az-only.yaml");
  writeFileSync(
    cfgPath,
    `version: 1
runtime:
  max_inflight_help_spawns: 24
  parallel_connector_discovery: true
connectors:
  - name: az
    binary: az
    enabled: true
    help_timeout_seconds: 20
    env:
      AZURE_CORE_COLLECT_TELEMETRY: "false"
      AZURE_CORE_DISABLE_TELEMETRY: "true"
    discovery:
      mode: help
      parser: generic
      max_depth: 3
      concurrency: 24
      startup_budget_seconds: 300
      background_continue_discovery: true
      bfs_preference: shallow_first
      help_argv: ["-h"]
      exposure_mode: lazy
      materialize_global_args: false
`,
  );
} else {
  cfgPath = join(root, "examples/mega/cli-to-mcp.yaml");
}

const cachePath = join(baseDir, "cache.sqlite");
const GOAL = 1000;
const BG_MAX_MS = Number(process.env.BENCH_BG_MAX_MS ?? 3_600_000);

function countByConnector(registry) {
  const by = {};
  for (const t of registry.listTools()) {
    by[t.connectorName] = (by[t.connectorName] ?? 0) + 1;
  }
  return by;
}

const t0 = Date.now();
const rt = await startRuntime({
  host: "127.0.0.1",
  port: 29002,
  config: cfgPath,
  cachePath,
  log: (m) => {
    if (
      m.includes("background discovery") ||
      m.includes("cold start total") ||
      m.includes("hard_wall") ||
      m.includes("leaf_tools=") ||
      m.includes("finished registry_size")
    ) {
      process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}\n`);
    }
  },
});

const coldMs = Date.now() - t0;
const coldTotal = rt.registry.size();
const coldBy = countByConnector(rt.registry);
console.log(`\n--- phase 1: serve ready ---`);
console.log(`cold_time: ${(coldMs / 1000).toFixed(1)}s tools=${coldTotal} by=${JSON.stringify(coldBy)}`);

let finalTotal = coldTotal;
let bgMs = 0;

if (rt.backgroundDiscovery) {
  console.log(`\n--- phase 2: waiting background (max ${(BG_MAX_MS / 60000).toFixed(0)} min) ---`);
  const poll = setInterval(() => {
    const st = rt.backgroundDiscoveryStatus();
    const n = rt.registry.size();
    process.stderr.write(
      `[poll] registry=${n} bg_running=${st?.running ?? "?"} connectors=${JSON.stringify(st?.connectors ?? [])}\n`,
    );
  }, 60_000);

  const bgTimeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error(`background timeout after ${BG_MAX_MS}ms`)), BG_MAX_MS),
  );
  try {
    await Promise.race([rt.backgroundDiscovery.done, bgTimeout]);
  } catch (e) {
    console.error(String(e));
    console.error("waiting up to 120s for in-flight discovery to finish and merge...");
    await Promise.race([rt.backgroundDiscovery.done, new Promise((r) => setTimeout(r, 120_000))]);
  } finally {
    clearInterval(poll);
  }
  bgMs = Date.now() - t0 - coldMs;
  finalTotal = rt.registry.size();
} else {
  console.log("(no background discovery — cache hit or budget not configured)");
}

const finalBy = countByConnector(rt.registry);
await rt.stop();

const totalMs = Date.now() - t0;
const hit1k = finalTotal >= GOAL;

console.log(`\n=== bench until ${GOAL}+ tools ===`);
console.log(`mode: ${azOnly ? "az-only" : "mega gh+az"}`);
console.log(`total_time: ${(totalMs / 60000).toFixed(1)} min (${(totalMs / 1000).toFixed(0)}s)`);
console.log(`tools_final: ${finalTotal} by_connector=${JSON.stringify(finalBy)}`);
console.log(`goal >=${GOAL}: ${hit1k ? "PASS" : "FAIL"} (gap=${GOAL - finalTotal})`);
console.log(`cache: ${cachePath}`);

if (!keepDir) {
  try {
    rmSync(baseDir, { recursive: true, force: true });
  } catch {
    /* win file lock */
  }
} else {
  console.log(`kept workdir: ${baseDir}`);
}

process.exit(hit1k ? 0 : 1);