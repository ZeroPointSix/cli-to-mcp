/**
 * Cobra-style parser: matches `gh` and many Go CLIs.
 *
 * Cobra help typically has:
 *   Usage: gh pr view [<number> | <url> | <branch>]
 *   Flags:  -h, --help   Show context...
 *   Inherited Flags: ...
 *   Core Commands: / Available Commands:
 *
 * Phase 1: reuse the generic section parser (which already understands
 * Commands/Flags/Usage). The cobra plugin's job is mainly to *match* cobra
 * output with high confidence so users can name it explicitly via
 * `discovery.parser: cobra`.
 */
import type { DiscoveredCommand } from "../types.js";
import type { HelpParserContext, HelpParserPlugin } from "../parser-registry.js";
import { genericPlugin } from "./generic.js";

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
    // Phase 1: delegate to generic. A dedicated cobra parser can be added
    // later without changing the registry contract.
    return genericPlugin.parse(ctx);
  },
};
