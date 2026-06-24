export type RunHelpOptions = {
    /** Override base env (defaults to process.env). */
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    /** Hard timeout for the help spawn. */
    timeoutMs?: number;
    /** Inserted after binary, before subcommand path (connector argv_prefix). */
    argvPrefix?: string[];
    helpArgv?: string[];
    /** When set, failed/empty help spawns are recorded for doctor(). */
    connectorName?: string;
};
export type HelpOutput = {
    rawHelp: string;
    exitCode: number | null;
    /** Which stream the help text came from. */
    source: "stdout" | "stderr";
    timedOut: boolean;
    /** Set when spawn() throws before the process starts. */
    spawnError?: string;
    stderrSnippet?: string;
};
export declare function runHelp(binary: string, path: string[], opts?: RunHelpOptions): Promise<HelpOutput>;
