/**
 * Cold-cache discovery benchmark + lazy tools/list check.
 * Usage: node scripts/bench-lazy-discovery.mjs [configPath]
 */
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
const __dir = fileURLToPath(new URL(".", import.meta.url));
const config = process.argv[2] || join(__dir, "demo-config-lazy.yaml");

const dir = mkdtempSync(join(tmpdir(), "c2m-bench-"));
const cachePath = join(dir, "cache.sqlite");

const { startRuntime } = await import(pathToFileURL(join(process.cwd(), "dist/cli/runtime.js")).href);

const t0 = Date.now();
let runtime;
try {
  runtime = await startRuntime({
    host: "127.0.0.1",
    port: 28991,
    config,
    cachePath,
    log: (m) => process.stderr.write(`[bench] ${m}\n`),
  });
} catch (e) {
  console.error("startRuntime failed", e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
}
const discoveryMs = Date.now() - t0;

const registry = runtime.registry;
const total = registry.size();
const gh = registry.listTools().filter((t) => t.connectorName === "gh").length;
const git = registry.listTools().filter((t) => t.connectorName === "git").length;

const doctor = await runtime.metaTools.call("doctor", {});
const cats = await runtime.metaTools.call("list_tool_categories", {});
const search = await runtime.metaTools.call("search_tools", { query: "pr", limit: 5 });

await runtime.stop();
rmSync(dir, { recursive: true, force: true });

console.log("\n=== lazy + concurrency 冷缓存发现 ===\n");
console.log("config:", config);
console.log("discovery_wall_ms:", discoveryMs);
console.log("registry_total:", total, "(gh:", gh, "git:", git, ")");
console.log("\ndoctor parsers:", JSON.stringify(doctor.parsers, null, 0));
for (const c of doctor.connectors || []) {
  console.log(
    `  ${c.name}: tools=${c.tool_count} parser=${c.discovery?.parser} resolved=${c.parser_resolved} yaml=${c.tools?.from_yaml} template=${c.tools?.from_template} help=${c.tools?.from_help}`,
  );
}
console.log("\ncategories:", (cats.categories || []).length);
console.log("search_tools(pr):", (search.tools || []).map((t) => t.name).join(", "));
console.log("\nMCP tools/list 预期: 仅 9 个 meta（gh/git 均为 lazy）\n");