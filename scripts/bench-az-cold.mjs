/**
 * Real az cold-start benchmark (depth=3, concurrency=16, no include_subgroups).
 * Usage: npm run build && node scripts/bench-az-cold.mjs
 */
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dir, "..");
const { startRuntime } = await import(pathToFileURL(join(root, "dist/cli/runtime.js")).href);

const baseDir = mkdtempSync(join(tmpdir(), "c2m-az-cold-"));
const cfgPath = join(baseDir, "az-full.yaml");
writeFileSync(
  cfgPath,
  `version: 1
connectors:
  - name: az
    binary: az
    enabled: true
    help_timeout_seconds: 25
    env:
      AZURE_CORE_COLLECT_TELEMETRY: "false"
      AZURE_CORE_DISABLE_TELEMETRY: "true"
    discovery:
      mode: help
      parser: generic
      max_depth: 3
      startup_budget_seconds: 300
      help_argv: ["-h"]
      concurrency: 16
      exposure_mode: lazy
      materialize_global_args: false
      background_continue_discovery: false
`,
);
const cachePath = join(baseDir, "cache.sqlite");

const t0 = Date.now();
const runtime = await startRuntime({
  host: "127.0.0.1",
  port: 28996,
  config: cfgPath,
  cachePath,
  log: (m) => {
    if (m.includes("hard_wall") || m.includes("done nodes=") || m.includes("startup_budget")) {
      process.stderr.write(`${m}\n`);
    }
  },
});
const ms = Date.now() - t0;
const azTools = runtime.registry.listTools().filter((t) => t.connectorName === "az").length;
await runtime.stop();

const sec = (ms / 1000).toFixed(1);
/** 300s discovery budget + ≤2s registry/cache/MCP bind */
const ok5 = ms <= 302_000;
console.log(`\n=== az cold start (depth=3, c=16) ===`);
console.log(`time: ${sec}s (${ms}ms)`);
console.log(`az tools: ${azTools}`);
console.log(`target <=302s (300s budget + serve overhead): ${ok5 ? "PASS" : "FAIL"}`);

rmSync(baseDir, { recursive: true, force: true });
process.exit(ok5 ? 0 : 1);