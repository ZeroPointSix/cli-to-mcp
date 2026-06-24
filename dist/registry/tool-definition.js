/** Build a ToolDefinition, deriving its JSON Schema from args. */
export function defineTool(input) {
    const properties = {};
    const required = [];
    for (const arg of input.args) {
        properties[arg.name] = toJsonSchemaProperty(arg);
        if (arg.required)
            required.push(arg.name);
    }
    const sources = input.sources ?? [{ kind: input.source, confidence: 1 }];
    return {
        ...input,
        inputSchema: {
            type: "object",
            properties,
            required,
            additionalProperties: false,
        },
        sources,
    };
}
function toJsonSchemaProperty(arg) {
    switch (arg.type) {
        case "array":
            return {
                type: "array",
                items: { type: "string" },
                description: arg.description,
            };
        case "string":
        case "boolean":
        case "integer":
        case "number":
            return {
                type: arg.type,
                description: arg.description,
                ...(arg.default !== undefined ? { default: arg.default } : {}),
                ...(arg.enumValues ? { enum: arg.enumValues } : {}),
            };
    }
}
/** Metadata names that tools must never collide with (reserved for meta-tools). */
export const META_TOOL_NAMES = new Set([
    "list_connectors",
    "doctor",
    "refresh_tools",
    "get_skills",
    "get_tool_source",
    "list_tool_categories",
    "list_tools_by_category",
    "search_tools",
    "get_tool_schema",
    "call_tool",
]);
//# sourceMappingURL=tool-definition.js.map