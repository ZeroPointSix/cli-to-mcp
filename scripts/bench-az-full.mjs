/**
 * 全量 az 冷/热缓存发现耗时与工具数。
 * Usage: node scripts/bench-az-full.mjs [config] [--warm]
 */
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const config =
  process.argv.find((a) => a.endsWith(".yaml")) ||
  join(__dir, "demo-config-az-full-bench.yaml");
const warm = process.argv.includes("--warm");
const keepDir = process.env.C2M_BENCH_DIR;

let dir = keepDir || mkdtempSync(join(tmpdir(), "c2m-az-full-"));
const cachePath = join(dir, "cache.sqlite");

const { startRuntime } = await import(
  pathToFileURL(join(process.cwd(), "dist/cli/runtime.js")).href
);

async function runPass(label) {
  const t0 = Date.now();
  const runtime = await startRuntime({
    host: "127.0.0.1",
    port: 28994,
    config,
    cachePath,
    log: (m) => process.stderr.write(`[${label}] ${m}\n`),
  });
  const ms = Date.now() - t0;
  const total = runtime.registry.size();
  const azTools = runtime.registry.listTools().filter((t) => t.connectorName === "az");
  const doctor = await runtime.metaTools.call("doctor", {});
  const azConn = (doctor.connectors || []).find((c) => c.name === "az");
  const cats = await runtime.metaTools.call("list_tool_categories", {});
  await runtime.stop();
  return { ms, total, azTools: azTools.length, azConn, categories: (cats.categories || []).length };
}

console.log("\n=== 全量 az 发现压测 ===\n");
console.log("config:", config);
console.log("cache:", cachePath);
console.log("acceleration: concurrency=8, help_argv=[-h], materialize_global_args=false, lazy exposure");
console.log("scope: no include_subgroups, max_depth=3\n");

if (!warm || !existsSync(cachePath)) {
  const cold = await runPass("cold");
  console.log("--- cold (empty cache) ---");
  console.log("wall_ms:", cold.ms);
  console.log("registry_tools:", cold.total);
  console.log("az_help_tools:", cold.azTools);
  console.log("categories:", cold.categories);
  if (cold.azConn) {
    console.log(
      "doctor:",
      `help=${cold.azConn.tools?.from_help} parser=${cold.azConn.discovery?.parser} concurrency=${cold.azConn.discovery?.concurrency}`,
    );
  }
}

const warmPass = await runPass("warm");
console.log("\n--- warm (SQLite cache hit) ---");
console.log("wall_ms:", warmPass.ms);
console.log("registry_tools:", warmPass.total);

if (!keepDir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    console.log("(left cache dir for inspect:", dir, ")");
  }
} else {
  console.log("C2M_BENCH_DIR kept:", dir);
}

console.log("\n=== done ===\n");