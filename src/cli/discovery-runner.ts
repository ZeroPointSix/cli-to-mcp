/**
 * Shared connector discovery + cache/registry merge helpers.
 */
import type { LoadedConfig, ResolvedConnector } from "../config/config-loader.js";
import type { DiscoveryEngine } from "../discovery/discovery-engine.js";
import type { CacheStore } from "../cache/db.js";
import type { InMemoryToolRegistry } from "../registry/tool-registry.js";
import type { ToolDefinition } from "../registry/tool-definition.js";
import { summarizeSources } from "../discovery/sources.js";

export function connectorWithoutStartupBudget(conn: ResolvedConnector): ResolvedConnector {
  if (!conn.discovery) return conn;
  const {
    startup_budget_seconds: _b,
    startup_max_depth: _smd,
    startup_include_subgroups: _sis,
    background_concurrency: _bgc,
    ...rest
  } = conn.discovery;
  // Background continuation runs with full max_depth (startup cap stripped).
  // Optionally bump concurrency so full registration finishes faster once the
  // server is already serving.
  if (_bgc != null) {
    rest.concurrency = _bgc;
  }
  return { ...conn, discovery: rest };
}

export function shouldBackgroundContinue(conn: ResolvedConnector): boolean {
  const d = conn.discovery;
  if (!d || d.mode !== "help") return false;
  if (d.startup_budget_seconds == null) return false;
  if (d.background_continue_discovery === false) return false;
  return true;
}

export async function discoverOneConnector(
  engine: DiscoveryEngine,
  conn: ResolvedConnector,
  config: LoadedConfig,
  log: (msg: string) => void,
  cache: CacheStore,
): Promise<ToolDefinition[]> {
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
    cache.finishScanRun(scanRunId, "ok", null);
    const sc = summarizeSources(discovered);
    log(
      `discovery summary: ${conn.name} tools=${discovered.length} yaml=${sc.yaml} template=${sc.template} help=${sc.help} mixed=${sc.mixed}`,
    );
    return discovered;
  } catch (err) {
    cache.finishScanRun(scanRunId, "failed", String(err));
    log(`discovery failed for ${conn.name}: ${String(err)}`);
    throw err;
  }
}

/** Merge per-connector tool lists in config order (replaces each connector's tools entirely). */
export function mergeToolsByConnector(
  config: LoadedConfig,
  byConnector: Map<string, ToolDefinition[]>,
): ToolDefinition[] {
  const merged: ToolDefinition[] = [];
  for (const conn of config.connectors) {
    merged.push(...(byConnector.get(conn.name) ?? []));
  }
  return merged;
}

export function snapshotRegistryByConnector(registry: InMemoryToolRegistry): Map<string, ToolDefinition[]> {
  const map = new Map<string, ToolDefinition[]>();
  for (const t of registry.listTools()) {
    const list = map.get(t.connectorName) ?? [];
    list.push(t);
    map.set(t.connectorName, list);
  }
  return map;
}

/**
 * Cold-start discovery for all enabled connectors (parallel by default).
 */
export async function discoverConnectorsParallel(
  engine: DiscoveryEngine,
  config: LoadedConfig,
  log: (msg: string) => void,
  cache: CacheStore,
): Promise<Map<string, ToolDefinition[]>> {
  const parallel = config.runtime?.parallel_connector_discovery !== false;
  const enabled = config.connectors.filter((c) => c.enabled);
  const byConnector = new Map<string, ToolDefinition[]>();

  const runOne = async (conn: (typeof enabled)[0]) => {
    try {
      const discovered = await discoverOneConnector(engine, conn, config, log, cache);
      return { name: conn.name, discovered };
    } catch {
      return { name: conn.name, discovered: [] as ToolDefinition[] };
    }
  };

  if (!parallel || enabled.length <= 1) {
    for (const conn of enabled) {
      const r = await runOne(conn);
      byConnector.set(r.name, r.discovered);
    }
    return byConnector;
  }

  log(`discovery: parallel cold start connectors=[${enabled.map((c) => c.name).join(", ")}]`);
  const results = await Promise.all(enabled.map(runOne));
  for (const r of results) byConnector.set(r.name, r.discovered);
  return byConnector;
}

export function applyMergedTools(
  config: LoadedConfig,
  registry: InMemoryToolRegistry,
  cache: CacheStore,
  byConnector: Map<string, ToolDefinition[]>,
): number {
  const merged = mergeToolsByConnector(config, byConnector);
  cache.replaceTools(config.configHash, merged);
  registry.replaceAll(merged);
  return merged.length;
}