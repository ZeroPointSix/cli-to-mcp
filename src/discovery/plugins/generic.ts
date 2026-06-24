/**
 * Generic help parser: conservative section-based extraction.
 *
 * Recognizes common section headers (Commands/Subcommands/Options/Flags) and
 * parses option lines into DiscoveredArg. Always preserves rawHelp. Filters out
 * -h / --help so they never pollute the inputSchema (PRD §10.4, ADR §5).
 *
 * This is intentionally not a universal parser — when it cannot recognize a
 * structure it returns an empty command with rawHelp, letting YAML overlay
 * supply the truth.
 */
import type { DiscoveredArg, DiscoveredCommand } from "../types.js";
import type { HelpParserContext, HelpParserPlugin } from "../parser-registry.js";

const COMMAND_SECTION =
  /^(commands|subcommands|available commands|core commands|subgroups):?\s*$/i;
const OPTIONS_SECTION =
  /^(options|flags|global flags|global options|arguments|global arguments):?\s*$/i;
const USAGE_LINE = /^usage:?\s*/i;

export function stripAnsi(s: string): string {
  // Strip common ANSI color / cursor escapes.
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

export const genericPlugin: HelpParserPlugin = {
  id: "generic",
  displayName: "Generic conservative parser",
  match: () => 1,
  parse(ctx: HelpParserContext): DiscoveredCommand {
    const text = stripAnsi(ctx.rawHelp);
    const lines = text.split("\n").map((l) => l.replace(/\r$/, "").trimEnd());

    let description: string | undefined;
    let usage: string | undefined;
    const subcommands: string[] = [];
    const args: DiscoveredArg[] = [];
    let section: "none" | "commands" | "options" = "none";
    let optionsSectionIsGlobal = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        if (section === "commands" || section === "options") section = "none";
        continue;
      }

      if (USAGE_LINE.test(trimmed)) {
        usage = trimmed.replace(USAGE_LINE, "").trim();
        section = "none";
        continue;
      }
      if (COMMAND_SECTION.test(trimmed)) {
        section = "commands";
        continue;
      }
      if (OPTIONS_SECTION.test(trimmed)) {
        section = "options";
        optionsSectionIsGlobal = /^global\s+(arguments|options|flags)/i.test(trimmed);
        continue;
      }

      if (section === "commands") {
        const m = trimmed.match(/^([a-z][\w-]*):?\s+(.+)$/i) ?? trimmed.match(/^([a-z][\w-]*)\s{2,}(.+)$/i);
        if (m) {
          subcommands.push(m[1]);
        } else if (/^[a-z][\w-]*$/i.test(trimmed)) {
          subcommands.push(trimmed);
        }
        continue;
      }

      if (section === "options") {
        const opt = parseOptionLine(trimmed);
        if (opt && !isHelpFlag(opt)) {
          opt.fromGlobalSection = optionsSectionIsGlobal;
          args.push(opt);
        }
        continue;
      }

      // Description: first non-trivial line near the top.
      if (
        !description &&
        !USAGE_LINE.test(trimmed) &&
        !trimmed.startsWith("-") &&
        i < 12 &&
        !/^(group|command|subgroups?)\s*$/i.test(trimmed) &&
        !/^(copyright|author|see also)/i.test(trimmed)
      ) {
        description = description ? `${description} ${trimmed}` : trimmed;
      }
    }

    return {
      connectorName: ctx.connectorName,
      path: ctx.path,
      rawHelp: text,
      description,
      usage,
      args,
      subcommands: [...new Set(subcommands)],
    };
  },
};

function isHelpFlag(arg: DiscoveredArg): boolean {
  return arg.name === "help" || arg.aliases?.includes("-h") === true;
}

function parseOptionLine(line: string): DiscoveredArg | null {
  // Forms:
  //   -h, --help              Show help
  //   -n, --name <VALUE>      Name
  //   --count <N>             Count
  //   --json <fields>         JSON fields
  //   --flag                  Flag
  const withShort =
    line.match(/^(-[\w?]),?\s+(--[\w-]+)(?:\s+([<\[]?\S+[>\]]?))?\s{2,}(.+)$/);
  if (withShort) {
    const short = withShort[1];
    const long = withShort[2];
    const valueName = withShort[3];
    const desc = withShort[4];
    const name = long.replace(/^--/, "");
    const hasValue = Boolean(valueName && !valueName.startsWith("-"));
    return {
      name,
      aliases: short && !short.startsWith("--") ? [short] : undefined,
      kind: hasValue ? "option" : "flag",
      valueName: hasValue ? valueName!.replace(/[<\[\]>]/g, "") : undefined,
      description: desc?.trim(),
      inferredType: hasValue ? inferType(name, desc) : "boolean",
    };
  }
  const longOnly = line.match(/^(--[\w-]+)(?:\s+([<\[]?\S+[>\]]?))?\s{2,}(.+)$/);
  if (longOnly) {
    const long = longOnly[1];
    const valueName = longOnly[2];
    const desc = longOnly[3];
    const name = long.replace(/^--/, "");
    const hasValue = Boolean(valueName && !valueName.startsWith("-"));
    return {
      name,
      kind: hasValue ? "option" : "flag",
      valueName: hasValue ? valueName.replace(/[<\[\]>]/g, "") : undefined,
      description: desc?.trim(),
      inferredType: hasValue ? inferType(name, desc) : "boolean",
    };
  }
  return null;
}

function inferType(name: string, desc?: string): "string" | "integer" | "number" | "boolean" {
  const d = (desc ?? "").toLowerCase();
  const n = name.toLowerCase();
  // Name-based hints are strongest (e.g. arg named "count" / "limit").
  if (/\b(count|limit|number|int|integer|index|depth)\b/.test(n) || /^(count|limit|number|int|integer)/.test(n)) {
    return "integer";
  }
  if (/\b(integer|int|count|limit|index|depth)\b/.test(d)) {
    return "integer";
  }
  if (/\bnumber\b/.test(d) || /\bnumber\b/.test(n)) {
    return "number";
  }
  return "string";
}
