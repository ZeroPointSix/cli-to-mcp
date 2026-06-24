/**
 * Cobra / gh-style help: USAGE block, CORE COMMANDS tables, FLAGS with aligned columns.
 * Used by cobraPlugin; generic remains the conservative fallback for other layouts.
 */
import type { DiscoveredArg, DiscoveredCommand } from "../types.js";
import type { HelpParserContext } from "../parser-registry.js";
import { stripAnsi } from "./generic.js";

const COBRA_COMMAND_SECTION =
  /^(core commands|available commands|additional commands|commands|subcommands):?\s*$/i;
const COBRA_FLAGS_SECTION = /^(flags|local flags|global flags|inherited flags):?\s*$/i;
const COBRA_USAGE_SECTION = /^usage\s*$/i;

export function parseCobraHelp(ctx: HelpParserContext): DiscoveredCommand {
  const text = stripAnsi(ctx.rawHelp);
  const lines = text.split("\n").map((l) => l.replace(/\r$/, "").trimEnd());

  let description: string | undefined;
  let usage: string | undefined;
  const subcommands: string[] = [];
  const args: DiscoveredArg[] = [];
  let section: "none" | "commands" | "flags" = "none";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      if (section === "commands" || section === "flags") section = "none";
      continue;
    }

    if (COBRA_USAGE_SECTION.test(trimmed)) {
      const next = lines[i + 1]?.trim();
      if (next && !COBRA_COMMAND_SECTION.test(next) && !COBRA_FLAGS_SECTION.test(next)) {
        usage = next.replace(/^usage:?\s*/i, "").trim();
        i++;
      }
      section = "none";
      continue;
    }
    if (/^usage:?\s+/i.test(trimmed)) {
      usage = trimmed.replace(/^usage:?\s*/i, "").trim();
      section = "none";
      continue;
    }
    if (COBRA_COMMAND_SECTION.test(trimmed)) {
      section = "commands";
      continue;
    }
    if (COBRA_FLAGS_SECTION.test(trimmed)) {
      section = "flags";
      continue;
    }

    if (section === "commands") {
      const name = parseCobraSubcommandLine(trimmed);
      if (name) subcommands.push(name);
      continue;
    }

    if (section === "flags") {
      const opt = parseCobraFlagLine(trimmed);
      if (opt && opt.name !== "help") args.push(opt);
      continue;
    }

    if (
      !description &&
      i < 12 &&
      !trimmed.startsWith("-") &&
      !/^usage\b/i.test(trimmed) &&
      !COBRA_COMMAND_SECTION.test(trimmed)
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
}

/** Cobra tables: `auth:  text`, `pr   Manage...`, `acr  Azure Container Registry`. */
export function parseCobraSubcommandLine(trimmed: string): string | null {
  const withColon = trimmed.match(/^([a-zA-Z][\w.-]*):\s*(.+)$/);
  if (withColon) return withColon[1];
  const spaced = trimmed.match(/^([a-zA-Z][\w.-]+)\s{2,}(.+)$/);
  if (spaced) return spaced[1];
  if (/^[a-zA-Z][\w.-]*$/.test(trimmed)) return trimmed;
  return null;
}

function parseCobraFlagLine(line: string): DiscoveredArg | null {
  const shortLong =
    line.match(/^(-[\w?]),?\s+(--[\w-]+)(?:\s+(\S+))?\s{2,}(.+)$/) ??
    line.match(/^(-[\w?]),?\s+(--[\w-]+)\s+(.+)$/);
  if (shortLong) {
    const short = shortLong[1];
    const long = shortLong[2];
    const third = shortLong[3];
    const fourth = shortLong[4];
    const name = long.replace(/^--/, "");
    let valueName: string | undefined;
    let desc: string;
    if (fourth) {
      valueName = third;
      desc = fourth;
    } else {
      desc = third ?? "";
    }
    const hasValue =
      Boolean(valueName && !/^show\b/i.test(desc)) &&
      (/\b(integer|string|number|fields)\b/i.test(valueName!) ||
        /^(<|\[)/.test(valueName!) ||
        /integer|string/i.test(desc));
    const inferredType = inferCobraType(name, desc, valueName);
    return {
      name,
      aliases: short && short !== "--help" ? [short] : undefined,
      kind: hasValue ? "option" : "flag",
      valueName: hasValue ? valueName!.replace(/[<\[\]>]/g, "") : undefined,
      description: desc.trim(),
      inferredType: hasValue ? inferredType : "boolean",
    };
  }
  const longOnly = line.match(/^(--[\w-]+)(?:\s+(\S+))?\s{2,}(.+)$/);
  if (longOnly) {
    const name = longOnly[1].replace(/^--/, "");
    const valueName = longOnly[2];
    const desc = longOnly[3];
    const hasValue = Boolean(valueName && /integer|fields|<|\[/i.test(`${valueName} ${desc}`));
    return {
      name,
      kind: hasValue ? "option" : "flag",
      valueName: hasValue ? valueName!.replace(/[<\[\]>]/g, "") : undefined,
      description: desc.trim(),
      inferredType: hasValue ? inferCobraType(name, desc, valueName) : "boolean",
    };
  }
  return null;
}

function inferCobraType(
  name: string,
  desc: string,
  valueName?: string,
): "string" | "integer" | "number" | "boolean" {
  const blob = `${name} ${desc} ${valueName ?? ""}`.toLowerCase();
  if (/\binteger\b/.test(blob) || /\bnumber\b/.test(name)) return "integer";
  if (/\bcount\b|\blimit\b/.test(blob)) return "integer";
  return "string";
}