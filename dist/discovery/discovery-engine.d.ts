/**
 * DiscoveryEngine: run all sources for a connector and merge results.
 *
 * Architecture §4.3 / ADR 0003 priority: help < template < user YAML.
 * The engine runs every source, then mergeArtifacts applies that priority.
 *
 * Default sources are wired with built-in template packs (templates/*.yaml)
 * and a help parser registry (generic + cobra). Callers can inject custom
 * sources for testing.
 */
import type { LoadedConfig, ResolvedConnector } from "../config/config-loader.js";
import type { ToolDefinition } from "../registry/tool-definition.js";
import { type DiscoverySource } from "./sources.js";
export declare class DiscoveryEngine {
    private sources;
    constructor(sources?: DiscoverySource[]);
    discover(connector: ResolvedConnector, config: LoadedConfig): Promise<ToolDefinition[]>;
}
