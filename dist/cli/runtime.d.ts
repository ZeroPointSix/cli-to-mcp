/**
 * Runtime: orchestrates startup flow (architecture §6.1).
 */
import { type LoadedConfig } from "../config/config-loader.js";
import { CacheStore } from "../cache/db.js";
import { InMemoryToolRegistry } from "../registry/tool-registry.js";
import { CommandExecutor } from "../executor/command-executor.js";
import { CliToMcpServer } from "../mcp/server.js";
import { MetaTools } from "./meta-tools.js";
import { type BackgroundDiscoveryHandle, type BackgroundDiscoveryStatus } from "./background-discovery.js";
export type ServeOptions = {
    host: string;
    port: number;
    config: string;
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
    backgroundDiscovery: BackgroundDiscoveryHandle | null;
    backgroundDiscoveryStatus: () => BackgroundDiscoveryStatus | null;
    stop(): Promise<void>;
};
export declare function startRuntime(opts: ServeOptions): Promise<Runtime>;
