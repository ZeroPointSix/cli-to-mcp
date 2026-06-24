/**
 * DiscoveredCommand: intermediate model produced by help parsing.
 *
 * Discovery output is NOT exposed to MCP directly; the Tool Model Builder turns
 * these into ToolDefinitions (architecture §5.4).
 */
export type DiscoveredArg = {
  name: string;
  aliases?: string[];
  kind: "flag" | "option" | "positional";
  valueName?: string;
  description?: string;
  required?: boolean;
  repeatable?: boolean;
  inferredType?: "string" | "boolean" | "integer" | "number" | "array";
  enumValues?: string[];
  fromGlobalSection?: boolean;
  /** Order among positional args (0 = first after subcommand path). */
  position?: number;
};

export type DiscoveredCommand = {
  connectorName: string;
  /** Subcommand path from root, e.g. ["pr","view"]. Empty = root. */
  path: string[];
  rawHelp: string;
  description?: string;
  usage?: string;
  args: DiscoveredArg[];
  subcommands: string[];
};
