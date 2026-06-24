import { execSync } from "node:child_process";

const winBinaryCache = new Map<string, string>();

/**
 * On Windows, bare names (git, gh) through cmd /s /c often fail with quoted argv.
 * Resolve to first full path from `where` when possible (same as interactive shell).
 * Results are cached per process — help BFS may spawn thousands of times.
 */
export function resolveSpawnBinary(binary: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== "win32") return binary;
  if (binary.includes("\\") || binary.includes("/") || /\.(exe|cmd|bat)$/i.test(binary)) {
    return binary;
  }
  const cached = winBinaryCache.get(binary);
  if (cached) return cached;
  try {
    const out = execSync(`where ${binary}`, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 3000,
      env: process.env,
    }).trim();
    const lines = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    // Azure CLI `where az` often lists a bash shim before az.cmd; spawn(shell:false) cannot run the shim.
    const cmdBat = lines.find((l) => /\.(cmd|bat)$/i.test(l));
    const resolved = cmdBat ?? lines[0] ?? binary;
    winBinaryCache.set(binary, resolved);
    return resolved;
  } catch {
    /* keep bare name */
  }
  winBinaryCache.set(binary, binary);
  return binary;
}

export function resolveArgvBinary(argv: string[]): string[] {
  if (argv.length === 0) return argv;
  return [resolveSpawnBinary(argv[0]), ...argv.slice(1)];
}