/**
 * Example custom help parser — load once via top-level `parsers:` in cli-to-mcp.yaml.
 */
export const plugin = {
  id: "my-cli",
  displayName: "Example CLI",
  match(ctx) {
    return /Commands:\s*\n/i.test(ctx.rawHelp) ? 50 : 0;
  },
  parse(ctx) {
    const subcommands = [];
    let inCommands = false;
    for (const line of ctx.rawHelp.split("\n")) {
      const t = line.trim();
      if (/^commands:\s*$/i.test(t)) {
        inCommands = true;
        continue;
      }
      if (!t) {
        inCommands = false;
        continue;
      }
      if (inCommands) {
        const m = t.match(/^([a-z][\w-]*)\s+/i);
        if (m) subcommands.push(m[1]);
      }
    }
    return {
      connectorName: ctx.connectorName,
      path: ctx.path,
      rawHelp: ctx.rawHelp,
      args: [],
      subcommands: [...new Set(subcommands)],
    };
  },
};