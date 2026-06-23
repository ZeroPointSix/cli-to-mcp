/**
 * Runtime: orchestrates startup flow (architecture §6.1).
 *
 *   load config -> load cache -> discovery -> registry -> start MCP server
 *
 * On startup we prefer cached ToolDefinitions. If cache is empty for the
 * current configHash, we run discovery and persist results. Refresh failure
 * never wipes old cache.
 */
import { ConfigLoader, type LoadedConfig } from "../config/config-loader.js";
import { CacheStore } from "../cache/db.js";
import { InMemoryToolRegistry } from "../registry/tool-registry.js";
import { CommandExecutor } from "../executor/command-executor.js";
import { CliToMcpServer } from "../mcp/server.js";
import { MetaTools, type MetaToolHandlers } from "./meta-tools.js";
import { summarizeSources } from "../discovery/sources.js";
import { buildDiscoveryEngine } from "../discovery/engine-factory.js";
import { join } from "node:path";

export type ServeOptions = {
  host: string;
  port: number;
  config: string;
  /** Override cache DB path. Defaults to ./.cli-to-mcp/cache.sqlite. */
  cachePath?: string;
  log?: (msg: string) => void;
};

export type Runtime = {
  config: LoadedConfig;
  registry: InMemoryToolRegistry;
  cache: CacheStore;
  executor: CommandExecutor;
  server: CliToMcpServer;
  metaTools: MetaTools;
  stop(): Promise<void>;
};

export async function startRuntime(opts: ServeOptions): Promise<Runtime> {
  const log = opts.log ?? ((m: string) => process.stderr.write(`[cli-to-mcp] ${m}\n`));

  // 1. Load config.
  const config = new ConfigLoader().load(opts.config);
  log(`loaded config from ${opts.config} (hash=${config.configHash})`);

  // 2. Open cache.
  const cachePath =
    opts.cachePath ??
    join(config.configDir, ".cli-to-mcp", "cache.sqlite");
  const cache = new CacheStore(cachePath);
  const { engine, parserRegistry } = await buildDiscoveryEngine(config, { log });

  // 3. Load cached tools for this configHash; if missing, run discovery.
  let tools = cache.loadTools(config.configHash);
  if (tools.length === 0) {
    log("no cached tools; running discovery");
    const all: typeof tools = [];
    for (const conn of config.connectors) {
      if (!conn.enabled) continue;
      cache.upsertConnector({
        name: conn.name,
        binary: conn.binary,
        enabled: conn.enabled ? 1 : 0,
        version: null,
        config_hash: config.configHash,
      });
      const scanRunId = cache.startScanRun(conn.name);
      try {
        const discovered = await engine.discover(conn, config);
        all.push(...discovered);
        cache.finishScanRun(scanRunId, "ok", null);
        const sc = summarizeSources(discovered);
        log(
          `discovery summary: ${conn.name} tools=${discovered.length} yaml=${sc.yaml} template=${sc.template} help=${sc.help} mixed=${sc.mixed}`,
        );
      } catch (err) {
        cache.finishScanRun(scanRunId, "failed", String(err));
        log(`discovery failed for ${conn.name}: ${String(err)}; keeping any existing tools`);
      }
    }
    if (all.length > 0) {
      cache.replaceTools(config.configHash, all);
      tools = all;
    } else {
      // Fall back to latest tools from any hash (refresh failure path).
      tools = cache.loadLatestTools();
      if (tools.length > 0) log(`falling back to ${tools.length} cached tools`);
    }
  } else {
    log(`loaded ${tools.length} tools from cache`);
  }

  // 4. Build registry.
  const registry = new InMemoryToolRegistry();
  registry.replaceAll(tools);

  // 5. Executor + connectors map.
  const executor = new CommandExecutor();
  const connectors = new Map(config.connectors.map((c) => [c.name, c]));

  // 6. Meta tools.
  const metaTools = new MetaTools({
    registry,
    cache,
    config,
    connectors,
    parserRegistry,
    log,
  });

  // 7. MCP server.
  const server = new CliToMcpServer({
    host: opts.host,
    port: opts.port,
    registry,
    executor,
    connectors,
    metaTools: metaTools as unknown as MetaToolHandlers,
    log,
  });

  await server.start();

  return {
    config,
    registry,
    cache,
    executor,
    server,
    metaTools,
    async stop() {
      await server.stop();
      cache.close();
    },
  };
}
