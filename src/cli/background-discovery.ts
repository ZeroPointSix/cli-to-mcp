/**
 * After bounded startup discovery, continue help BFS in the background (connectors in parallel).
 */
import type { LoadedConfig } from "../config/config-loader.js";
import type { DiscoveryEngine } from "../discovery/discovery-engine.js";
import type { CacheStore } from "../cache/db.js";
import type { InMemoryToolRegistry } from "../registry/tool-registry.js";
import type { ToolDefinition } from "../registry/tool-definition.js";
import {
  applyMergedTools,
  connectorWithoutStartupBudget,
  discoverOneConnector,
  shouldBackgroundContinue,
  snapshotRegistryByConnector,
} from "./discovery-runner.js";

export type BackgroundDiscoveryStatus = {
  running: boolean;
  connectors: string[];
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  last_registry_size: number | null;
};

export type BackgroundDiscoveryHandle = {
  status: () => BackgroundDiscoveryStatus;
  done: Promise<void>;
  abort: () => void;
};

export function startBackgroundDiscovery(opts: {
  config: LoadedConfig;
  engine: DiscoveryEngine;
  registry: InMemoryToolRegistry;
  cache: CacheStore;
  log: (msg: string) => void;
}): BackgroundDiscoveryHandle | null {
  const targets = opts.config.connectors.filter((c) => c.enabled && shouldBackgroundContinue(c));
  if (targets.length === 0) return null;

  const startedAt = new Date().toISOString();
  const status: BackgroundDiscoveryStatus = {
    running: true,
    connectors: targets.map((c) => c.name),
    started_at: startedAt,
    finished_at: null,
    last_error: null,
    last_registry_size: opts.registry.size(),
  };

  const done = (async () => {
    opts.log(
      `background discovery: parallel connectors=[${status.connectors.join(", ")}] (no startup budget)`,
    );
    try {
      const results = await Promise.all(
        targets.map(async (conn) => {
          const unbounded = connectorWithoutStartupBudget(conn);
          opts.log(`background discovery: scanning ${conn.name}`);
          try {
            const discovered = await discoverOneConnector(
              opts.engine,
              unbounded,
              opts.config,
              opts.log,
              opts.cache,
            );
            return { name: conn.name, discovered };
          } catch (err) {
            opts.log(`background discovery: ${conn.name} failed: ${String(err)}`);
            return { name: conn.name, discovered: [] as ToolDefinition[] };
          }
        }),
      );
      const byConnector = snapshotRegistryByConnector(opts.registry);
      let mergedAny = false;
      for (const r of results) {
        if (r.discovered.length > 0) {
          byConnector.set(r.name, r.discovered);
          mergedAny = true;
        }
      }
      if (mergedAny) {
        const size = applyMergedTools(opts.config, opts.registry, opts.cache, byConnector);
        status.last_registry_size = size;
        opts.log(`background discovery: merged registry_size=${size}`);
      }
    } catch (err) {
      status.last_error = String(err);
      opts.log(`background discovery: stopped with error: ${status.last_error}`);
    } finally {
      status.running = false;
      status.finished_at = new Date().toISOString();
      opts.log(
        `background discovery: finished registry_size=${opts.registry.size()}${status.last_error ? " (with errors)" : ""}`,
      );
    }
  })();

  return {
    status: () => ({ ...status }),
    done,
    abort: () => {
      /* merge always applies completed discover results; stop() awaits done first */
    },
  };
}