import { spawnSync } from "node:child_process";

const WIN_CACHE_TTL_MS = 60_000;

/** Safe bare binary name for `where.exe` (no path separators or shell metacharacters). */
const SAFE_BINARY_NAME = /^[A-Za-z0-9._+-]+$/;

type WinCacheEntry = { path: string; expiresAt: number };

const winBinaryCache = new Map<string, WinCacheEntry>();

function cacheKey(binary: string, env: NodeJS.ProcessEnv): string {
  const path = env.PATH ?? env.Path ?? "";
  return `${binary}\0${path}`;
}

/**
 * On Windows, bare names (git, gh) through cmd /s /c often fail with quoted argv.
 * Resolve to first full path from `where.exe` when possible (same as interactive shell).
 * Results are cached per process with a 60s TTL — help BFS may spawn thousands of times.
 */
export function resolveSpawnBinary(
  binary: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform !== "win32") return binary;
  if (binary.includes("\\") || binary.includes("/") || /\.(exe|cmd|bat)$/i.test(binary)) {
    return binary;
  }
  if (!SAFE_BINARY_NAME.test(binary)) {
    return binary;
  }
  const now = Date.now();
  const key = cacheKey(binary, env);
  const cached = winBinaryCache.get(key);
  if (cached && cached.expiresAt > now) return cached.path;

  try {
    const out = spawnSync("where.exe", [binary], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 3000,
      shell: false,
      env,
    });
    if (out.status !== 0 || !out.stdout) {
      throw new Error(out.stderr?.trim() || `where.exe exit ${out.status}`);
    }
    const text = String(out.stdout).trim();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    // Azure CLI `where az` often lists a bash shim before az.cmd; spawn(shell:false) cannot run the shim.
    const cmdBat = lines.find((l) => /\.(cmd|bat)$/i.test(l));
    const resolved = cmdBat ?? lines[0] ?? binary;
    winBinaryCache.set(key, { path: resolved, expiresAt: now + WIN_CACHE_TTL_MS });
    return resolved;
  } catch {
    /* keep bare name; do not negative-cache where failures */
    return binary;
  }
}

/** Clear Windows `where` cache (e.g. after config reload). */
export function clearWinBinaryCache(): void {
  winBinaryCache.clear();
}

export function resolveArgvBinary(
  argv: string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (argv.length === 0) return argv;
  return [resolveSpawnBinary(argv[0], platform, env), ...argv.slice(1)];
}