/**
 * Discovery sources (ADR 0003).
 *
 * Each source produces ToolDefinitions (possibly partial). The DiscoveryEngine
 * merges them with priority: yaml > template > help, and records provenance on
 * each resulting tool so `get_tool_source` can explain origin.
 *
 * Sources shipped:
 * - YamlSource: turns explicit `tools:` declarations into tools. Highest priority.
 * - TemplateSource: built-in connector packs (e.g. gh) seed stable tools when
 *   the user has not declared them in YAML.
 * - HelpSource: scans `--help` and parses subcommands/flags into tools. Lowest
 *   priority; supplements template/yaml rather than replacing them.
 */
import type { LoadedConfig, ResolvedConnector } from "../config/config-loader.js";
import type { ToolDefinition } from "../registry/tool-definition.js";
import { defineTool } from "../registry/tool-definition.js";
import { toolFromYamlDecl } from "../builder/tool-from-config.js";
import { TemplateRegistry } from "./template-registry.js";
import { runHelp } from "./help-runner.js";
import { HelpParserRegistry } from "./parser-registry.js";
import { genericPlugin } from "./plugins/generic.js";
import { cobraPlugin } from "./plugins/cobra.js";
import { azureCliPlugin } from "./plugins/azure-cli.js";
import { toolFromDiscovered } from "../builder/tool-from-discovered.js";
import { scanHelpTree } from "./help-discovery.js";
import type { CacheStore } from "../cache/db.js";
import { discoveryFingerprint } from "./help-cache-key.js";

export type DiscoveryArtifact = {
  tool: ToolDefinition;
  /** Which source produced this artifact. */
  kind: "yaml" | "template" | "help";
  /** 0..1, how confident the source is in its output. */
  confidence: number;
  /** Stable key used to merge the same tool across sources (tool name). */
  key: string;
};

export interface DiscoverySource {
  readonly kind: "yaml" | "template" | "help";
  /** Produce artifacts for one connector. May return []. */
  discover(connector: ResolvedConnector, config: LoadedConfig): Promise<DiscoveryArtifact[]>;
}

/** Merge artifacts into final ToolDefinitions. Later entries win on conflicts. */
export function mergeArtifacts(artifacts: DiscoveryArtifact[]): ToolDefinition[] {
  // Sort by priority: help (lowest) -> template -> yaml (highest).
  const priority: Record<DiscoveryArtifact["kind"], number> = {
    help: 0,
    template: 1,
    yaml: 2,
  };
  const sorted = [...artifacts].sort((a, b) => priority[a.kind] - priority[b.kind]);

  const merged = new Map<string, ToolDefinition>();
  const sourceKinds = new Map<string, Set<DiscoveryArtifact["kind"]>>();
  for (const art of sorted) {
    const existing = merged.get(art.key);
    if (!existing) {
      merged.set(art.key, art.tool);
      sourceKinds.set(art.key, new Set([art.kind]));
      continue;
    }
    // Overlay: higher-priority fields overwrite. For Phase 1 we replace the
    // whole tool but carry forward merged source provenance.
    merged.set(art.key, art.tool);
    sourceKinds.get(art.key)!.add(art.kind);
  }

  // Apply merged source labels.
  for (const [key, tool] of merged) {
    const kinds = sourceKinds.get(key)!;
    const finalSource = kinds.size > 1 ? "mixed" : ([...kinds][0] as ToolDefinition["source"]);
    tool.source = finalSource;
    tool.sources = [...kinds].map((k) => ({
      kind: k,
      confidence: artifacts.find((a) => a.key === key && a.kind === k)?.confidence ?? 1,
    }));
  }
  return [...merged.values()];
}

/**
 * YamlSource: turns explicit `tools:` declarations into tools.
 * Highest priority — user YAML always wins over auto-discovered tools.
 */
export class YamlSource implements DiscoverySource {
  readonly kind = "yaml" as const;

  async discover(
    connector: ResolvedConnector,
    config: LoadedConfig,
  ): Promise<DiscoveryArtifact[]> {
    const out: DiscoveryArtifact[] = [];
    for (const [name, decl] of Object.entries(config.tools ?? {})) {
      if (decl.connector !== connector.name) continue;
      const tool = toolFromYamlDecl(name, decl, connector);
      out.push({
        tool,
        kind: "yaml",
        confidence: 1,
        key: name,
      });
    }
    return out;
  }
}

