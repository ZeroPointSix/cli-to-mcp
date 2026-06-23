export class HelpParserRegistry {
    plugins = [];
    register(plugin) {
        this.plugins.push(plugin);
    }
    list() {
        return [...this.plugins];
    }
    /**
     * Select the plugin that would handle a parse, without invoking parse().
     * Mirrors parse()'s selection order: explicit id (if found) → highest match()
     * score → null. Used by HelpSource to log which parser was used per node.
     */
    selectPlugin(ctx, explicitId) {
        if (explicitId) {
            const p = this.plugins.find((pl) => pl.id === explicitId);
            if (p)
                return p;
        }
        let best = null;
        let bestScore = 0;
        for (const p of this.plugins) {
            const score = safeMatch(p, ctx);
            if (score > bestScore) {
                best = p;
                bestScore = score;
            }
        }
        return best;
    }
    parse(ctx, explicitId) {
        const p = this.selectPlugin(ctx, explicitId);
        if (p)
            return safeParse(p, ctx);
        // Should never happen because generic returns 1, but guard anyway.
        throw new Error("no help parser registered");
    }
}
function safeParse(p, ctx) {
    try {
        return p.parse(ctx);
    }
    catch (err) {
        // Plugin failure: fall back to a minimal command preserving rawHelp.
        return {
            connectorName: ctx.connectorName,
            path: ctx.path,
            rawHelp: ctx.rawHelp,
            description: undefined,
            usage: undefined,
            args: [],
            subcommands: [],
        };
    }
}
function safeMatch(p, ctx) {
    try {
        return p.match(ctx);
    }
    catch {
        return 0;
    }
}
