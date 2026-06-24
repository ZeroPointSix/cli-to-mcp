import type { JsonSchema } from "../registry/tool-definition.js";

const empty: JsonSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

export type MetaToolListEntry = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

const SCHEMAS: Record<string, JsonSchema> = {
  list_connectors: empty,
  doctor: empty,
  refresh_tools: empty,
  list_tool_categories: empty,
  get_skills: {
    type: "object",
    properties: {
      connector: { type: "string", description: "Connector name (for list/file modes)." },
      tool: { type: "string", description: "Tool name to load tool-level skill refs." },
      list: { type: "boolean", description: "List files under skill_root." },
      file: { type: "string", description: "Relative path under skill_root to read." },
    },
    required: [],
    additionalProperties: false,
  },
  get_tool_source: {
    type: "object",
    properties: {
      name: { type: "string", description: "Registry tool name (not 'tool')." },
    },
    required: ["name"],
    additionalProperties: false,
  },
  list_tools_by_category: {
    type: "object",
    properties: {
      category: { type: "string", description: "Category id from list_tool_categories." },
      limit: { type: "integer", description: "Max tools to return (default 200)." },
    },
    required: ["category"],
    additionalProperties: false,
  },
  search_tools: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keyword(s); space-separated tokens are AND-matched." },
      limit: { type: "integer", description: "Max results (default 50)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  get_tool_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Registry tool name." },
    },
    required: ["name"],
    additionalProperties: false,
  },
  call_tool: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Registry tool name only (e.g. git_status). Optional second field 'arguments': object of CLI params per get_tool_schema.",
      },
    },
    required: ["name"],
    additionalProperties: true,
  },
};

export function metaToolInputSchema(name: string): JsonSchema {
  return SCHEMAS[name] ?? empty;
}

export function buildMetaToolListEntries(
  defs: Array<{ name: string; description: string }>,
): MetaToolListEntry[] {
  return defs.map((d) => ({
    ...d,
    inputSchema: metaToolInputSchema(d.name),
  }));
}