/**
 * TemplateSource: built-in connector packs (ADR 0003 §"Connector Template").
 *
 * When a connector matches a registered pack — either by name (auto-match) or
 * via `discovery.template: <id>` — every tool in the pack becomes a template
 * artifact. Template confidence (0.85) sits above help (~0.35) and below yaml
 * (1.0), so user YAML still wins on conflicts.
 */
export class TemplateSource implements DiscoverySource {
  readonly kind = "template" as const;
  private registry: TemplateRegistry;

  constructor(registry?: TemplateRegistry) {
    this.registry = registry ?? new TemplateRegistry();
  }

  withRegistry(registry: TemplateRegistry): this {
    this.registry = registry;
    return this;
  }

  async discover(
    connector: ResolvedConnector,
    _config: LoadedConfig,
  ): Promise<DiscoveryArtifact[]> {
    const pack = this.registry.resolve(connector);
    if (!pack) return [];
    const out: DiscoveryArtifact[] = [];
    for (const [name, decl] of Object.entries(pack.tools)) {
      // Pack tools declare connector = pack id (e.g. "gh"). When a user
      // aliases a connector (name "mycli" but discovery.template: "gh"), we
      // rebind the tool to the actual connector so executor looks up the
      // right binary/env. Skip only if the pack's connector field is set and
      // does not match either the connector name or the pack id.
      const packConn = decl.connector;
      if (packConn !== connector.name && packConn !== pack.id) continue;
      const rebound: typeof decl = { ...decl, connector: connector.name };
      const tool = toolFromYamlDecl(name, rebound, connector, "template");
      out.push({ tool, kind: "template", confidence: 0.85, key: name });
    }
    return out;
  }
}

/**
 * HelpSource: scans `--help` (BFS up to max_depth) and parses each node into
 * DiscoveredCommands, then turns leaf commands into help artifacts.
 *
 * - Respects `discovery.mode`: `manual`/`none` skip help entirely.
 * - Uses the connector's parser id (or auto-selects via match()).
 * - Only leaf commands (no subcommands) become tools, so `gh` root does not get
 *   exposed while `gh pr view` does.
 * - Confidence 0.35 — lowest priority, supplements template/yaml.
 */
export class HelpSource implements DiscoverySource {
  readonly kind = "help" as const;
  private parserRegistry: HelpParserRegistry;
  private runHelpFn: typeof runHelp;
  private log: (msg: string) => void;

  private cache?: CacheStore;

  constructor(opts?: {
    parserRegistry?: HelpParserRegistry;
    runHelpFn?: typeof runHelp;
    log?: (msg: string) => void;
    cache?: CacheStore;
  }) {
    this.parserRegistry = opts?.parserRegistry ?? createDefaultParserRegistry();
    this.runHelpFn = opts?.runHelpFn ?? runHelp;
    this.log = opts?.log ?? (() => {});
    this.cache = opts?.cache;
  }

