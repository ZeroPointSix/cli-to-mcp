/**
 * Build ToolDefinitions from explicit YAML tool declarations.
 *
 * Used by the YAML discovery source and by M0/M1 where tools are hand-declared
 * rather than scanned from `--help`. The resulting ToolDefinition carries
 * source="yaml" by default so get_tool_source can report provenance; pass
 * `sourceOverride` to reuse this builder from the template source.
 */
import type { ResolvedConnector, ResolvedTool } from "../config/config-loader.js";
import { defineTool, type ToolDefinition, type ToolSource } from "../registry/tool-definition.js";
import { applyDescriptionHints, mergeAnnotations } from "./infer-annotations.js";

export function toolFromYamlDecl(
  name: string,
  decl: ResolvedTool,
  connector: ResolvedConnector,
  sourceOverride: ToolSource = "yaml",
): ToolDefinition {
  const args = Object.entries(decl.args ?? {}).map(([argName, a]) => ({
    name: argName,
    type: a.type,
    required: a.required,
    description: a.description,
    default: a.default,
    enumValues: a.enum,
    aliases: a.aliases,
    repeatable: a.repeatable,
    kind: a.kind,
    position: a.position,
  }));

  const rawDescription = decl.description ?? `${decl.connector} ${decl.command.join(" ")}`;
  const hinted = applyDescriptionHints(rawDescription);
  const annotations = mergeAnnotations(decl.annotations, hinted.annotations);
  const mcpMeta =
    decl.mcp_meta || hinted.mcpMeta
      ? { ...hinted.mcpMeta, ...decl.mcp_meta }
      : undefined;

  return defineTool({
    name,
    description: hinted.description,
    connectorName: decl.connector,
    binary: connector.binary,
    argvPrefix: connector.argv_prefix ? [...connector.argv_prefix] : undefined,
    command: [...decl.command],
    defaultArgs: decl.default_args ? [...decl.default_args] : undefined,
    args,
    output: decl.output,
    skillRefs: decl.skills ?? [],
    source: sourceOverride,
    enabled: decl.enabled,
    annotations,
    mcpMeta: mcpMeta && Object.keys(mcpMeta).length > 0 ? mcpMeta : undefined,
  });
}
