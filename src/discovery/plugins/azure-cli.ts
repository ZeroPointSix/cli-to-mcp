/**
 * Azure CLI (`az`) help parser.
 *
 * Handles `Subgroups:` / `Commands:` sections and `name : description` lines
 * (including `[Preview]` / `[Experimental]` suffixes). Use via
 * `discovery.parser: azure-cli` — no core code changes required.
 */
import type { DiscoveredCommand } from "../types.js";
import type { HelpParserContext, HelpParserPlugin } from "../parser-registry.js";
import { stripAnsi } from "./generic.js";

const SUBGROUPS_SECTION = /^subgroups:\s*$/i;
const COMMANDS_SECTION = /^commands:\s*$/i;
const OPTIONS_SECTION =
  /^(arguments|options|global arguments|global options):?\s*$/i;

/** Lines like `account : Manage...` or `compute-fleet [Preview] : Manage...` */
const NAMED_LINE =
  /^([a-z][\w-]*(?:[-][\w-]+)*)(?:\s+\[(?:Preview|Experimental)\])?\s*:\s*(.*)$/i;

export const azureCliPlugin: HelpParserPlugin = {
  id: "azure-cli",
  displayName: "Azure CLI help parser",
  match(ctx: HelpParserContext): number {
    const t = stripAnsi(ctx.rawHelp);
    if (/\nSubgroups:\s*\n/i.test(t)) return 90;
    if (/^\s*Group\s*\n\s*az\b/m.test(t)) return 85;
    return 0;
  },
  parse(ctx: HelpParserContext): DiscoveredCommand {
    const text = stripAnsi(ctx.rawHelp);
    const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));

    let description: string | undefined;
    const subcommands: string[] = [];
    const args: DiscoveredCommand["args"] = [];
    let section: "none" | "subgroups" | "commands" | "options" = "none";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (section === "subgroups" || section === "commands" || section === "options") {
          section = "none";
        }
        continue;
      }

      if (SUBGROUPS_SECTION.test(trimmed)) {
        section = "subgroups";
        continue;
      }
      if (COMMANDS_SECTION.test(trimmed)) {
        section = "commands";
        continue;
      }
      if (OPTIONS_SECTION.test(trimmed)) {
        section = "options";
        continue;
      }
      if (/^group\s*$/i.test(trimmed)) continue;

      if (section === "subgroups" || section === "commands") {
        const name = parseAzCommandName(trimmed) ?? parseSpacedCommandName(trimmed);
        if (name) subcommands.push(name);
        continue;
      }

      if (section === "options") {
        const opt = parseAzOption(trimmed);
        if (opt && opt.name !== "help") args.push(opt);
        continue;
      }

      if (!description && /^az\s+\w+/i.test(trimmed)) {
        description = trimmed.replace(/^az\s+/i, "").trim();
      }
    }

    return {
      connectorName: ctx.connectorName,
      path: ctx.path,
      rawHelp: text,
      description,
      args,
      subcommands: [...new Set(subcommands)],
    };
  },
};

/** `show   Get the details` (Azure Commands section) */
function parseSpacedCommandName(line: string): string | null {
  const m = line.match(/^([a-z][\w-]*)\s{2,}/i);
  return m ? m[1].toLowerCase() : null;
}

function parseAzCommandName(line: string): string | null {
  const m = line.match(NAMED_LINE);
  if (m) return m[1].toLowerCase();
  const bare = line.match(/^([a-z][\w-]*(?:[-][\w-]+)*)(?:\s+\[(?:Preview|Experimental)\])?\s*$/i);
  return bare ? bare[1].toLowerCase() : null;
}

function parseAzOption(line: string): DiscoveredCommand["args"][number] | null {
  const long = line.match(/^(--[\w-]+)(?:\s+([<\[]?\S+[>\]]?))?\s{2,}(.+)$/);
  if (!long) return null;
  const name = long[1].replace(/^--/, "");
  const valueName = long[2];
  const hasValue = Boolean(valueName && !valueName.startsWith("-"));
  return {
    name,
    kind: hasValue ? "option" : "flag",
    valueName: hasValue ? valueName!.replace(/[<\[\]>]/g, "") : undefined,
    description: long[3]?.trim(),
    inferredType: hasValue ? "string" : "boolean",
  };
}