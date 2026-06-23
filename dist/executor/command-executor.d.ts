import type { ToolDefinition } from "../registry/tool-definition.js";
export type ExecuteRequest = {
    tool: ToolDefinition;
    args: Record<string, unknown>;
    /** Override connector-level env / cwd / timeout. */
    env?: Record<string, string>;
    cwd?: string;
    timeoutMs?: number;
};
export type RawExecutionResult = {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
    signal?: string;
    /** ENOENT when binary missing. */
    binaryNotFound: boolean;
};
export type ExecuteOptions = {
    /** Base environment to inherit (defaults to process.env). */
    baseEnv?: NodeJS.ProcessEnv;
};
export declare class CommandExecutor {
    private readonly baseEnv;
    constructor(opts?: ExecuteOptions);
    execute(req: ExecuteRequest): Promise<RawExecutionResult>;
}
/**
 * Build the full argv: [binary, ...subcommandPath, ...userArgs, ...defaultArgs].
 * User args are emitted as --name value pairs (booleans emit --name only).
 * Repeatable (array) args emit the flag multiple times.
 */
export declare function buildArgv(tool: ToolDefinition, args: Record<string, unknown>): string[];
/**
 * Build a single argv flag token. Accepts bare names (R, json), short (-R), or long (--repo).
 * Never emits illegal triple-dash forms (e.g. ---R from alias "-R" + "--" prefix).
 */
export declare function flagFor(name: string): string;
