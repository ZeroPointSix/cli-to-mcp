/** Reject connector-overridden ComSpec unless it resolves to cmd.exe. */
export declare function resolveWindowsComSpec(env: NodeJS.ProcessEnv): string;
export declare function prepareSpawnCommand(argv: string[], platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): {
    command: string;
    args: string[];
};
export declare function quoteWindowsCommand(argv: string[]): string;
