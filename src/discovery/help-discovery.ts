/**
 * Help tree BFS with continuous worker-pool concurrency (issue #15).
 * Optional CacheStore: bulk-load at scan start, batch flush at end (no per-spawn SQLite).
 */
import type { ResolvedConnector } from "../config/config-loader.js";
import type { HelpParserRegistry } from "./parser-registry.js";
import type { runHelp } from "./help-runner.js";
import type { DiscoveredCommand } from "./types.js";
import { helpArgv } from "./global-args.js";
import type { CacheStore } from "../cache/db.js";
import { discoveryFingerprint, helpPathKey } from "./help-cache-key.js";

export type HelpNodeResult = {
  path: string[];
  cmd: DiscoveredCommand;
  parserId: string | undefined;
  helpFromCache?: boolean;
};

export type ScanHelpTreeOptions = {
  connector: ResolvedConnector;
  maxDepth: number;
  includeSubgroups?: string[];
  parserId?: string;
  helpTimeoutMs: number;
  concurrency: number;
  runHelpFn: typeof runHelp;
  parserRegistry: HelpParserRegistry;
  log: (msg: string) => void;
  cache?: CacheStore;
  /** Wall-clock cap: stop enqueueing new paths after this many ms (in-flight nodes still finish). */
  startupBudgetMs?: number;
  bfsPreference?: "fifo" | "shallow_first";
};

type QueueItem = { path: string[] };

type HelpSession = {
  memory: Map<string, { raw_help: string; exit_code: number | null }>;
  pendingWrites: Array<{
    connector_name: string;
    fingerprint: string;
    path_key: string;
    raw_help: string;
    exit_code: number | null;
  }>;
  fingerprint: string;
  connectorName: string;
};

function parseNode(
  connector: ResolvedConnector,
  path: string[],
  rawHelp: string,
  exitCode: number,
  parserId: string | undefined,
  parserRegistry: HelpParserRegistry,
): { cmd: DiscoveredCommand; parserId: string | undefined } {
  const ctx = {
    connectorName: connector.name,
    binary: connector.binary,
    path,
    rawHelp,
    exitCode,
  };
  const cmd = parserRegistry.parse(ctx, parserId);
  const usedParser = parserRegistry.selectPlugin(ctx, parserId);
  return { cmd, parserId: usedParser?.id };
}

async function fetchHelp(
  opts: ScanHelpTreeOptions,
  session: HelpSession | undefined,
  path: string[],
  helpFlags: string[],
): Promise<{ rawHelp: string; exitCode: number; fromCache: boolean } | null> {
  const { connector, helpTimeoutMs, runHelpFn } = opts;
  const pathKey = helpPathKey(path);

  if (session) {
    const hit = session.memory.get(pathKey);
    if (hit?.raw_help) {
      return { rawHelp: hit.raw_help, exitCode: hit.exit_code ?? 0, fromCache: true };
    }
  }

  const out = await runHelpFn(connector.binary, path, {
    timeoutMs: helpTimeoutMs,
    env: connector.env ? { ...process.env, ...connector.env } : undefined,
    cwd: connector.working_dir ?? undefined,
    argvPrefix: connector.argv_prefix ? [...connector.argv_prefix] : undefined,
    helpArgv: helpFlags,
    connectorName: connector.name,
  });
  if (!out.rawHelp) return null;

  if (session) {
    session.memory.set(pathKey, { raw_help: out.rawHelp, exit_code: out.exitCode });
    session.pendingWrites.push({
      connector_name: session.connectorName,
      fingerprint: session.fingerprint,
      path_key: pathKey,
      raw_help: out.rawHelp,
      exit_code: out.exitCode,
    });
  }

  return { rawHelp: out.rawHelp, exitCode: out.exitCode ?? 0, fromCache: false };
}

/**
 * Continuous worker pool: as soon as a worker finishes, it picks the next queued
 * path instead of waiting for an entire batch to complete.
 */
