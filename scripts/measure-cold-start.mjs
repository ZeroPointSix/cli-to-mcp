/**
 * Measure cold start using the SHIPPED examples/az/cli-to-mcp.yaml.
 * Reports time-to-serve + initial tool count, then exits (background not awaited).
 */
import { mkdtempSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "c2m-az-shipped-"));
const cachePath = join(dir, "cache.sqlite");
// Copy the shipped example so relative paths (if any) resolve from a stable dir.
const cfgPath = join(dir, "cli-to-mcp.yaml");
copyFileSync(join(process.cwd(), "examples/az/cli-to-mcp.yaml"), cfgPath);

process.stderr.write(`config: examples/az/cli-to-mcp.yaml (shipped)\n`);
process.stderr.write(`cache: ${cachePath}\n\n`);

const t0 = Date.now();
const { startRuntime } = await import(
  pathToFileURL(join(process.cwd(), "dist/cli/runtime.js")).href
);

const rt = await startRuntime({
  host: "127.0.0.1",
  port: 29890,
  config: cfgPath,
  cachePath,
  log: (m) => {
    const s = ((Date.now() - t0) / 1000).toFixed(0);
    process.stderr.write(`[${s}s] ${m}\n`);
  },
});

const ms = Date.now() - t0;
process.stdout.write(`\n=== COLD-START (shipped examples/az/cli-to-mcp.yaml) ===\n`);
process.stdout.write(`SERVE_READY_MS=${ms}\n`);
process.stdout.write(`SERVE_READY_S=${(ms / 1000).toFixed(1)}\n`);
process.stdout.write(`TOOLS_AT_SERVE=${rt.registry.size()}\n`);
process.stdout.write(`UNDER_5MIN=${ms <= 300_000 ? "YES" : "NO"}\n`);
process.stdout.write(`BACKGROUND_ACTIVE=${rt.backgroundDiscovery ? 1 : 0}\n`);
process.stdout.write(`CACHE_PATH=${cachePath}\n`);
process.exit(0);
