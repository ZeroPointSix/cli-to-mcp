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
import { TemplateRegistry } from "./template-registry.js";
import { runHelp } from "./help-runner.js";
import { HelpParserRegistry } from "./parser-registry.js";
import type { CacheStore } from "../cache/db.js";
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
export declare function mergeArtifacts(artifacts: DiscoveryArtifact[]): ToolDefinition[];
/**
 * YamlSource: turns explicit `tools:` declarations into tools.
 * Highest priority — user YAML always wins over auto-discovered tools.
 */
export declare class YamlSource implements DiscoverySource {
    readonly kind: "yaml";
    discover(connector: ResolvedConnector, config: LoadedConfig): Promise<DiscoveryArtifact[]>;
}
/**
 * TemplateSource: built-in connector packs (ADR 0003 §"Connector Template").
 *
 * When a connector matches a registered pack — either by name (auto-match) or
 * via `discovery.template: <id>` — every tool in the pack becomes a template
 * artifact. Template confidence (0.85) sits above help (~0.35) and below yaml
 * (1.0), so user YAML still wins on conflicts.
 */
export declare class TemplateSource implements DiscoverySource {
    readonly kind: "template";
    private registry;
    constructor(registry?: TemplateRegistry);
    withRegistry(registry: TemplateRegistry): this;
    discover(connector: ResolvedConnector, _config: LoadedConfig): Promise<DiscoveryArtifact[]>;
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
export declare class HelpSource implements DiscoverySource {
    readonly kind: "help";
    private parserRegistry;
    private runHelpFn;
    private log;
    private cache?;
    constructor(opts?: {
        parserRegistry?: HelpParserRegistry;
        runHelpFn?: typeof runHelp;
        log?: (msg: string) => void;
        cache?: CacheStore;
    });
    discover(connector: ResolvedConnector, _config: LoadedConfig): Promise<DiscoveryArtifact[]>;
}
/** Build the default parser registry with generic + cobra registered. */
export declare function createDefaultParserRegistry(): HelpParserRegistry;
/** Helper for tests: build a template artifact from a partial tool. */
export declare function makeTemplateArtifact(tool: Omit<ToolDefinition, "inputSchema" | "sources" | "source">, confidence?: number): DiscoveryArtifact;
/** Helper for tests: build a help artifact. */
export declare function makeHelpArtifact(tool: Omit<ToolDefinition, "inputSchema" | "sources" | "source">, confidence?: number): DiscoveryArtifact;
/**
 * Count final tools by their resolved source label. Used by refresh_tools and
 * runtime startup to emit a per-connector discovery summary. A tool whose
 * `source` is "mixed" (multiple sources contributed via mergeArtifacts) is
 * counted only under `mixed`.
 */
export declare function summarizeSources(tools: ToolDefinition[]): {
    yaml: number;
    template: number;
    help: number;
    mixed: number;
};
