/**
 * gh + az parallel cold start only (no background wait).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const cfgPath = join(root, "examples/mega/cli-to-mcp.yaml");
const { startRuntime } = await import(pathToFileURL(join(root, "dist/cli/runtime.js")).href);

const baseDir = mkdtempSync(join(tmpdir(), "c2m-mega-"));
const t0 = Date.now();
const rt = await startRuntime({
  host: "127.0.0.1",
  port: 28999,
  config: cfgPath,
  cachePath: join(baseDir, "cache.sqlite"),
  log: (m) => {
    if (
      m.includes("cold start total_tools") ||
      m.includes("parallel cold start") ||
      m.includes("hard_wall") ||
      m.includes("leaf_tools=")
    ) {
      process.stderr.write(`${m}\n`);
    }
  },
});
const ms = Date.now() - t0;
const byConn = {};
for (const t of rt.registry.listTools()) {
  byConn[t.connectorName] = (byConn[t.connectorName] ?? 0) + 1;
}
const total = rt.registry.size();
await rt.stop();
rmSync(baseDir, { recursive: true, force: true });

const ok = ms <= 302_000;
console.log(`\n=== mega cold (gh+az parallel) ===`);
console.log(`time: ${(ms / 1000).toFixed(1)}s tools_total=${total} by_connector=${JSON.stringify(byConn)}`);
console.log(`target <=302s: ${ok ? "PASS" : "FAIL"}`);
console.log(`note: for 1000+ tools run: node scripts/bench-until-1000.mjs --az-only`);
process.exit(ok ? 0 : 1);