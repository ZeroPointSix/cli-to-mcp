/**
 * Cobra-style parser: matches `gh` and many Go CLIs.
 *
 * Cobra help typically has:
 *   Usage: gh pr view [<number> | <url> | <branch>]
 *   Flags:  -h, --help   Show context...
 *   Inherited Flags: ...
 *   Core Commands: / Available Commands:
 *
 * Parsing uses dedicated table/section logic (cobra-parse). For unrecognized
 * layouts, falls back to genericPlugin.
 */
import type { DiscoveredCommand } from "../types.js";
import type { HelpParserContext, HelpParserPlugin } from "../parser-registry.js";
import { genericPlugin } from "./generic.js";
import { parseCobraHelp } from "./cobra-parse.js";

export const cobraPlugin: HelpParserPlugin = {
  id: "cobra",
  displayName: "Cobra-style (gh, many Go CLIs)",
  match(ctx: HelpParserContext): number {
    const h = ctx.rawHelp;
    if (/CORE COMMANDS|INHERITED FLAGS/i.test(h) && /Usage:/i.test(h)) return 80;
    if (/\nUSAGE\n/i.test(h) && /FLAGS\n/i.test(h)) return 70;
    if (ctx.binary === "gh" || ctx.binary.includes("lark")) return 60;
    if (/Available Commands:/i.test(h) && /Flags:/i.test(h)) return 50;
    return 0;
  },
  parse(ctx: HelpParserContext): DiscoveredCommand {
    const parsed = parseCobraHelp(ctx);
    if (parsed.subcommands.length > 0 || parsed.args.length > 0 || parsed.usage) {
      return parsed;
    }
    return genericPlugin.parse(ctx);
  },
};