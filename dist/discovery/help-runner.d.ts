export type RunHelpOptions = {
    /** Override base env (defaults to process.env). */
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    /** Hard timeout for the help spawn. */
    timeoutMs?: number;
    /** Inserted after binary, before subcommand path (connector argv_prefix). */
    argvPrefix?: string[];
    helpArgv?: string[];
};
export type HelpOutput = {
    rawHelp: string;
    exitCode: number | null;
    /** Which stream the help text came from. */
    source: "stdout" | "stderr";
    timedOut: boolean;
};
export declare function runHelp(binary: string, path: string[], opts?: RunHelpOptions): Promise<HelpOutput>;
