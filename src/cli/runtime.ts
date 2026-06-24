/**
 * Runtime: orchestrates startup flow (architecture §6.1).
 */
import { ConfigLoader, type LoadedConfig } from "../config/config-loader.js";
import { CacheStore } from "../cache/db.js";
import { InMemoryToolRegistry } from "../registry/tool-registry.js";
import { CommandExecutor } from "../executor/command-executor.js";
import { CliToMcpServer } from "../mcp/server.js";
import { MetaTools, type MetaToolHandlers } from "./meta-tools.js";
import { buildDiscoveryEngine } from "../discovery/engine-factory.js";
import { HelpSpawnGate } from "../discovery/help-spawn-gate.js";
import { join } from "node:path";
import {
  discoverConnectorsParallel,
  mergeToolsByConnector,
  shouldBackgroundContinue,
} from "./discovery-runner.js";
import {
  startBackgroundDiscovery,
  type BackgroundDiscoveryHandle,
  type BackgroundDiscoveryStatus,
} from "./background-discovery.js";

export type ServeOptions = {
  host: string;
  port: number;
  config: string;
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
  backgroundDiscovery: BackgroundDiscoveryHandle | null;
  backgroundDiscoveryStatus: () => BackgroundDiscoveryStatus | null;
  stop(): Promise<void>;
};

export async function startRuntime(opts: ServeOptions): Promise<Runtime> {
  const log = opts.log ?? ((m: string) => process.stderr.write(`[cli-to-mcp] ${m}\n`));

  const config = new ConfigLoader().load(opts.config);
  log(`loaded config from ${opts.config} (hash=${config.configHash})`);

  const cachePath =
    opts.cachePath ??
    join(config.configDir, ".cli-to-mcp", "cache.sqlite");
  const cache = new CacheStore(cachePath);

  const maxInflight = config.runtime?.max_inflight_help_spawns ?? 24;
  const helpSpawnGate = new HelpSpawnGate(maxInflight);
  log(`runtime: max_inflight_help_spawns=${maxInflight}`);

  const { engine, parserRegistry } = await buildDiscoveryEngine(config, {
    log,
    cache,
    helpSpawnGate,
  });

  let tools = cache.loadTools(config.configHash);
  let ranColdDiscovery = false;

  if (tools.length === 0) {
    log("no cached tools; running discovery");
    ranColdDiscovery = true;
    const byConnector = await discoverConnectorsParallel(engine, config, log, cache);
    const merged = mergeToolsByConnector(config, byConnector);
    if (merged.length > 0) {
      cache.replaceTools(config.configHash, merged);
      tools = merged;
      log(`discovery: cold start total_tools=${merged.length}`);
    } else {
      tools = cache.loadLatestTools();
      if (tools.length > 0) log(`falling back to ${tools.length} cached tools`);
    }
  } else {
    log(`loaded ${tools.length} tools from cache`);
  }

  const registry = new InMemoryToolRegistry();
  registry.replaceAll(tools);

  const executor = new CommandExecutor();
  const connectors = new Map(config.connectors.map((c) => [c.name, c]));

  let backgroundDiscovery: BackgroundDiscoveryHandle | null = null;

  const metaTools = new MetaTools({
    registry,
    cache,
    config,
    connectors,
    executor,
    parserRegistry,
    log,
    getBackgroundDiscoveryStatus: () => backgroundDiscovery?.status() ?? null,
  });

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
  log(`MCP server listening on ${opts.host}:${opts.port} (registry=${registry.size()} tools)`);

  if (ranColdDiscovery && config.connectors.some((c) => c.enabled && shouldBackgroundContinue(c))) {
    backgroundDiscovery = startBackgroundDiscovery({
      config,
      engine,
      registry,
      cache,
      log,
    });
  }

  return {
    config,
    registry,
    cache,
    executor,
    server,
    metaTools,
    backgroundDiscovery,
    backgroundDiscoveryStatus: () => backgroundDiscovery?.status() ?? null,
    async stop() {
      backgroundDiscovery?.abort();
      await backgroundDiscovery?.done.catch(() => {});
      await server.stop();
      cache.close();
    },
  };
}