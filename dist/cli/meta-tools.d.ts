import type { LoadedConfig, ResolvedConnector } from "../config/config-loader.js";
import type { InMemoryToolRegistry } from "../registry/tool-registry.js";
import type { CacheStore } from "../cache/db.js";
import type { HelpParserRegistry } from "../discovery/parser-registry.js";
export type MetaToolsDeps = {
    registry: InMemoryToolRegistry;
    cache: CacheStore;
    config: LoadedConfig;
    connectors: Map<string, ResolvedConnector>;
    /** Help parser registry; when omitted doctor reports parsers.registered=[] with a note. */
    parserRegistry?: HelpParserRegistry;
    log?: (msg: string) => void;
};
export type MetaToolHandlers = {
    has(name: string): boolean;
    call(name: string, args: Record<string, unknown>): Promise<unknown>;
    list(): Array<{
        name: string;
        description: string;
    }>;
};
export declare class MetaTools implements MetaToolHandlers {
    private deps;
    constructor(deps: MetaToolsDeps);
    list(): {
        name: string;
        description: string;
    }[];
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
