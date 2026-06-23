/**
 * HelpRunner: execute `binary [path...] --help` and return raw help text.
 *
 * - Uses argv array, never shell.
 * - Tries stdout first; falls back to stderr (some CLIs print help to stderr).
 * - Strips ANSI before returning.
 * - Does not throw on non-zero exit; many CLIs exit 0 for --help, some exit 1.
 */
import { spawn } from "node:child_process";
import { stripAnsi } from "./plugins/generic.js";

export type RunHelpOptions = {
  /** Override base env (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Hard timeout for the help spawn. */
  timeoutMs?: number;
  /** Inserted after binary, before subcommand path (connector argv_prefix). */
  argvPrefix?: string[];
};

export type HelpOutput = {
  rawHelp: string;
  exitCode: number | null;
  /** Which stream the help text came from. */
  source: "stdout" | "stderr";
  timedOut: boolean;
};

export async function runHelp(
  binary: string,
  path: string[],
  opts: RunHelpOptions = {},
): Promise<HelpOutput> {
  const argv = [binary, ...(opts.argvPrefix ?? []), ...path, "--help"];
  const env = { ...(opts.env ?? process.env) };

  return new Promise<HelpOutput>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(argv[0], argv.slice(1), {
        env,
        cwd: opts.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      });
    } catch (err) {
      resolve({
        rawHelp: "",
        exitCode: null,
        source: "stdout",
        timedOut: false,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      }, opts.timeoutMs);
    }

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    child.on("error", () => {
      if (timer) clearTimeout(timer);
      resolve({ rawHelp: "", exitCode: null, source: "stdout", timedOut });
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const fromStdout = stdout.trim();
      const fromStderr = stderr.trim();
      if (fromStdout) {
        resolve({ rawHelp: stripAnsi(fromStdout), exitCode: code, source: "stdout", timedOut });
      } else if (fromStderr) {
        resolve({ rawHelp: stripAnsi(fromStderr), exitCode: code, source: "stderr", timedOut });
      } else {
        resolve({ rawHelp: "", exitCode: code, source: "stdout", timedOut });
      }
    });
  });
}
