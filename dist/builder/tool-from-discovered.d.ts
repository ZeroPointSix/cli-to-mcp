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
import { type ToolDefinition } from "../registry/tool-definition.js";
import type { DiscoveredCommand } from "../discovery/types.js";
import type { ResolvedConnector } from "../config/config-loader.js";
export declare function buildToolName(connectorName: string, path: string[]): string;
export declare function toolFromDiscovered(cmd: DiscoveredCommand, connector: ResolvedConnector): ToolDefinition | null;
