/**
 * Extract positional placeholders from a USAGE line (e.g. `api <method> <path> [flags]`).
 */
import type { DiscoveredArg } from "../discovery/types.js";

function sanitizePositionalName(raw: string): string {
  const core = raw.split(/\s*\|\s*/)[0]!.trim();
  return (
    core
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || "arg"
  );
}

/**
 * Parse required `<name>` and optional `[<name>]` placeholders from usage text.
 * Stops before `[flags]` / trailing option sections.
 */
export function positionalsFromUsage(usage: string | undefined): DiscoveredArg[] {
  if (!usage?.trim()) return [];
  let segment = usage.trim();
  const flagsIdx = segment.search(/\s+\[flags\]/i);
  if (flagsIdx >= 0) segment = segment.slice(0, flagsIdx);

  const out: DiscoveredArg[] = [];
  let position = 0;

  const optionalBracket = /\[\s*<([^>]+)>\s*(?:\|\s*<[^>]+>\s*)*\]/g;
  let m: RegExpExecArray | null;
  while ((m = optionalBracket.exec(segment)) !== null) {
    const inner = m[1];
    const name = sanitizePositionalName(inner);
    if (!out.some((a) => a.name === name)) {
      out.push({
        name,
        kind: "positional",
        position: position++,
        required: false,
        description: `Positional argument (${inner})`,
        inferredType: inferPositionalType(name),
      });
    }
  }

  const requiredAngle = /<([a-zA-Z][\w.-]*)>/g;
  while ((m = requiredAngle.exec(segment)) !== null) {
    const name = sanitizePositionalName(m[1]);
    if (out.some((a) => a.name === name)) continue;
    out.push({
      name,
      kind: "positional",
      position: position++,
      required: true,
      description: `Positional argument (${m[1]})`,
      inferredType: inferPositionalType(name),
    });
  }

  return out.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function inferPositionalType(name: string): DiscoveredArg["inferredType"] {
  const n = name.toLowerCase();
  if (/\b(number|count|limit|id|integer|int)\b/.test(n)) return "integer";
  return "string";
}