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
  }));

  return defineTool({
    name,
    description: decl.description ?? `${decl.connector} ${decl.command.join(" ")}`,
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
  });
}
