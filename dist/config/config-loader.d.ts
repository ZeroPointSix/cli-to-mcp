import { type Config, type ConnectorConfig, type ToolDecl } from "./schema.js";
export type LoadedConfig = {
    config: Config;
    runtime: Config["runtime"];
    /** Absolute directory of the config file, used as base for relative paths. */
    configDir: string;
    /** Absolute paths to custom parser modules from top-level `parsers:`. */
    parserModules: string[];
    /** Connectors with relative paths resolved to absolute. */
    connectors: ResolvedConnector[];
    /** Tools keyed by name with relative skill paths resolved. */
    tools: Record<string, ResolvedTool>;
    /** Hex hash of the raw file contents, used by cache invalidation. */
    configHash: string;
};
export type ResolvedConnector = Omit<ConnectorConfig, "skills" | "working_dir" | "discovery" | "skill_root"> & {
    skills: string[];
    working_dir: string | null;
    /** Absolute skill directory when configured; otherwise null. */
    skill_root: string | null;
    discovery: ConnectorConfig["discovery"] & {
        parser_module?: string;
    };
};
export type ResolvedTool = Omit<ToolDecl, "skills"> & {
    skills: string[];
};
export declare class ConfigLoader {
    load(configPath: string): LoadedConfig;
}