  async discover(
    connector: ResolvedConnector,
    _config: LoadedConfig,
  ): Promise<DiscoveryArtifact[]> {
    const mode = connector.discovery?.mode ?? "help";
    if (mode !== "help") return [];

    const discoverT0 = Date.now();

    /** Default 5: recurse help tree up to 5 command segments; deeper paths are not scanned (ADR 0006). */
    const fullMaxDepth = connector.discovery?.max_depth ?? 5;
    const parserId = connector.discovery?.parser;
    const helpTimeoutMs =
      (connector.help_timeout_seconds ?? connector.default_timeout_seconds ?? 25) * 1000;
    const includeSubgroups = connector.discovery?.include_subgroups;
    const startupIncludeSubgroups = connector.discovery?.startup_include_subgroups;

    const startupBudgetMs = connector.discovery?.startup_budget_seconds
      ? connector.discovery.startup_budget_seconds * 1000
      : undefined;

    // During budgeted cold start, optionally limit scope to startup_include_subgroups
    // for a fast partial serve; background continuation scans the full tree.
    const effectiveIncludeSubgroups =
      startupBudgetMs != null && startupIncludeSubgroups != null
        ? startupIncludeSubgroups
        : includeSubgroups;

    // During budgeted cold start, cap depth at startup_max_depth so the server
    // can register shallow tools fast; background continuation fills deeper
    // levels up to fullMaxDepth.
    const startupMaxDepth = connector.discovery?.startup_max_depth;
    const maxDepth =
      startupBudgetMs != null && startupMaxDepth != null
        ? Math.min(fullMaxDepth, startupMaxDepth)
        : fullMaxDepth;
    this.log(
      `help discovery: ${connector.name} max_depth=${maxDepth}${startupMaxDepth != null && startupBudgetMs != null ? ` (startup_cap=${startupMaxDepth} full=${fullMaxDepth})` : ""}`,
    );

    const concurrency =
      connector.discovery?.concurrency ?? (startupBudgetMs != null ? 24 : 16);
    const fp = discoveryFingerprint(connector);
    const cachedPages = this.cache?.countHelpCache(connector.name, fp) ?? 0;
    this.log(
      `help discovery: ${connector.name} concurrency=${concurrency} help_timeout_ms=${helpTimeoutMs}${cachedPages > 0 ? ` help_cache_hits=${cachedPages}` : ""}`,
    );
    if (startupBudgetMs) {
      this.log(`help discovery: ${connector.name} startup_budget_seconds=${connector.discovery!.startup_budget_seconds}`);
    }

    const bfsPreference =
      connector.discovery?.bfs_preference ?? (startupBudgetMs ? "shallow_first" : "fifo");

    const nodes = await scanHelpTree({
      connector,
      maxDepth,
      includeSubgroups: effectiveIncludeSubgroups,
      parserId,
      helpTimeoutMs,
      concurrency,
      runHelpFn: this.runHelpFn,
      parserRegistry: this.parserRegistry,
      log: this.log,
      cache: this.cache,
      startupBudgetMs,
      bfsPreference,
    });

    const artifacts: DiscoveryArtifact[] = [];
    for (const { cmd } of nodes) {
      const isLeaf = cmd.subcommands.length === 0;
      if (!isLeaf || cmd.path.length === 0) continue;
      const tool = toolFromDiscovered(cmd, connector);
      if (!tool) continue;
      artifacts.push({ tool, kind: "help", confidence: 0.35, key: tool.name });
    }

    const elapsedMs = Date.now() - discoverT0;
    const leafCount = artifacts.length;
    const tpm =
      elapsedMs > 0 ? ((leafCount * 60_000) / elapsedMs).toFixed(0) : "0";
    this.log(
      `help discovery: ${connector.name} leaf_tools=${leafCount} nodes=${nodes.length} elapsed_ms=${elapsedMs} tools_per_min~${tpm} bfs=${bfsPreference}`,
    );

    return artifacts;
  }
}

/** Build the default parser registry with built-in help parsers. */
export function createDefaultParserRegistry(): HelpParserRegistry {
  const reg = new HelpParserRegistry();
  reg.register(genericPlugin);
  reg.register(cobraPlugin);
  reg.register(azureCliPlugin);
  return reg;
}

/** Helper for tests: build a template artifact from a partial tool. */
export function makeTemplateArtifact(
  tool: Omit<ToolDefinition, "inputSchema" | "sources" | "source">,
  confidence = 0.5,
): DiscoveryArtifact {
  const defined = defineTool({ ...tool, source: "template" });
  return { tool: defined, kind: "template", confidence, key: defined.name };
}

/** Helper for tests: build a help artifact. */
export function makeHelpArtifact(
  tool: Omit<ToolDefinition, "inputSchema" | "sources" | "source">,
  confidence = 0.3,
): DiscoveryArtifact {
  const defined = defineTool({ ...tool, source: "help" });
  return { tool: defined, kind: "help", confidence, key: defined.name };
}

/**
 * Count final tools by their resolved source label. Used by refresh_tools and
 * runtime startup to emit a per-connector discovery summary. A tool whose
 * `source` is "mixed" (multiple sources contributed via mergeArtifacts) is
 * counted only under `mixed`.
 */
export function summarizeSources(tools: ToolDefinition[]): {
  yaml: number;
  template: number;
  help: number;
  mixed: number;
} {
  return {
    yaml: tools.filter((t) => t.source === "yaml").length,
    template: tools.filter((t) => t.source === "template").length,
    help: tools.filter((t) => t.source === "help").length,
    mixed: tools.filter((t) => t.source === "mixed").length,
  };
}
