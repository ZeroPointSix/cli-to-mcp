/**
 * Windows-safe spawn preparation: on win32, run via cmd.exe /d /s /c with quoted argv.
 * Unix: spawn argv[0] with argv.slice(1) directly (shell:false).
 */
export function prepareSpawnCommand(
  argv: string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] } {
  if (argv.length === 0) throw new Error("cannot spawn an empty argv");
  if (platform === "win32") {
    const bin = argv[0];
    const lower = bin.toLowerCase();
    const needsCmdShim =
      (!bin.includes("\\") && !bin.includes("/")) ||
      lower.endsWith(".cmd") ||
      lower.endsWith(".bat");
    if (needsCmdShim) {
      return {
        command: env.ComSpec || "cmd.exe",
        args: ["/d", "/s", "/c", quoteWindowsCommand(argv)],
      };
    }
  }
  return { command: argv[0], args: argv.slice(1) };
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