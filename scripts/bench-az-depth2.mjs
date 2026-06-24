import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { startRuntime } = await import(pathToFileURL(join(root, "dist/cli/runtime.js")).href);

const baseDir = mkdtempSync(join(tmpdir(), "c2m-d2-"));
const cfgPath = join(baseDir, "az.yaml");
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
      max_depth: 2
      help_argv: ["-h"]
      concurrency: 16
      exposure_mode: lazy
`,
);
const t0 = Date.now();
const rt = await startRuntime({
  host: "127.0.0.1",
  port: 28997,
  config: cfgPath,
  cachePath: join(baseDir, "c.sqlite"),
  log: (m) => {
    if (m.includes("done nodes=")) process.stderr.write(m + "\n");
  },
});
const ms = Date.now() - t0;
const n = rt.registry.listTools().filter((t) => t.connectorName === "az").length;
await rt.stop();
console.log(`depth=2 time=${(ms / 1000).toFixed(1)}s tools=${n}`);
rmSync(baseDir, { recursive: true, force: true });