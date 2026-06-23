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
export type JsonSchemaProperty = {
    type: "string" | "boolean" | "integer" | "number";
    description?: string;
    default?: unknown;
    enum?: string[];
} | {
    type: "array";
    items: {
        type: "string" | "integer" | "number" | "boolean";
    };
    description?: string;
};
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
export type ToolOutput = {
    format: OutputFormat;
};
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
    sources: Array<{
        kind: ToolSource;
        confidence: number;
    }>;
    enabled: boolean;
};
export type ToolDefinitionInput = Omit<ToolDefinition, "inputSchema" | "sources"> & {
    sources?: Array<{
        kind: ToolSource;
        confidence: number;
    }>;
};
/** Build a ToolDefinition, deriving its JSON Schema from args. */
export declare function defineTool(input: ToolDefinitionInput): ToolDefinition;
/** Metadata names that tools must never collide with (reserved for meta-tools). */
export declare const META_TOOL_NAMES: Set<string>;
