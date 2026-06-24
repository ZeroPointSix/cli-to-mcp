import { genericPlugin } from "./generic.js";
import { parseCobraHelp } from "./cobra-parse.js";
export const cobraPlugin = {
    id: "cobra",
    displayName: "Cobra-style (gh, many Go CLIs)",
    match(ctx) {
        const h = ctx.rawHelp;
        if (/CORE COMMANDS|INHERITED FLAGS/i.test(h) && /Usage:/i.test(h))
            return 80;
        if (/\nUSAGE\n/i.test(h) && /FLAGS\n/i.test(h))
            return 70;
        if (ctx.binary === "gh" || ctx.binary.includes("lark"))
            return 60;
        if (/Available Commands:/i.test(h) && /Flags:/i.test(h))
            return 50;
        return 0;
    },
    parse(ctx) {
        const parsed = parseCobraHelp(ctx);
        if (parsed.subcommands.length > 0 || parsed.args.length > 0 || parsed.usage) {
            return parsed;
        }
        return genericPlugin.parse(ctx);
    },
};
//# sourceMappingURL=cobra.js.map