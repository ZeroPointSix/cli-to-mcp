/**
 * Windows-safe spawn preparation: on win32, run via cmd.exe /d /s /c with quoted argv.
 * Unix: spawn argv[0] with argv.slice(1) directly (shell:false).
 */
import { resolveSpawnBinary } from "./resolve-binary.js";

/** Reject connector-overridden ComSpec unless it resolves to cmd.exe. */
export function resolveWindowsComSpec(env: NodeJS.ProcessEnv): string {
  const raw = (env.ComSpec || "cmd.exe").trim();
  if (!raw) return "cmd.exe";
  const lower = raw.toLowerCase().replace(/\//g, "\\");
  if (!raw.includes("\\") && !raw.includes("/")) {
    if (lower === "cmd.exe") return raw;
    throw new Error(`unsafe ComSpec (bare name): ${raw}`);
  }
  if (lower.includes("..")) throw new Error(`unsafe ComSpec path: ${raw}`);
  if (!lower.endsWith("\\cmd.exe")) {
    throw new Error(`ComSpec must be cmd.exe: ${raw}`);
  }
  return raw;
}

export function prepareSpawnCommand(
  argv: string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] } {
  if (argv.length === 0) throw new Error("cannot spawn an empty argv");
  const resolvedArgv =
    platform === "win32" ? [resolveSpawnBinary(argv[0], platform, env), ...argv.slice(1)] : argv;
  if (platform === "win32") {
    const bin = resolvedArgv[0];
    const lower = bin.toLowerCase();
    const isCmdScript = lower.endsWith(".cmd") || lower.endsWith(".bat");
    const isBareName = !bin.includes("\\") && !bin.includes("/");
    const needsCmdShim = isBareName || isCmdScript;
    if (needsCmdShim) {
      const comspec = resolveWindowsComSpec(env);
      // Full-path .cmd/.bat: `cmd /d /c path arg...` (Node argv). `/s /c` one-string quoting breaks Azure CLI az.cmd.
      if (isCmdScript && !isBareName) {
        return { command: comspec, args: ["/d", "/c", bin, ...resolvedArgv.slice(1)] };
      }
      return {
        command: comspec,
        args: ["/d", "/s", "/c", quoteWindowsCommand(resolvedArgv)],
      };
    }
  }
  return { command: resolvedArgv[0], args: resolvedArgv.slice(1) };
}

export function quoteWindowsCommand(argv: string[]): string {
  return argv.map(quoteWindowsArg).join(" ");
}

function quoteWindowsArg(value: string): string {
  const raw = String(value);
  if (raw.length === 0) return '""';
  const escaped = raw.replace(/["^&|<>()%!]/g, (ch) => `^${ch}`);
  return `"${escaped}"`;
}