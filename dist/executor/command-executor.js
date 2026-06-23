/**
 * CommandExecutor: spawn a local CLI per ToolDefinition + args.
 *
 * Phase 1 stability rules (architecture §4.5, §5.9):
 * - Never join argv into a shell string. Pass argv array to spawn with
 *   shell:false so user input cannot inject shell metacharacters.
 * - Inherit process.env by default, overlay connector env on top.
 * - Honor cwd, timeout, capture stdout/stderr/exitCode/duration.
 */
import { spawn } from "node:child_process";
import { prepareSpawnCommand } from "./spawn-command.js";
export class CommandExecutor {
    baseEnv;
    constructor(opts = {}) {
        this.baseEnv = opts.baseEnv ?? process.env;
    }
    async execute(req) {
        const { tool, args } = req;
        const argv = buildArgv(tool, args);
        const env = { ...this.baseEnv, ...(req.env ?? {}) };
        const cwd = req.cwd ?? undefined;
        const timeoutMs = req.timeoutMs;
        const start = Date.now();
        return await new Promise((resolve) => {
            let child;
            try {
                const spawnCmd = prepareSpawnCommand(argv);
                child = spawn(spawnCmd.command, spawnCmd.args, {
                    env,
                    cwd,
                    stdio: ["ignore", "pipe", "pipe"],
                    shell: false,
                    windowsHide: true,
                });
            }
            catch (err) {
                resolve({
                    exitCode: null,
                    stdout: "",
                    stderr: String(err),
                    durationMs: Date.now() - start,
                    timedOut: false,
                    binaryNotFound: true,
                });
                return;
            }
            let stdout = "";
            let stderr = "";
            let timedOut = false;
            let timer;
            if (timeoutMs !== undefined && timeoutMs > 0) {
                timer = setTimeout(() => {
                    timedOut = true;
                    try {
                        child.kill("SIGTERM");
                    }
                    catch {
                        /* ignore */
                    }
                    setTimeout(() => {
                        try {
                            child.kill("SIGKILL");
                        }
                        catch {
                            /* ignore */
                        }
                    }, 500);
                }, timeoutMs);
            }
            child.stdout?.on("data", (d) => {
                stdout += d.toString();
            });
            child.stderr?.on("data", (d) => {
                stderr += d.toString();
            });
            child.on("error", (err) => {
                if (timer)
                    clearTimeout(timer);
                resolve({
                    exitCode: null,
                    stdout,
                    stderr: stderr + String(err),
                    durationMs: Date.now() - start,
                    timedOut,
                    binaryNotFound: err.code === "ENOENT",
                });
            });
            child.on("close", (code, signal) => {
                if (timer)
                    clearTimeout(timer);
                resolve({
                    exitCode: code,
                    stdout,
                    stderr,
                    durationMs: Date.now() - start,
                    timedOut,
                    signal: signal ?? undefined,
                    binaryNotFound: false,
                });
            });
        });
    }
}
/**
 * Build the full argv: [binary, ...subcommandPath, ...userArgs, ...defaultArgs].
 * User args are emitted as --name value pairs (booleans emit --name only).
 * Repeatable (array) args emit the flag multiple times.
 */
export function buildArgv(tool, args) {
    const argv = [tool.binary, ...(tool.argvPrefix ?? []), ...tool.command];
    appendArgs(argv, tool.args, args);
    if (tool.defaultArgs)
        argv.push(...tool.defaultArgs);
    return argv;
}
function appendArgs(argv, decl, values) {
    for (const arg of decl) {
        const v = values[arg.name];
        if (v === undefined || v === null)
            continue;
        const flag = flagFor(resolveFlagName(arg));
        if (arg.type === "boolean") {
            if (v)
                argv.push(flag);
            continue;
        }
        const multi = (arg.type === "array" && Array.isArray(v)) ||
            (arg.repeatable && Array.isArray(v));
        if (multi) {
            for (const item of v) {
                argv.push(flag, String(item));
            }
            continue;
        }
        argv.push(flag, String(v));
    }
}
/** CLI flag name: first alias wins when declared in YAML (e.g. aliases: [j] → -j). */
function resolveFlagName(arg) {
    const alias = arg.aliases?.find((a) => a.length > 0);
    return alias ?? arg.name;
}
/**
 * Build a single argv flag token. Accepts bare names (R, json), short (-R), or long (--repo).
 * Never emits illegal triple-dash forms (e.g. ---R from alias "-R" + "--" prefix).
 */
export function flagFor(name) {
    const trimmed = name.trim();
    if (!trimmed)
        return trimmed;
    if (trimmed.startsWith("--"))
        return trimmed;
    if (trimmed.startsWith("-") && trimmed.length > 1)
        return trimmed;
    const core = trimmed.replace(/^-+/, "");
    if (!core)
        return trimmed;
    return core.length === 1 ? `-${core}` : `--${core}`;
}
//# sourceMappingURL=command-executor.js.map