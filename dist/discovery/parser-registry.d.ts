/**
 * HelpParser plugin interface (ADR 0002) and a minimal registry.
 *
 * Selection order, per ADR §3.2:
 *   1. explicit plugin id from connector.discovery.parser
 *   2. highest match() score among registered plugins
 *   3. built-in `generic` fallback
 */
import type { DiscoveredCommand } from "./types.js";
export type HelpParserContext = {
    connectorName: string;
    binary: string;
    /** Subcommand path that produced this help, e.g. ["pr","view"]. */
    path: string[];
    rawHelp: string;
    exitCode: number | null;
};
export type HelpParserPlugin = {
    id: string;
    displayName: string;
    /** 0 = will not handle; higher = higher priority. */
    match(ctx: HelpParserContext): number;
    parse(ctx: HelpParserContext): DiscoveredCommand;
};
export declare class HelpParserRegistry {
    private plugins;
    register(plugin: HelpParserPlugin): void;
    list(): HelpParserPlugin[];
    /**
     * Select the plugin that would handle a parse, without invoking parse().
     * Mirrors parse()'s selection order: explicit id (if found) → highest match()
     * score → null. Used by HelpSource to log which parser was used per node.
     */
    selectPlugin(ctx: HelpParserContext, explicitId?: string): HelpParserPlugin | null;
    parse(ctx: HelpParserContext, explicitId?: string): DiscoveredCommand;
}
