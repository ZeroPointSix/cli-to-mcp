import type { ToolRegistry } from "../registry/tool-registry.js";
import type { CommandExecutor } from "../executor/command-executor.js";
import type { ResolvedConnector } from "../config/config-loader.js";
import type { JsonSchema } from "../registry/tool-definition.js";
import { type McpHttpAuthConfig } from "./http-auth.js";
export type McpServerOptions = {
    host: string;
    port: number;
    registry: ToolRegistry;
    executor: CommandExecutor;
    connectors: Map<string, ResolvedConnector>;
    metaTools?: MetaToolHandlers;
    log?: (msg: string) => void;
    /** Override env; default readMcpHttpAuthFromEnv(). */
    httpAuth?: McpHttpAuthConfig;
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
    private readonly httpAuth;
    private httpServer;
    private readonly sessions;
    constructor(opts: McpServerOptions);
    sessionCount(): number;
    isHttpAuthEnabled(): boolean;
    private createSessionServer;
    start(): Promise<void>;
    private sessionIdFrom;
    private handleHttp;
    stop(): Promise<void>;
}
export declare class HttpBodyTooLargeError extends Error {
    readonly limit: number;
    constructor(limit: number);
}
