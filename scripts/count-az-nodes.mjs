/**
 * Count help BFS nodes for az (no MCP server) — estimates cold spawn count.
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { join } from "node:path";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { scanHelpTree } = await import(pathToFileURL(join(root, "dist/discovery/help-discovery.js")).href);
const { createDefaultParserRegistry } = await import(
  pathToFileURL(join(root, "dist/discovery/sources.js")).href
);

const connector = {
  name: "az",
  binary: "az",
  enabled: true,
  help_timeout_seconds: 25,
  env: {
    AZURE_CORE_COLLECT_TELEMETRY: "false",
    AZURE_CORE_DISABLE_TELEMETRY: "true",
  },
  working_dir: null,
  skills: [],
  skill_root: null,
  discovery: { mode: "help", max_depth: 3, concurrency: 16, help_argv: ["-h"] },
};

const reg = createDefaultParserRegistry();
const { runHelp } = await import(pathToFileURL(join(root, "dist/discovery/help-runner.js")).href);

for (const depth of [2, 3]) {
  const t0 = Date.now();
  const nodes = await scanHelpTree({
    connector,
    maxDepth: depth,
    helpTimeoutMs: 25_000,
    concurrency: 16,
    runHelpFn: runHelp,
    parserRegistry: reg,
    log: (m) => {
      if (m.includes("done nodes=")) console.error(m);
    },
  });
  const ms = Date.now() - t0;
  const leaves = nodes.filter((n) => n.cmd.subcommands.length === 0 && n.path.length > 0).length;
  console.log(`max_depth=${depth} nodes=${nodes.length} leaves=${leaves} time=${(ms / 1000).toFixed(1)}s`);
}