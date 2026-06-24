/**
 * Warm-start measurement: reuse the cache from a prior cold start.
 *   C2M_WARM_CACHE=/path/to/cache.sqlite C2M_WARM_CFG=/path/to/az.yaml \
 *     node --experimental-sqlite scripts/measure-warm-start.mjs
 */
import { pathToFileURL } from "node:url";

const cachePath = process.env.C2M_WARM_CACHE;
const cfgPath = process.env.C2M_WARM_CFG;
if (!cachePath || !cfgPath) {
  console.error("Set C2M_WARM_CACHE and C2M_WARM_CFG env vars (paths from a prior cold run).");
  process.exit(2);
}

process.stderr.write(`warm-start: cfg=${cfgPath}\n             cache=${cachePath}\n\n`);

const t0 = Date.now();
const { startRuntime } = await import(
  pathToFileURL(join(process.cwd(), "dist/cli/runtime.js")).href
);
import { join } from "node:path";

const rt = await startRuntime({
  host: "127.0.0.1",
  port: 29891,
  config: cfgPath,
  cachePath,
  log: (m) => {
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    process.stderr.write(`[${s}s] ${m}\n`);
  },
});

const ms = Date.now() - t0;
process.stdout.write(`\n=== WARM-START (reused cache) ===\n`);
process.stdout.write(`SERVE_READY_MS=${ms}\n`);
process.stdout.write(`TOOLS_AT_SERVE=${rt.registry.size()}\n`);
process.stdout.write(`BACKGROUND_ACTIVE=${rt.backgroundDiscovery ? 1 : 0}\n`);
process.exit(0);
