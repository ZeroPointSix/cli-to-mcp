/**
 * Build ToolDefinitions from explicit YAML tool declarations.
 *
 * Used by the YAML discovery source and by M0/M1 where tools are hand-declared
 * rather than scanned from `--help`. The resulting ToolDefinition carries
 * source="yaml" by default so get_tool_source can report provenance; pass
 * `sourceOverride` to reuse this builder from the template source.
 */
import type { ResolvedConnector, ResolvedTool } from "../config/config-loader.js";
import { type ToolDefinition, type ToolSource } from "../registry/tool-definition.js";
export declare function toolFromYamlDecl(name: string, decl: ResolvedTool, connector: ResolvedConnector, sourceOverride?: ToolSource): ToolDefinition;
