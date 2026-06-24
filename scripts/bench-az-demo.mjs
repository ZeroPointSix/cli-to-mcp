/**
 * Cold start using examples/az config (include_subgroups + depth 3) — should finish in ~5 min.
 */
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const cfgPath = join(root, "examples/az/cli-to-mcp.yaml");
const { startRuntime } = await import(pathToFileURL(join(root, "dist/cli/runtime.js")).href);

const baseDir = mkdtempSync(join(tmpdir(), "c2m-az-demo-"));
const t0 = Date.now();
const rt = await startRuntime({
  host: "127.0.0.1",
  port: 28998,
  config: cfgPath,
  cachePath: join(baseDir, "c.sqlite"),
  log: (m) => {
    if (m.includes("done nodes=") || m.includes("discovery summary")) process.stderr.write(`[bench] ${m}\n`);
  },
});
const ms = Date.now() - t0;
const n = rt.registry.listTools().filter((t) => t.connectorName === "az").length;
await rt.stop();
const ok = ms <= 300_000;
console.log(`demo az (account+group depth=3): ${(ms / 1000).toFixed(1)}s tools=${n} target<=300s: ${ok ? "PASS" : "FAIL"}`);
rmSync(baseDir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);