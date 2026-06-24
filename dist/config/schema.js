/**
 * Zod schema for cli-to-mcp.yaml.
 *
 * Mirrors the YAML草案 in PRD §11 and architecture §5.3. The schema is the
 * single source of truth for what the runtime accepts; ConfigLoader just reads
 * the file and runs the parsed object through it.
 */
import { z } from "zod";
export const ArgType = z.enum(["string", "integer", "number", "boolean", "array"]);
export const ArgDecl = z.object({
    type: ArgType.default("string"),
    required: z.boolean().default(false),
    description: z.string().optional(),
    default: z.any().optional(),
    enum: z.array(z.string()).optional(),
    aliases: z.array(z.string()).optional(),
    repeatable: z.boolean().optional(),
});
export const OutputFormat = z.enum(["json", "text"]);
export const DiscoveryConfig = z.object({
    mode: z.enum(["help", "manual", "none"]).default("help"),
    /** Help BFS depth; default 5 when omitted (see ADR 0006). */
    max_depth: z.number().int().positive().max(10).optional(),
    parser: z.string().optional(),
    parser_module: z.string().optional(),
    /** Explicit connector template id, e.g. "gh". Overrides auto-match by name. */
    template: z.string().optional(),
    include_subgroups: z.array(z.string()).optional(),
    /**
     * Cold-start scope limiter: when startup_budget_seconds is set, only these
     * top-level subcommands are scanned during cold start (fast partial serve).
     * Background continuation then scans the full tree. Falls back to
     * include_subgroups (or full scan) when unset.
     */
    startup_include_subgroups: z.array(z.string()).optional(),
    help_argv: z.array(z.string()).min(1).optional(),
    materialize_global_args: z.boolean().optional(),
    global_arg_allowlist: z.array(z.string()).optional(),
    global_arg_denylist: z.array(z.string()).optional(),
    concurrency: z.number().int().positive().max(32).optional(),
    /** BFS dequeue order: shallow paths first yields more leaf tools under a time budget. */
    bfs_preference: z.enum(["fifo", "shallow_first"]).optional(),
    /** Stop expanding the help BFS after this many seconds (in-flight nodes still finish). */
    startup_budget_seconds: z.number().int().positive().max(3600).optional(),
    /**
     * Cold-start depth cap: discover only this many levels before the server starts,
     * then continue to max_depth in the background. Only applies when
     * startup_budget_seconds is set. Lets cold start register shallow tools fast
     * while deeper levels are filled in by background_continue_discovery.
     */
    startup_max_depth: z.number().int().positive().max(10).optional(),
    /**
     * After budget-limited startup, continue help discovery in the background (default true when budget is set).
     * Set false to only use refresh_tools manually.
     */
    background_continue_discovery: z.boolean().optional(),
    /**
     * Concurrency for background continuation (defaults to discovery.concurrency).
     * Set higher than cold-start concurrency to finish full registration faster
     * once the server is already serving.
     */
    background_concurrency: z.number().int().positive().max(64).optional(),
    exposure_mode: z.enum(["flat", "lazy"]).optional(),
});
export const ConnectorConfig = z.object({
    name: z.string().min(1),
    binary: z.string().min(1),
    /** Inserted after binary in argv (e.g. python -m module). */
    argv_prefix: z.array(z.string()).optional(),
    enabled: z.boolean().default(true),
    default_timeout_seconds: z.number().positive().optional(),
    /** Timeout for each `--help` / `-h` spawn during discovery (default 25s). */
    help_timeout_seconds: z.number().positive().max(300).optional(),
    working_dir: z.string().nullable().optional(),
    env: z.record(z.string(), z.string()).optional(),
    discovery: DiscoveryConfig.optional(),
    /** Directory of skill files; paths relative to config file directory. */
    skill_root: z.string().optional(),
    skills: z.array(z.string()).optional(),
});
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
export const RuntimeConfig = z.object({
    /**
     * Max concurrent help subprocesses across all connectors (default 24).
     * Per-connector concurrency still applies but shares this global cap.
     */
    max_inflight_help_spawns: z.number().int().positive().max(128).optional(),
    /** Cold start: discover enabled connectors in parallel (default true). */
    parallel_connector_discovery: z.boolean().optional(),
});
export const Config = z.object({
    version: z.literal(1),
    /**
     * Custom help parser modules (`.mjs`/`.js`), loaded once at startup.
     * Each file must export a HelpParserPlugin as `default`, `plugin`, `parser`,
     * or `plugins` (array). Connectors reference plugins by `discovery.parser: <id>`.
     */
    parsers: z.array(z.string().min(1)).optional(),
    connectors: z.array(ConnectorConfig),
    tools: z.record(z.string(), ToolDecl).optional(),
    skills: z.array(z.string()).optional(),
    runtime: RuntimeConfig.optional(),
});
/**
 * Validate a raw parsed YAML object against the config schema.
 * Throws an Error with a human-readable, path-annotated message on failure so
 * callers can surface it directly to users.
 */
export function validateConfig(raw) {
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
//# sourceMappingURL=schema.js.map