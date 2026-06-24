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
import { defineTool, META_TOOL_NAMES } from "../registry/tool-definition.js";
import { globalArgFilterOpts, shouldMaterializeArg } from "../discovery/global-args.js";
export function buildToolName(connectorName, path) {
    const segments = [connectorName, ...path];
    return segments
        .join("_")
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}
export function toolFromDiscovered(cmd, connector) {
    const name = buildToolName(cmd.connectorName, cmd.path);
    if (META_TOOL_NAMES.has(name))
        return null;
    const filterOpts = globalArgFilterOpts(connector.discovery);
    const args = cmd.args
        .filter((a) => shouldMaterializeArg(a, filterOpts, a.fromGlobalSection === true))
        .map((a) => toToolArg(a));
    const description = cmd.description ??
        cmd.usage ??
        `${connector.binary} ${cmd.path.join(" ")}`;
    return defineTool({
        name,
        description,
        connectorName: cmd.connectorName,
        binary: connector.binary,
        argvPrefix: connector.argv_prefix ? [...connector.argv_prefix] : undefined,
        command: [...cmd.path],
        args,
        skillRefs: [],
        source: "help",
        enabled: true,
    });
}
function toToolArg(a) {
    const type = mapType(a.inferredType);
    return {
        name: a.name,
        type,
        required: a.required ?? false,
        description: a.description,
        aliases: a.aliases,
        repeatable: a.repeatable,
    };
}
function mapType(t) {
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
//# sourceMappingURL=tool-from-discovered.js.map