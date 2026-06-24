import type { LoadedConfig, ResolvedConnector } from "../config/config-loader.js";
import type { InMemoryToolRegistry } from "../registry/tool-registry.js";
import type { CacheStore } from "../cache/db.js";
import type { HelpParserRegistry } from "../discovery/parser-registry.js";
import type { CommandExecutor } from "../executor/command-executor.js";
import type { BackgroundDiscoveryStatus } from "./background-discovery.js";
export type MetaToolsDeps = {
    registry: InMemoryToolRegistry;
    cache: CacheStore;
    config: LoadedConfig;
    connectors: Map<string, ResolvedConnector>;
    executor?: CommandExecutor;
    /** Help parser registry; when omitted doctor reports parsers.registered=[] with a note. */
    parserRegistry?: HelpParserRegistry;
    log?: (msg: string) => void;
    getBackgroundDiscoveryStatus?: () => BackgroundDiscoveryStatus | null;
};
export type MetaToolHandlers = {
    has(name: string): boolean;
    call(name: string, args: Record<string, unknown>): Promise<unknown>;
    list(): Array<{
        name: string;
        description: string;
        inputSchema?: import("../registry/tool-definition.js").JsonSchema;
    }>;
};
export declare class MetaTools implements MetaToolHandlers {
    private deps;
    constructor(deps: MetaToolsDeps);
    list(): import("./meta-tool-schemas.js").MetaToolListEntry[];
    has(name: string): boolean;
    call(name: string, args: Record<string, unknown>): Promise<unknown>;
    private listConnectors;
    private doctor;
    private refreshTools;
    private getSkills;
    private getToolSource;
}
/**
 * Resolve a user-provided relative path under skill_root. Rejects `..`, absolute
 * paths, and any result that escapes the root directory.
 */
export declare function resolvePathUnderSkillRoot(skillRoot: string, relativePath: string): {
    ok: true;
    abs: string;
} | {
    ok: false;
    error: string;
};
