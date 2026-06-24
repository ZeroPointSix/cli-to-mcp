/**
 * Turn a DiscoveredCommand (help-parse output) into a ToolDefinition.
 *
 * Tool generation rule (Task 01 §1):
 *   Only **leaf** commands (subcommands.length === 0) become tools. Root and
 *   intermediate nodes are traversal-only — exposing `gh` itself would be
 *   meaningless and `gh pr` (which just lists subcommands) adds no value.
 *
 * Naming: `{connectorName}_{path_segments}`, lowercased, non-alphanumerics
 * replaced with `_`, collapsed, and trimmed of leading/trailing `_`. Must not
 * collide with META_TOOL_NAMES; if it would, the tool is skipped (return null).
 */
import { defineTool, META_TOOL_NAMES, type ToolDefinition } from "../registry/tool-definition.js";
import type { DiscoveredArg, DiscoveredCommand } from "../discovery/types.js";
import type { ResolvedConnector } from "../config/config-loader.js";
import type { ArgType } from "../config/schema.js";
import { globalArgFilterOpts, shouldMaterializeArg } from "../discovery/global-args.js";
import { positionalsFromUsage } from "./usage-positionals.js";
import { applyDescriptionHints } from "./infer-annotations.js";

export function buildToolName(connectorName: string, path: string[]): string {
  const segments = [connectorName, ...path];
  return segments
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function toolFromDiscovered(
  cmd: DiscoveredCommand,
  connector: ResolvedConnector,
): ToolDefinition | null {
  const name = buildToolName(cmd.connectorName, cmd.path);
  if (META_TOOL_NAMES.has(name)) return null;

  const filterOpts = globalArgFilterOpts(connector.discovery);
  const fromHelp = cmd.args.filter((a) =>
    shouldMaterializeArg(a, filterOpts, a.fromGlobalSection === true),
  );
  const usagePos = positionalsFromUsage(cmd.usage);
  const mergedDiscovered = mergeDiscoveredArgs(fromHelp, usagePos);
  const args = mergedDiscovered.map((a) => toToolArg(a));

  const rawDescription =
    cmd.description ??
    cmd.usage ??
    `${connector.binary} ${cmd.path.join(" ")}`;
  const hinted = applyDescriptionHints(rawDescription);

  return defineTool({
    name,
    description: hinted.description,
    connectorName: cmd.connectorName,
    binary: connector.binary,
    argvPrefix: connector.argv_prefix ? [...connector.argv_prefix] : undefined,
    command: [...cmd.path],
    args,
    skillRefs: [],
    source: "help",
    enabled: true,
    annotations: hinted.annotations,
    mcpMeta: hinted.mcpMeta,
  });
}

function mergeDiscoveredArgs(
  fromHelp: DiscoveredArg[],
  fromUsage: DiscoveredArg[],
): DiscoveredArg[] {
  const names = new Set(fromHelp.map((a) => a.name));
  const extra = fromUsage.filter((a) => !names.has(a.name));
  return [...fromHelp, ...extra].sort((a, b) => {
    const ka = a.kind === "positional" ? 0 : 1;
    const kb = b.kind === "positional" ? 0 : 1;
    if (ka !== kb) return ka - kb;
    if (a.kind === "positional" && b.kind === "positional") {
      return (a.position ?? 0) - (b.position ?? 0);
    }
    return 0;
  });
}

function toToolArg(a: DiscoveredArg): ToolDefinition["args"][number] {
  const type: ArgType = mapType(a.inferredType, a.kind);
  const kind = a.kind;
  return {
    name: a.name,
    type,
    required: a.required ?? false,
    description: a.description,
    aliases: a.aliases,
    repeatable: a.repeatable,
    kind,
    position: a.position,
  };
}

function mapType(t: DiscoveredArg["inferredType"], kind: DiscoveredArg["kind"]): ArgType {
  if (kind === "flag") return "boolean";
  switch (t) {
    case "boolean":
      return "boolean";
    case "integer":
      return "integer";
    case "number":
      return "number";
    case "array":
      return "array";
    default:
      return "string";
  }
}
