/**
 * Start gh+git all-lazy demo (fresh cache). Default port 28989.
 * If port busy, pass another: node scripts/start-lazy-gh-git.mjs 28992
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const port = Number(process.argv[2] || 28989);
const config = fileURLToPath(new URL("./demo-config-lazy.yaml", import.meta.url));
const cacheDir = mkdtempSync(join(tmpdir(), "c2m-lazy-"));
const cachePath = join(cacheDir, "cache.sqlite");

const { startRuntime } = await import(pathToFileURL(join(process.cwd(), "dist/cli/runtime.js")).href);

const runtime = await startRuntime({
  host: "127.0.0.1",
  port,
  config,
  cachePath,
  log: (m) => process.stderr.write(`[cli-to-mcp] ${m}\n`),
});

process.stderr.write(`\n>>> MCP: http://127.0.0.1:${port}/mcp (gh+git lazy, concurrency 8/4)\n`);
process.stderr.write(`>>> tools/list 应只有 9 个 meta；用 list_tool_categories 浏览 61 个注册工具\n\n`);

const shutdown = async () => {
  await runtime.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());