/**
 * Probe CLI reachability using the same spawn path as CommandExecutor (not shell exec).
 */
import { spawn } from "node:child_process";
import type { ResolvedConnector } from "../config/config-loader.js";
import { decodeChildOutput } from "./child-output.js";
import { appendChildOutput, maxChildOutputBytes } from "./output-limit.js";
import { prepareSpawnCommand } from "./spawn-command.js";
import { terminateChildProcess } from "./terminate-child.js";
import { resolveSpawnBinary } from "./resolve-binary.js";

export type BinaryProbeResult = {
  ok: boolean;
  tried_argv: string[];
  exit_code: number | null;
  timed_out: boolean;
  stderr_snippet: string;
  /** Windows: resolved path from `where`, or hint when bare name may fail. */
  resolved_binary?: string;
  hint?: string;
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
    let stderrTrunc = false;
    const outMax = maxChildOutputBytes();
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

    let killTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      terminateChildProcess(process.platform, child, "SIGTERM");
      killTimer = setTimeout(() => {
        terminateChildProcess(process.platform, child, "SIGKILL");
      }, 500);
    }, timeoutMs);

    child.stdout?.on("data", () => {
      /* drain stdout so probe cannot block on full pipe */
    });
    child.stderr?.on("data", (d) => {
      if (stderrTrunc) return;
      const r = appendChildOutput(stderr, decodeChildOutput(d), outMax);
      stderr = r.text;
      stderrTrunc = r.truncated;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
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
      if (killTimer) clearTimeout(killTimer);
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

function probeHints(
  connector: Pick<ResolvedConnector, "binary">,
  result: BinaryProbeResult,
  env: NodeJS.ProcessEnv = process.env,
): BinaryProbeResult {
  if (result.ok) return result;
  const binary = connector.binary;
  const isBare =
    process.platform === "win32" &&
    !binary.includes("\\") &&
    !binary.includes("/") &&
    !/\.(exe|cmd|bat)$/i.test(binary);
  const resolved =
    process.platform === "win32" ? resolveSpawnBinary(binary, process.platform, env) : binary;
  const out: BinaryProbeResult = {
    ...result,
    resolved_binary: process.platform === "win32" ? resolved : undefined,
  };
  if (isBare && resolved === binary) {
    out.hint =
      "On Windows, set connector.binary to the full path (e.g. C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd) when `where` fails.";
  } else if (isBare && resolved !== binary) {
    out.hint = `Resolved via where: ${resolved}`;
  }
  return out;
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
  if (v.ok) return probeHints(connector, v, env);
  const h = await probeArgv(argvForConnectorProbe(connector, ["--help"]), { cwd, env });
  return probeHints(connector, h, env);
}