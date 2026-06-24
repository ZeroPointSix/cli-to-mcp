/**
 * Windows-safe spawn preparation: on win32, run via cmd.exe /d /s /c with quoted argv.
 * Unix: spawn argv[0] with argv.slice(1) directly (shell:false).
 */
import { resolveSpawnBinary } from "./resolve-binary.js";
export function prepareSpawnCommand(argv, platform = process.platform, env = process.env) {
    if (argv.length === 0)
        throw new Error("cannot spawn an empty argv");
    const resolvedArgv = platform === "win32" ? [resolveSpawnBinary(argv[0], platform), ...argv.slice(1)] : argv;
    if (platform === "win32") {
        const bin = resolvedArgv[0];
        const lower = bin.toLowerCase();
        const isCmdScript = lower.endsWith(".cmd") || lower.endsWith(".bat");
        const isBareName = !bin.includes("\\") && !bin.includes("/");
        const needsCmdShim = isBareName || isCmdScript;
        if (needsCmdShim) {
            const comspec = env.ComSpec || "cmd.exe";
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
export function quoteWindowsCommand(argv) {
    return argv.map(quoteWindowsArg).join(" ");
}
function quoteWindowsArg(value) {
    const raw = String(value);
    if (raw.length === 0)
        return '""';
    const escaped = raw.replace(/["^&|<>()%!]/g, (ch) => `^${ch}`);
    return `"${escaped}"`;
}
//# sourceMappingURL=spawn-command.js.map