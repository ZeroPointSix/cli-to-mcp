/**
 * 全量 az（无 include_subgroups）不同 max_depth / concurrency 扫参。
 * Usage: node scripts/bench-az-sweep.mjs
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const { startRuntime } = await import(
  pathToFileURL(join(process.cwd(), "dist/cli/runtime.js")).href
);

const sweeps = [
  { label: "full_d1_c8", max_depth: 1, concurrency: 8 },
  { label: "full_d2_c8", max_depth: 2, concurrency: 8 },
  { label: "full_d3_c4", max_depth: 3, concurrency: 4 },
  { label: "full_d3_c8", max_depth: 3, concurrency: 8 },
];

const baseDir = mkdtempSync(join(tmpdir(), "c2m-az-sweep-"));
const results = [];

for (const s of sweeps) {
  const cfgPath = join(baseDir, `${s.label}.yaml`);
  writeFileSync(
    cfgPath,
    `version: 1
connectors:
  - name: az
    binary: az
    enabled: true
    default_timeout_seconds: 120
    discovery:
      mode: help
      parser: generic
      max_depth: ${s.max_depth}
      help_argv: ["-h"]
      concurrency: ${s.concurrency}
      exposure_mode: lazy
      materialize_global_args: false
`,
  );
  const cachePath = join(baseDir, `${s.label}.sqlite`);
  const t0 = Date.now();
  let runtime;
  try {
    runtime = await startRuntime({
      host: "127.0.0.1",
      port: 28995,
      config: cfgPath,
      cachePath,
      log: () => {},
    });
    const ms = Date.now() - t0;
    const n = runtime.registry.listTools().filter((t) => t.connectorName === "az").length;
    await runtime.stop();
    results.push({ ...s, ms, tools: n, ok: true });
    console.log(`${s.label}: ${(ms / 1000).toFixed(1)}s tools=${n}`);
  } catch (e) {
    results.push({ ...s, ms: Date.now() - t0, tools: 0, ok: false, err: String(e) });
    console.log(`${s.label}: FAIL`, e);
  }
}

rmSync(baseDir, { recursive: true, force: true });
console.log("\n=== sweep summary ===");
for (const r of results) {
  console.log(
    `${r.label} depth=${r.max_depth} conc=${r.concurrency} -> ${r.ok ? `${(r.ms / 1000).toFixed(1)}s` : "fail"} tools=${r.tools}`,
  );
}