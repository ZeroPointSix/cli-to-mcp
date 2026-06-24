/**
 * ToolDefinition: the unified model every module collaborates around.
 *
 * MCP Server does not understand CLI help. Executor does not read YAML. Both
 * only see ToolDefinition. Source tracking lets `get_tool_source` explain where
 * a tool came from (yaml / template / help / mixed).
 */
import type { ArgType, OutputFormat } from "../config/schema.js";

/** JSON Schema fragment we feed to MCP. */
export type JsonSchema = {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties: boolean;
};

export type JsonSchemaProperty =
  | { type: "string" | "boolean" | "integer" | "number"; description?: string; default?: unknown; enum?: string[] }
  | { type: "array"; items: { type: "string" | "integer" | "number" | "boolean" }; description?: string };

export type ToolSource = "yaml" | "template" | "help" | "mixed";

export type ToolArg = {
  name: string;
  type: ArgType;
  required: boolean;
  description?: string;
  default?: unknown;
  enumValues?: string[];
  aliases?: string[];
  repeatable?: boolean;
};

export type ToolOutput = { format: OutputFormat };

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  connectorName: string;
  /** Binary on PATH, e.g. "gh" / "lark-cli". Executor spawns this directly. */
  binary: string;
  /** Tokens between binary and command path (from connector argv_prefix). */
  argvPrefix?: string[];
  /** Subcommand path appended after the binary, e.g. ["pr","view"]. */
  command: string[];
  /** Extra argv appended after user args, e.g. ["--json","number,title"]. */
  defaultArgs?: string[];
  args: ToolArg[];
  output?: ToolOutput;
  skillRefs: string[];
  source: ToolSource;
  /** Provenance for get_tool_source: which sources contributed and confidence. */
  sources: Array<{ kind: ToolSource; confidence: number }>;
  enabled: boolean;
};

export type ToolDefinitionInput = Omit<ToolDefinition, "inputSchema" | "sources"> & {
  sources?: Array<{ kind: ToolSource; confidence: number }>;
};

/** Build a ToolDefinition, deriving its JSON Schema from args. */
export function defineTool(input: ToolDefinitionInput): ToolDefinition {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const arg of input.args) {
    properties[arg.name] = toJsonSchemaProperty(arg);
    if (arg.required) required.push(arg.name);
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

function toJsonSchemaProperty(arg: ToolArg): JsonSchemaProperty {
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
