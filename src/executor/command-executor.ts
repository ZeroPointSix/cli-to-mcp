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
import type { ToolDefinition } from "../registry/tool-definition.js";
import { decodeChildOutput } from "./child-output.js";
import { appendChildOutput, maxChildOutputBytes } from "./output-limit.js";
import { prepareSpawnCommand } from "./spawn-command.js";
import { terminateChildProcess } from "./terminate-child.js";

export type ExecuteRequest = {
  tool: ToolDefinition;
  args: Record<string, unknown>;
  /** Override connector-level env / cwd / timeout. */
  env?: Record<string, string>;
  cwd?: string;
  timeoutMs?: number;
};

export type RawExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  signal?: string;
  /** ENOENT when binary missing. */
  binaryNotFound: boolean;
};

export type ExecuteOptions = {
  /** Base environment to inherit (defaults to process.env). */
  baseEnv?: NodeJS.ProcessEnv;
};

export class CommandExecutor {
  private readonly baseEnv: NodeJS.ProcessEnv;

  constructor(opts: ExecuteOptions = {}) {
    this.baseEnv = opts.baseEnv ?? process.env;
  }

  async execute(req: ExecuteRequest): Promise<RawExecutionResult> {
    const { tool, args } = req;
    const argv = buildArgv(tool, args);
    const env = { ...this.baseEnv, ...(req.env ?? {}) };
    const cwd = req.cwd ?? undefined;
    const timeoutMs = req.timeoutMs;

    const start = Date.now();
    return await new Promise<RawExecutionResult>((resolve) => {
      let child: ReturnType<typeof spawn>;
      try {
        const spawnCmd = prepareSpawnCommand(argv, process.platform, env);
        child = spawn(spawnCmd.command, spawnCmd.args, {
          env,
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
          windowsHide: true,
        });
      } catch (err) {
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
      let stdoutTrunc = false;
      let stderrTrunc = false;
      const outMax = maxChildOutputBytes();
      let timedOut = false;
      let timer: NodeJS.Timeout | undefined;
      let killTimer: NodeJS.Timeout | undefined;

      if (timeoutMs !== undefined && timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          terminateChildProcess(process.platform, child, "SIGTERM");
          killTimer = setTimeout(() => {
            terminateChildProcess(process.platform, child, "SIGKILL");
          }, 500);
        }, timeoutMs);
      }

      child.stdout?.on("data", (d) => {
        if (stdoutTrunc) return;
        const chunk = decodeChildOutput(d);
        const r = appendChildOutput(stdout, chunk, outMax);
        stdout = r.text;
        stdoutTrunc = r.truncated;
      });
      child.stderr?.on("data", (d) => {
        if (stderrTrunc) return;
        const chunk = decodeChildOutput(d);
        const r = appendChildOutput(stderr, chunk, outMax);
        stderr = r.text;
        stderrTrunc = r.truncated;
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        if (timer) clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
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
        if (timer) clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
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
 * Build the full argv: [binary, ...subcommandPath, positionals, flags/options, ...defaultArgs].
 * Options emit as --name value; flags as --name only; positionals as bare tokens in order.
 */
export function buildArgv(tool: ToolDefinition, args: Record<string, unknown>): string[] {
  const argv: string[] = [tool.binary, ...(tool.argvPrefix ?? []), ...tool.command];
  const sorted = sortArgsForArgv(tool.args);
  appendArgs(argv, sorted, args);
  if (tool.defaultArgs) argv.push(...tool.defaultArgs);
  return argv;
}

export function sortArgsForArgv(decl: ToolDefinition["args"]): ToolDefinition["args"] {
  const indexed = decl.map((a, i) => ({ a, i }));
  return indexed
    .sort((x, y) => {
      const xp = effectiveArgKind(x.a) === "positional" ? 0 : 1;
      const yp = effectiveArgKind(y.a) === "positional" ? 0 : 1;
      if (xp !== yp) return xp - yp;
      if (xp === 0) return (x.a.position ?? x.i) - (y.a.position ?? y.i);
      return x.i - y.i;
    })
    .map((x) => x.a);
}

function effectiveArgKind(arg: ToolDefinition["args"][number]): "flag" | "option" | "positional" {
  if (arg.kind) return arg.kind;
  if (arg.type === "boolean") return "flag";
  return "option";
}

function appendArgs(
  argv: string[],
  decl: ToolDefinition["args"],
  values: Record<string, unknown>,
): void {
  for (const arg of decl) {
    const v = values[arg.name];
    if (v === undefined || v === null) continue;
    const kind = effectiveArgKind(arg);
    if (kind === "positional") {
      appendPositionalValue(argv, arg, v);
      continue;
    }
    const flag = flagFor(resolveFlagName(arg));
    if (kind === "flag" || arg.type === "boolean") {
      if (v) argv.push(flag);
      continue;
    }
    const multi =
      (arg.type === "array" && Array.isArray(v)) ||
      (arg.repeatable && Array.isArray(v));
    if (multi) {
      for (const item of v as unknown[]) {
        argv.push(flag, String(item));
      }
      continue;
    }
    argv.push(flag, String(v));
  }
}

function appendPositionalValue(
  argv: string[],
  arg: ToolDefinition["args"][number],
  v: unknown,
): void {
  if (arg.type === "array" && Array.isArray(v)) {
    for (const item of v) argv.push(String(item));
    return;
  }
  if (arg.repeatable && Array.isArray(v)) {
    for (const item of v) argv.push(String(item));
    return;
  }
  argv.push(String(v));
}

/** CLI flag name: first alias wins when declared in YAML (e.g. aliases: [j] → -j). */
function resolveFlagName(arg: ToolDefinition["args"][number]): string {
  const alias = arg.aliases?.find((a) => a.length > 0);
  return alias ?? arg.name;
}

/**
 * Build a single argv flag token. Accepts bare names (R, json), short (-R), or long (--repo).
 * Never emits illegal triple-dash forms (e.g. ---R from alias "-R" + "--" prefix).
 */
export function flagFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("--")) return trimmed;
  if (trimmed.startsWith("-") && trimmed.length > 1) return trimmed;
  const core = trimmed.replace(/^-+/, "");
  if (!core) return trimmed;
  return core.length === 1 ? `-${core}` : `--${core}`;
}
