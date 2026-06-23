import type { ResolvedConnector, ResolvedTool } from "../config/config-loader.js";
export type TemplatePack = {
    /** Pack id, e.g. "gh". Used by `discovery.template`. */
    id: string;
    /** Connector names that auto-match this pack when no explicit id is set. */
    connectorNames: string[];
    /** Tool declarations keyed by tool name, already validated against ToolDecl. */
    tools: Record<string, ResolvedTool>;
};
export declare class TemplateRegistry {
    private packs;
    constructor(packs?: TemplatePack[]);
    register(pack: TemplatePack): void;
    list(): TemplatePack[];
    resolve(connector: ResolvedConnector): TemplatePack | null;
}
/**
 * Load every `templates/*.yaml` pack at startup. Missing dir is not an error —
 * returns an empty registry so the runtime still works without built-in packs.
 *
 * Searches a few candidate locations so the same code works whether the entry
 * is run from `dist/` (compiled), `src/` (vitest), or the package root (npx):
 *   1. <cwd>/templates
 *   2. <this file's dir>/../templates
 *   3. <this file's dir>/../../templates
 */
export declare function loadBuiltinPacks(dir?: string): TemplateRegistry;
