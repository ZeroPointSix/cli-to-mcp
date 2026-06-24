import type { ToolRegistry } from "../registry/tool-registry.js";
import type { CommandExecutor } from "../executor/command-executor.js";
import type { ResolvedConnector } from "../config/config-loader.js";
import type { JsonSchema } from "../registry/tool-definition.js";
export type McpServerOptions = {
    host: string;
    port: number;
    registry: ToolRegistry;
    executor: CommandExecutor;
    connectors: Map<string, ResolvedConnector>;
    metaTools?: MetaToolHandlers;
    log?: (msg: string) => void;
};
export type MetaToolHandlers = {
    has(name: string): boolean;
    call(name: string, args: Record<string, unknown>): Promise<unknown>;
    list(): Array<{
        name: string;
        description: string;
        inputSchema?: JsonSchema;
    }>;
};
export declare class CliToMcpServer {
    private readonly opts;
    private httpServer;
    private readonly sessions;
    constructor(opts: McpServerOptions);
    private createSessionServer;
    start(): Promise<void>;
    private sessionIdFrom;
    private handleHttp;
    stop(): Promise<void>;
}
