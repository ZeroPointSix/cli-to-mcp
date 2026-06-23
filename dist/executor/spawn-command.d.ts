export type PreparedSpawnCommand = {
    command: string;
    args: string[];
};
export declare function prepareSpawnCommand(argv: string[], platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): PreparedSpawnCommand;
export declare function quoteWindowsCommand(argv: string[]): string;
