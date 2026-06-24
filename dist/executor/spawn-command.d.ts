export declare function prepareSpawnCommand(argv: string[], platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): {
    command: string;
    args: string[];
};
export declare function quoteWindowsCommand(argv: string[]): string;
