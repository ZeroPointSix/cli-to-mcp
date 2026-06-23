export function prepareSpawnCommand(argv, platform = process.platform, env = process.env) {
    if (argv.length === 0)
        throw new Error("cannot spawn an empty argv");
    if (platform === "win32") {
        return {
            command: env.ComSpec || "cmd.exe",
            args: ["/d", "/s", "/c", quoteWindowsCommand(argv)],
        };
    }
    return { command: argv[0], args: argv.slice(1) };
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
