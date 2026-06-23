/**
 * Zod schema for cli-to-mcp.yaml.
 *
 * Mirrors the YAML草案 in PRD §11 and architecture §5.3. The schema is the
 * single source of truth for what the runtime accepts; ConfigLoader just reads
 * the file and runs the parsed object through it.
 */
import { z } from "zod";

export const ArgType = z.enum(["string", "integer", "number", "boolean", "array"]);
export type ArgType = z.infer<typeof ArgType>;

export const ArgDecl = z.object({
  type: ArgType.default("string"),
  required: z.boolean().default(false),
  description: z.string().optional(),
  default: z.any().optional(),
  enum: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  repeatable: z.boolean().optional(),
});
export type ArgDecl = z.infer<typeof ArgDecl>;

export const OutputFormat = z.enum(["json", "text"]);
export type OutputFormat = z.infer<typeof OutputFormat>;

export const DiscoveryConfig = z.object({
  mode: z.enum(["help", "manual", "none"]).default("help"),
  /** Help BFS depth; default 5 when omitted (see ADR 0006). */
  max_depth: z.number().int().positive().max(10).optional(),
  parser: z.string().optional(),
  parser_module: z.string().optional(),
  /** Explicit connector template id, e.g. "gh". Overrides auto-match by name. */
  template: z.string().optional(),
  include_subgroups: z.array(z.string()).optional(),
});
export type DiscoveryConfig = z.infer<typeof DiscoveryConfig>;

export const ConnectorConfig = z.object({
  name: z.string().min(1),
  binary: z.string().min(1),
  /** Inserted after binary in argv (e.g. python -m module). */
  argv_prefix: z.array(z.string()).optional(),
  enabled: z.boolean().default(true),
  default_timeout_seconds: z.number().positive().optional(),
  working_dir: z.string().nullable().optional(),
  env: z.record(z.string(), z.string()).optional(),
  discovery: DiscoveryConfig.optional(),
  /** Directory of skill files; paths relative to config file directory. */
  skill_root: z.string().optional(),
  skills: z.array(z.string()).optional(),
});
export type ConnectorConfig = z.infer<typeof ConnectorConfig>;

export const ToolDecl = z.object({
  enabled: z.boolean().default(true),
  connector: z.string().min(1),
  command: z.array(z.string()).min(1),
  description: z.string().optional(),
  args: z.record(z.string(), ArgDecl).optional(),
  default_args: z.array(z.string()).optional(),
  output: z.object({ format: OutputFormat.default("text") }).optional(),
  skills: z.array(z.string()).optional(),
});
export type ToolDecl = z.infer<typeof ToolDecl>;

export const Config = z.object({
  version: z.literal(1),
  connectors: z.array(ConnectorConfig),
  tools: z.record(z.string(), ToolDecl).optional(),
  skills: z.array(z.string()).optional(),
});
export type Config = z.infer<typeof Config>;

/**
 * Validate a raw parsed YAML object against the config schema.
 * Throws an Error with a human-readable, path-annotated message on failure so
 * callers can surface it directly to users.
 */
export function validateConfig(raw: unknown): Config {
  const result = Config.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((iss) => {
      const path = iss.path.length > 0 ? iss.path.join(".") : "(root)";
      return `  - ${path}: ${iss.message}`;
    });
    throw new Error(`Invalid cli-to-mcp config:\n${lines.join("\n")}`);
  }
  return result.data;
}
