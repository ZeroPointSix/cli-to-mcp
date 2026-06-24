/**
 * HelpRunner: execute `binary [path...] --help` and return raw help text.
 *
 * - Uses argv array, never shell.
 * - Tries stdout first; falls back to stderr (some CLIs print help to stderr).
 * - Strips ANSI before returning.
 * - Does not throw on non-zero exit; many CLIs exit 0 for --help, some exit 1.
 */
import { spawn } from "node:child_process";
import { decodeChildOutput } from "../executor/child-output.js";
import { appendChildOutput, maxChildOutputBytes } from "../executor/output-limit.js";
import { prepareSpawnCommand } from "../executor/spawn-command.js";
import { terminateChildProcess } from "../executor/terminate-child.js";
import { recordLastHelpSpawnError } from "./help-spawn-diagnostics.js";
import { stripAnsi } from "./plugins/generic.js";
export async function runHelp(binary, path, opts = {}) {
    const helpTail = opts.helpArgv?.length ? opts.helpArgv : ["--help"];
    const argv = [binary, ...(opts.argvPrefix ?? []), ...path, ...helpTail];
    const env = { ...(opts.env ?? process.env) };
    return new Promise((resolve) => {
        let child;
        try {
            const spawnCmd = prepareSpawnCommand(argv, process.platform, env);
            child = spawn(spawnCmd.command, spawnCmd.args, {
                env,
                cwd: opts.cwd,
                stdio: ["ignore", "pipe", "pipe"],
                shell: false,
                windowsHide: true,
            });
        }
        catch (err) {
            const spawnError = String(err);
            recordHelpFailure(opts, binary, path, spawnError, null, false);
            resolve({
                rawHelp: "",
                exitCode: null,
                source: "stdout",
                timedOut: false,
                spawnError,
            });
            return;
        }
        let stdout = "";
        let stderr = "";
        let stdoutTrunc = false;
        let stderrTrunc = false;
        const outMax = maxChildOutputBytes();
        let timedOut = false;
        let timer;
        let killTimer;
        if (opts.timeoutMs) {
            timer = setTimeout(() => {
                timedOut = true;
                terminateChildProcess(process.platform, child, "SIGTERM");
                killTimer = setTimeout(() => {
                    terminateChildProcess(process.platform, child, "SIGKILL");
                }, 500);
            }, opts.timeoutMs);
        }
        child.stdout?.on("data", (d) => {
            if (stdoutTrunc)
                return;
            const r = appendChildOutput(stdout, decodeChildOutput(d), outMax);
            stdout = r.text;
            stdoutTrunc = r.truncated;
        });
        child.stderr?.on("data", (d) => {
            if (stderrTrunc)
                return;
            const r = appendChildOutput(stderr, decodeChildOutput(d), outMax);
            stderr = r.text;
            stderrTrunc = r.truncated;
        });
        child.on("error", (err) => {
            if (timer)
                clearTimeout(timer);
            if (killTimer)
                clearTimeout(killTimer);
            const spawnError = String(err);
            recordHelpFailure(opts, binary, path, spawnError, null, timedOut, stderr.trim());
            resolve({
                rawHelp: "",
                exitCode: null,
                source: "stdout",
                timedOut,
                spawnError,
                stderrSnippet: stderr.trim().slice(0, 300),
            });
        });
        child.on("close", (code) => {
            if (timer)
                clearTimeout(timer);
            if (killTimer)
                clearTimeout(killTimer);
            const fromStdout = stdout.trim();
            const fromStderr = stderr.trim();
            if (fromStdout) {
                resolve({ rawHelp: stripAnsi(fromStdout), exitCode: code, source: "stdout", timedOut });
            }
            else if (fromStderr) {
                resolve({ rawHelp: stripAnsi(fromStderr), exitCode: code, source: "stderr", timedOut });
            }
            else {
                const message = timedOut
                    ? "help subprocess timed out with no output"
                    : "help subprocess produced no stdout/stderr";
                recordHelpFailure(opts, binary, path, message, code, timedOut, fromStderr);
                resolve({
                    rawHelp: "",
                    exitCode: code,
                    source: "stdout",
                    timedOut,
                    stderrSnippet: fromStderr.slice(0, 300) || undefined,
                });
            }
        });
    });
}
function recordHelpFailure(opts, binary, path, message, exitCode, timedOut, stderrSnippet) {
    if (!opts.connectorName)
        return;
    recordLastHelpSpawnError({
        connector_name: opts.connectorName,
        binary,
        path: [...path],
        message,
        exit_code: exitCode,
        timed_out: timedOut,
        stderr_snippet: stderrSnippet?.slice(0, 300),
    });
}
//# sourceMappingURL=help-runner.js.map