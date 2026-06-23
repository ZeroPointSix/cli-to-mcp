/**
 * Runtime: orchestrates startup flow (architecture §6.1).
 *
 *   load config -> load cache -> discovery -> registry -> start MCP server
 *
 * On startup we prefer cached ToolDefinitions. If cache is empty for the
 * current configHash, we run discovery and persist results. Refresh failure
 * never wipes old cache.
 */
import { type LoadedConfig } from "../config/config-loader.js";
import { CacheStore } from "../cache/db.js";
import { InMemoryToolRegistry } from "../registry/tool-registry.js";
import { CommandExecutor } from "../executor/command-executor.js";
import { CliToMcpServer } from "../mcp/server.js";
import { MetaTools } from "./meta-tools.js";
export type ServeOptions = {
    host: string;
    port: number;
    config: string;
    /** Override cache DB path. Defaults to ./.cli-to-mcp/cache.sqlite. */
    cachePath?: string;
    log?: (msg: string) => void;
};
export type Runtime = {
    config: LoadedConfig;
    registry: InMemoryToolRegistry;
    cache: CacheStore;
    executor: CommandExecutor;
    server: CliToMcpServer;
    metaTools: MetaTools;
    stop(): Promise<void>;
};
export declare function startRuntime(opts: ServeOptions): Promise<Runtime>;