export async function scanHelpTree(opts: ScanHelpTreeOptions): Promise<HelpNodeResult[]> {
  const {
    connector,
    maxDepth,
    includeSubgroups,
    parserId,
    concurrency,
    parserRegistry,
    log,
    cache,
  } = opts;

  const fingerprint = discoveryFingerprint(connector);
  let session: HelpSession | undefined;
  if (cache) {
    session = {
      memory: cache.loadHelpCacheMap(connector.name, fingerprint),
      pendingWrites: [],
      fingerprint,
      connectorName: connector.name,
    };
    if (session.memory.size > 0) {
      log(`help discovery: ${connector.name} preloaded help_cache=${session.memory.size}`);
    }
  }

  const visited = new Set<string>();
  const enqueued = new Set<string>([""]);
  const results: HelpNodeResult[] = [];
  const queue: QueueItem[] = [{ path: [] }];
  let tail = 1;
  let head = 0;
  let active = 0;
  const pool = Math.max(1, Math.min(32, concurrency));
  const helpFlags = helpArgv(connector.discovery);
  const scanStart = Date.now();
  let helpFailPruned = 0;
  let budgetClosed = false;
  let budgetTimer: ReturnType<typeof setTimeout> | undefined;
  let hardWallTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Hard wall equals startup budget: startRuntime must return within startup_budget_seconds
   * (in-flight help spawns are not awaited). Full tree continues via background_continue_discovery.
   */
  const hardWallMs = opts.startupBudgetMs ?? undefined;
  if (opts.startupBudgetMs) {
    budgetTimer = setTimeout(() => {
      budgetClosed = true;
      head = tail;
    }, opts.startupBudgetMs);
  }

  const maybeEnqueue = (path: string[], subs: string[]) => {
    if (budgetClosed || (opts.startupBudgetMs && Date.now() - scanStart >= opts.startupBudgetMs)) {
      budgetClosed = true;
      return;
    }
    if (path.length >= maxDepth) return;
    let list = subs;
    if (path.length === 0 && includeSubgroups && includeSubgroups.length > 0) {
      list = subs.filter((s) => includeSubgroups.includes(s));
    }
    const shallowFirst = (opts.bfsPreference ?? "fifo") === "shallow_first";
    for (const sub of list) {
      const nextKey = [...path, sub].join(" ");
      if (visited.has(nextKey) || enqueued.has(nextKey)) continue;
      enqueued.add(nextKey);
      const item = { path: [...path, sub] };
      if (shallowFirst) {
        queue.splice(head, 0, item);
        tail++;
      } else {
        queue[tail++] = item;
      }
    }
  };

  const processPath = async (path: string[]): Promise<void> => {
    const key = path.join(" ");
    if (visited.has(key)) return;
    visited.add(key);

    const help = await fetchHelp(opts, session, path, helpFlags);
    if (!help) {
      helpFailPruned++;
      return;
    }

    const { cmd, parserId: usedId } = parseNode(
      connector,
      path,
      help.rawHelp,
      help.exitCode,
      parserId,
      parserRegistry,
    );
    results.push({
      path,
      cmd,
      parserId: usedId,
      helpFromCache: help.fromCache,
    });
    maybeEnqueue(path, cmd.subcommands);
  };

  const overBudget = () =>
    !!opts.startupBudgetMs && Date.now() - scanStart >= opts.startupBudgetMs;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if (hardWallMs != null) {
      hardWallTimer = setTimeout(() => {
        budgetClosed = true;
        head = tail;
        log(
          `help discovery: ${connector.name} hard_wall_ms=${hardWallMs} active=${active} (returning without waiting for in-flight help)`,
        );
        finish();
      }, hardWallMs);
    }
    const pump = () => {
      if (overBudget()) {
        budgetClosed = true;
        head = tail;
      }
      while (active < pool && head < tail && !budgetClosed) {
        const { path } = queue[head++];
        active++;
        processPath(path)
          .catch(reject)
          .finally(() => {
            active--;
            if (head >= tail && active === 0) finish();
            else pump();
          });
      }
    };
    pump();
  });

  if (budgetTimer) clearTimeout(budgetTimer);
  if (hardWallTimer) clearTimeout(hardWallTimer);

  const cacheHits = results.filter((r) => r.helpFromCache).length;
  const spawnedCount = session?.pendingWrites.length ?? results.length;

  if (session && session.pendingWrites.length > 0 && cache) {
    cache.putHelpCacheBatch(session.pendingWrites);
    session.pendingWrites = [];
  }

  // Detached drain: when the hard wall fires, in-flight help spawns are still
  // running and their results land in session.pendingWrites AFTER the flush
  // above. Drain them to help_cache so background continuation doesn't have to
  // re-spawn those nodes. Fire-and-forget — errors are non-fatal (cache may be
  // closed by runtime.stop() before the drain settles).
  if (session && cache && budgetClosed) {
    const drainHelpCache = (async () => {
      const graceDeadline = Date.now() + Math.min(opts.helpTimeoutMs + 5_000, 30_000);
      while (active > 0 && Date.now() < graceDeadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      if (session!.pendingWrites.length > 0) {
        const n = session!.pendingWrites.length;
        cache.putHelpCacheBatch(session!.pendingWrites);
        session!.pendingWrites = [];
        log(
          `help discovery: ${connector.name} drain_after_hard_wall flushed=${n} active_left=${active}`,
        );
      }
    })();
    drainHelpCache.catch(() => {});
  }

  const queuedLeft = Math.max(0, tail - head);
  log(
    `help discovery: ${connector.name} done nodes=${results.length} spawned=${spawnedCount} cache_hits=${cacheHits} help_fail_pruned=${helpFailPruned} pool=${pool}${budgetClosed ? ` budget_truncated queued_left=${queuedLeft}` : ""}`,
  );

  return results;
}