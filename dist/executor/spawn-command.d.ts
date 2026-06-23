/**
 * Windows-safe spawn preparation: on win32, run via cmd.exe /d /s /c with quoted argv.
 * Unix: spawn argv[0] with argv.slice(1) directly (shell:false).
 */
export declare function prepareSpawnCommand(argv: string[], platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): {
    command: string;
    args: string[];
};
export declare function quoteWindowsCommand(argv: string[]): string;
