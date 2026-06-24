/**
 * Probe CLI reachability using the same spawn path as CommandExecutor (not shell exec).
 */
import { spawn } from "node:child_process";
import type { ResolvedConnector } from "../config/config-loader.js";
import { prepareSpawnCommand } from "./spawn-command.js";

export type BinaryProbeResult = {
  ok: boolean;
  tried_argv: string[];
  exit_code: number | null;
  timed_out: boolean;
  stderr_snippet: string;
};

export function argvForConnectorProbe(
  connector: Pick<ResolvedConnector, "binary" | "argv_prefix">,
  tail: string[],
): string[] {
  const prefix = connector.argv_prefix ?? [];
  return [connector.binary, ...prefix, ...tail];
}

export function probeArgv(
  argv: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<BinaryProbeResult> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const env = opts.env ?? process.env;
  const tried_argv = [...argv];

  return new Promise((resolve) => {
    let stderr = "";
    let timedOut = false;
    let child: ReturnType<typeof spawn>;
    try {
      const spawnCmd = prepareSpawnCommand(argv, process.platform, env);
      child = spawn(spawnCmd.command, spawnCmd.args, {
        env,
        cwd: opts.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
      });
    } catch (err) {
      resolve({
        ok: false,
        tried_argv,
        exit_code: null,
        timed_out: false,
        stderr_snippet: String(err).slice(0, 200),
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        tried_argv,
        exit_code: null,
        timed_out: timedOut,
        stderr_snippet: (stderr + String(err)).slice(0, 300),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        tried_argv,
        exit_code: code,
        timed_out: timedOut,
        stderr_snippet: stderr.trim().slice(0, 300),
      });
    });
  });
}

/** Same probe logic as tool execution: --version then --help. */
export async function probeConnectorBinary(
  connector: ResolvedConnector,
  env: NodeJS.ProcessEnv = process.env,
): Promise<BinaryProbeResult> {
  const cwd = connector.working_dir ?? undefined;
  const v = await probeArgv(argvForConnectorProbe(connector, ["--version"]), {
    cwd,
    env,
  });
  if (v.ok) return v;
  const h = await probeArgv(argvForConnectorProbe(connector, ["--help"]), { cwd, env });
  return h;
}