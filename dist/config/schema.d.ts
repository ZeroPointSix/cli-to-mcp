/**
 * Zod schema for cli-to-mcp.yaml.
 *
 * Mirrors the YAML草案 in PRD §11 and architecture §5.3. The schema is the
 * single source of truth for what the runtime accepts; ConfigLoader just reads
 * the file and runs the parsed object through it.
 */
import { z } from "zod";
export declare const ArgType: z.ZodEnum<["string", "integer", "number", "boolean", "array"]>;
export type ArgType = z.infer<typeof ArgType>;
export declare const ArgDecl: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["string", "integer", "number", "boolean", "array"]>>;
    required: z.ZodDefault<z.ZodBoolean>;
    description: z.ZodOptional<z.ZodString>;
    default: z.ZodOptional<z.ZodAny>;
    enum: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    aliases: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    repeatable: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "string" | "number" | "boolean" | "integer" | "array";
    required: boolean;
    description?: string | undefined;
    default?: any;
    enum?: string[] | undefined;
    aliases?: string[] | undefined;
    repeatable?: boolean | undefined;
}, {
    type?: "string" | "number" | "boolean" | "integer" | "array" | undefined;
    required?: boolean | undefined;
    description?: string | undefined;
    default?: any;
    enum?: string[] | undefined;
    aliases?: string[] | undefined;
    repeatable?: boolean | undefined;
}>;
export type ArgDecl = z.infer<typeof ArgDecl>;
export declare const OutputFormat: z.ZodEnum<["json", "text"]>;
export type OutputFormat = z.infer<typeof OutputFormat>;
export declare const DiscoveryConfig: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["help", "manual", "none"]>>;
    /** Help BFS depth; default 5 when omitted (see ADR 0006). */
    max_depth: z.ZodOptional<z.ZodNumber>;
    parser: z.ZodOptional<z.ZodString>;
    parser_module: z.ZodOptional<z.ZodString>;
    /** Explicit connector template id, e.g. "gh". Overrides auto-match by name. */
    template: z.ZodOptional<z.ZodString>;
    include_subgroups: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    help_argv: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    materialize_global_args: z.ZodOptional<z.ZodBoolean>;
    global_arg_allowlist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    global_arg_denylist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    concurrency: z.ZodOptional<z.ZodNumber>;
    /** BFS dequeue order: shallow paths first yields more leaf tools under a time budget. */
    bfs_preference: z.ZodOptional<z.ZodEnum<["fifo", "shallow_first"]>>;
    /** Stop expanding the help BFS after this many seconds (in-flight nodes still finish). */
    startup_budget_seconds: z.ZodOptional<z.ZodNumber>;
    /**
     * After budget-limited startup, continue help discovery in the background (default true when budget is set).
     * Set false to only use refresh_tools manually.
     */
    background_continue_discovery: z.ZodOptional<z.ZodBoolean>;
    exposure_mode: z.ZodOptional<z.ZodEnum<["flat", "lazy"]>>;
}, "strip", z.ZodTypeAny, {
    mode: "help" | "manual" | "none";
    max_depth?: number | undefined;
    parser?: string | undefined;
    parser_module?: string | undefined;
    template?: string | undefined;
    include_subgroups?: string[] | undefined;
    help_argv?: string[] | undefined;
    materialize_global_args?: boolean | undefined;
    global_arg_allowlist?: string[] | undefined;
    global_arg_denylist?: string[] | undefined;
    concurrency?: number | undefined;
    bfs_preference?: "fifo" | "shallow_first" | undefined;
    startup_budget_seconds?: number | undefined;
    background_continue_discovery?: boolean | undefined;
    exposure_mode?: "flat" | "lazy" | undefined;
}, {
    mode?: "help" | "manual" | "none" | undefined;
    max_depth?: number | undefined;
    parser?: string | undefined;
    parser_module?: string | undefined;
    template?: string | undefined;
    include_subgroups?: string[] | undefined;
    help_argv?: string[] | undefined;
    materialize_global_args?: boolean | undefined;
    global_arg_allowlist?: string[] | undefined;
    global_arg_denylist?: string[] | undefined;
    concurrency?: number | undefined;
    bfs_preference?: "fifo" | "shallow_first" | undefined;
    startup_budget_seconds?: number | undefined;
    background_continue_discovery?: boolean | undefined;
    exposure_mode?: "flat" | "lazy" | undefined;
}>;
export type DiscoveryConfig = z.infer<typeof DiscoveryConfig>;
export declare const ConnectorConfig: z.ZodObject<{
    name: z.ZodString;
    binary: z.ZodString;
    /** Inserted after binary in argv (e.g. python -m module). */
    argv_prefix: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    default_timeout_seconds: z.ZodOptional<z.ZodNumber>;
    /** Timeout for each `--help` / `-h` spawn during discovery (default 25s). */
    help_timeout_seconds: z.ZodOptional<z.ZodNumber>;
    working_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    discovery: z.ZodOptional<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["help", "manual", "none"]>>;
        /** Help BFS depth; default 5 when omitted (see ADR 0006). */
        max_depth: z.ZodOptional<z.ZodNumber>;
        parser: z.ZodOptional<z.ZodString>;
        parser_module: z.ZodOptional<z.ZodString>;
        /** Explicit connector template id, e.g. "gh". Overrides auto-match by name. */
        template: z.ZodOptional<z.ZodString>;
        include_subgroups: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        help_argv: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        materialize_global_args: z.ZodOptional<z.ZodBoolean>;
        global_arg_allowlist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        global_arg_denylist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        concurrency: z.ZodOptional<z.ZodNumber>;
        /** BFS dequeue order: shallow paths first yields more leaf tools under a time budget. */
        bfs_preference: z.ZodOptional<z.ZodEnum<["fifo", "shallow_first"]>>;
        /** Stop expanding the help BFS after this many seconds (in-flight nodes still finish). */
        startup_budget_seconds: z.ZodOptional<z.ZodNumber>;
        /**
         * After budget-limited startup, continue help discovery in the background (default true when budget is set).
         * Set false to only use refresh_tools manually.
         */
        background_continue_discovery: z.ZodOptional<z.ZodBoolean>;
        exposure_mode: z.ZodOptional<z.ZodEnum<["flat", "lazy"]>>;
    }, "strip", z.ZodTypeAny, {
        mode: "help" | "manual" | "none";
        max_depth?: number | undefined;
        parser?: string | undefined;
        parser_module?: string | undefined;
        template?: string | undefined;
        include_subgroups?: string[] | undefined;
        help_argv?: string[] | undefined;
        materialize_global_args?: boolean | undefined;
        global_arg_allowlist?: string[] | undefined;
        global_arg_denylist?: string[] | undefined;
        concurrency?: number | undefined;
        bfs_preference?: "fifo" | "shallow_first" | undefined;
        startup_budget_seconds?: number | undefined;
        background_continue_discovery?: boolean | undefined;
        exposure_mode?: "flat" | "lazy" | undefined;
    }, {
        mode?: "help" | "manual" | "none" | undefined;
        max_depth?: number | undefined;
        parser?: string | undefined;
        parser_module?: string | undefined;
        template?: string | undefined;
        include_subgroups?: string[] | undefined;
        help_argv?: string[] | undefined;
        materialize_global_args?: boolean | undefined;
        global_arg_allowlist?: string[] | undefined;
        global_arg_denylist?: string[] | undefined;
        concurrency?: number | undefined;
        bfs_preference?: "fifo" | "shallow_first" | undefined;
        startup_budget_seconds?: number | undefined;
        background_continue_discovery?: boolean | undefined;
        exposure_mode?: "flat" | "lazy" | undefined;
    }>>;
    /** Directory of skill files; paths relative to config file directory. */
    skill_root: z.ZodOptional<z.ZodString>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    binary: string;
    enabled: boolean;
    argv_prefix?: string[] | undefined;
    default_timeout_seconds?: number | undefined;
    help_timeout_seconds?: number | undefined;
    working_dir?: string | null | undefined;
    env?: Record<string, string> | undefined;
    discovery?: {
        mode: "help" | "manual" | "none";
        max_depth?: number | undefined;
        parser?: string | undefined;
        parser_module?: string | undefined;
        template?: string | undefined;
        include_subgroups?: string[] | undefined;
        help_argv?: string[] | undefined;
        materialize_global_args?: boolean | undefined;
        global_arg_allowlist?: string[] | undefined;
        global_arg_denylist?: string[] | undefined;
        concurrency?: number | undefined;
        bfs_preference?: "fifo" | "shallow_first" | undefined;
        startup_budget_seconds?: number | undefined;
        background_continue_discovery?: boolean | undefined;
        exposure_mode?: "flat" | "lazy" | undefined;
    } | undefined;
    skill_root?: string | undefined;
    skills?: string[] | undefined;
}, {
    name: string;
    binary: string;
    argv_prefix?: string[] | undefined;
    enabled?: boolean | undefined;
    default_timeout_seconds?: number | undefined;
    help_timeout_seconds?: number | undefined;
    working_dir?: string | null | undefined;
    env?: Record<string, string> | undefined;
    discovery?: {
        mode?: "help" | "manual" | "none" | undefined;
        max_depth?: number | undefined;
        parser?: string | undefined;
        parser_module?: string | undefined;
        template?: string | undefined;
        include_subgroups?: string[] | undefined;
        help_argv?: string[] | undefined;
        materialize_global_args?: boolean | undefined;
        global_arg_allowlist?: string[] | undefined;
        global_arg_denylist?: string[] | undefined;
        concurrency?: number | undefined;
        bfs_preference?: "fifo" | "shallow_first" | undefined;
        startup_budget_seconds?: number | undefined;
        background_continue_discovery?: boolean | undefined;
        exposure_mode?: "flat" | "lazy" | undefined;
    } | undefined;
    skill_root?: string | undefined;
    skills?: string[] | undefined;
}>;
export type ConnectorConfig = z.infer<typeof ConnectorConfig>;
export declare const ToolDecl: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    connector: z.ZodString;
    command: z.ZodArray<z.ZodString, "many">;
    description: z.ZodOptional<z.ZodString>;
    args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        type: z.ZodDefault<z.ZodEnum<["string", "integer", "number", "boolean", "array"]>>;
        required: z.ZodDefault<z.ZodBoolean>;
        description: z.ZodOptional<z.ZodString>;
        default: z.ZodOptional<z.ZodAny>;
        enum: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        aliases: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        repeatable: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        type: "string" | "number" | "boolean" | "integer" | "array";
        required: boolean;
        description?: string | undefined;
        default?: any;
        enum?: string[] | undefined;
        aliases?: string[] | undefined;
        repeatable?: boolean | undefined;
    }, {
        type?: "string" | "number" | "boolean" | "integer" | "array" | undefined;
        required?: boolean | undefined;
        description?: string | undefined;
        default?: any;
        enum?: string[] | undefined;
        aliases?: string[] | undefined;
        repeatable?: boolean | undefined;
    }>>>;
    default_args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    output: z.ZodOptional<z.ZodObject<{
        format: z.ZodDefault<z.ZodEnum<["json", "text"]>>;
    }, "strip", z.ZodTypeAny, {
        format: "json" | "text";
    }, {
        format?: "json" | "text" | undefined;
    }>>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    connector: string;
    command: string[];
    description?: string | undefined;
    skills?: string[] | undefined;
    args?: Record<string, {
        type: "string" | "number" | "boolean" | "integer" | "array";
        required: boolean;
        description?: string | undefined;
        default?: any;
        enum?: string[] | undefined;
        aliases?: string[] | undefined;
        repeatable?: boolean | undefined;
    }> | undefined;
    default_args?: string[] | undefined;
    output?: {
        format: "json" | "text";
    } | undefined;
}, {
    connector: string;
    command: string[];
    description?: string | undefined;
    enabled?: boolean | undefined;
    skills?: string[] | undefined;
    args?: Record<string, {
        type?: "string" | "number" | "boolean" | "integer" | "array" | undefined;
        required?: boolean | undefined;
        description?: string | undefined;
        default?: any;
        enum?: string[] | undefined;
        aliases?: string[] | undefined;
        repeatable?: boolean | undefined;
    }> | undefined;
    default_args?: string[] | undefined;
    output?: {
        format?: "json" | "text" | undefined;
    } | undefined;
}>;
export type ToolDecl = z.infer<typeof ToolDecl>;
export declare const RuntimeConfig: z.ZodObject<{
    /**
     * Max concurrent help subprocesses across all connectors (default 24).
     * Per-connector concurrency still applies but shares this global cap.
     */
    max_inflight_help_spawns: z.ZodOptional<z.ZodNumber>;
    /** Cold start: discover enabled connectors in parallel (default true). */
    parallel_connector_discovery: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    max_inflight_help_spawns?: number | undefined;
    parallel_connector_discovery?: boolean | undefined;
}, {
    max_inflight_help_spawns?: number | undefined;
    parallel_connector_discovery?: boolean | undefined;
}>;
export type RuntimeConfig = z.infer<typeof RuntimeConfig>;
export declare const Config: z.ZodObject<{
    version: z.ZodLiteral<1>;
    connectors: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        binary: z.ZodString;
        /** Inserted after binary in argv (e.g. python -m module). */
        argv_prefix: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        enabled: z.ZodDefault<z.ZodBoolean>;
        default_timeout_seconds: z.ZodOptional<z.ZodNumber>;
        /** Timeout for each `--help` / `-h` spawn during discovery (default 25s). */
        help_timeout_seconds: z.ZodOptional<z.ZodNumber>;
        working_dir: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        discovery: z.ZodOptional<z.ZodObject<{
            mode: z.ZodDefault<z.ZodEnum<["help", "manual", "none"]>>;
            /** Help BFS depth; default 5 when omitted (see ADR 0006). */
            max_depth: z.ZodOptional<z.ZodNumber>;
            parser: z.ZodOptional<z.ZodString>;
            parser_module: z.ZodOptional<z.ZodString>;
            /** Explicit connector template id, e.g. "gh". Overrides auto-match by name. */
            template: z.ZodOptional<z.ZodString>;
            include_subgroups: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            help_argv: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            materialize_global_args: z.ZodOptional<z.ZodBoolean>;
            global_arg_allowlist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            global_arg_denylist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            concurrency: z.ZodOptional<z.ZodNumber>;
            /** BFS dequeue order: shallow paths first yields more leaf tools under a time budget. */
            bfs_preference: z.ZodOptional<z.ZodEnum<["fifo", "shallow_first"]>>;
            /** Stop expanding the help BFS after this many seconds (in-flight nodes still finish). */
            startup_budget_seconds: z.ZodOptional<z.ZodNumber>;
            /**
             * After budget-limited startup, continue help discovery in the background (default true when budget is set).
             * Set false to only use refresh_tools manually.
             */
            background_continue_discovery: z.ZodOptional<z.ZodBoolean>;
            exposure_mode: z.ZodOptional<z.ZodEnum<["flat", "lazy"]>>;
        }, "strip", z.ZodTypeAny, {
            mode: "help" | "manual" | "none";
            max_depth?: number | undefined;
            parser?: string | undefined;
            parser_module?: string | undefined;
            template?: string | undefined;
            include_subgroups?: string[] | undefined;
            help_argv?: string[] | undefined;
            materialize_global_args?: boolean | undefined;
            global_arg_allowlist?: string[] | undefined;
            global_arg_denylist?: string[] | undefined;
            concurrency?: number | undefined;
            bfs_preference?: "fifo" | "shallow_first" | undefined;
            startup_budget_seconds?: number | undefined;
            background_continue_discovery?: boolean | undefined;
            exposure_mode?: "flat" | "lazy" | undefined;
        }, {
            mode?: "help" | "manual" | "none" | undefined;
            max_depth?: number | undefined;
            parser?: string | undefined;
            parser_module?: string | undefined;
            template?: string | undefined;
            include_subgroups?: string[] | undefined;
            help_argv?: string[] | undefined;
            materialize_global_args?: boolean | undefined;
            global_arg_allowlist?: string[] | undefined;
            global_arg_denylist?: string[] | undefined;
            concurrency?: number | undefined;
            bfs_preference?: "fifo" | "shallow_first" | undefined;
            startup_budget_seconds?: number | undefined;
            background_continue_discovery?: boolean | undefined;
            exposure_mode?: "flat" | "lazy" | undefined;
        }>>;
        /** Directory of skill files; paths relative to config file directory. */
        skill_root: z.ZodOptional<z.ZodString>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        binary: string;
        enabled: boolean;
        argv_prefix?: string[] | undefined;
        default_timeout_seconds?: number | undefined;
        help_timeout_seconds?: number | undefined;
        working_dir?: string | null | undefined;
        env?: Record<string, string> | undefined;
        discovery?: {
            mode: "help" | "manual" | "none";
            max_depth?: number | undefined;
            parser?: string | undefined;
            parser_module?: string | undefined;
            template?: string | undefined;
            include_subgroups?: string[] | undefined;
            help_argv?: string[] | undefined;
            materialize_global_args?: boolean | undefined;
            global_arg_allowlist?: string[] | undefined;
            global_arg_denylist?: string[] | undefined;
            concurrency?: number | undefined;
            bfs_preference?: "fifo" | "shallow_first" | undefined;
            startup_budget_seconds?: number | undefined;
            background_continue_discovery?: boolean | undefined;
            exposure_mode?: "flat" | "lazy" | undefined;
        } | undefined;
        skill_root?: string | undefined;
        skills?: string[] | undefined;
    }, {
        name: string;
        binary: string;
        argv_prefix?: string[] | undefined;
        enabled?: boolean | undefined;
        default_timeout_seconds?: number | undefined;
        help_timeout_seconds?: number | undefined;
        working_dir?: string | null | undefined;
        env?: Record<string, string> | undefined;
        discovery?: {
            mode?: "help" | "manual" | "none" | undefined;
            max_depth?: number | undefined;
            parser?: string | undefined;
            parser_module?: string | undefined;
            template?: string | undefined;
            include_subgroups?: string[] | undefined;
            help_argv?: string[] | undefined;
            materialize_global_args?: boolean | undefined;
            global_arg_allowlist?: string[] | undefined;
            global_arg_denylist?: string[] | undefined;
            concurrency?: number | undefined;
            bfs_preference?: "fifo" | "shallow_first" | undefined;
            startup_budget_seconds?: number | undefined;
            background_continue_discovery?: boolean | undefined;
            exposure_mode?: "flat" | "lazy" | undefined;
        } | undefined;
        skill_root?: string | undefined;
        skills?: string[] | undefined;
    }>, "many">;
    tools: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        connector: z.ZodString;
        command: z.ZodArray<z.ZodString, "many">;
        description: z.ZodOptional<z.ZodString>;
        args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            type: z.ZodDefault<z.ZodEnum<["string", "integer", "number", "boolean", "array"]>>;
            required: z.ZodDefault<z.ZodBoolean>;
            description: z.ZodOptional<z.ZodString>;
            default: z.ZodOptional<z.ZodAny>;
            enum: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            aliases: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            repeatable: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            type: "string" | "number" | "boolean" | "integer" | "array";
            required: boolean;
            description?: string | undefined;
            default?: any;
            enum?: string[] | undefined;
            aliases?: string[] | undefined;
            repeatable?: boolean | undefined;
        }, {
            type?: "string" | "number" | "boolean" | "integer" | "array" | undefined;
            required?: boolean | undefined;
            description?: string | undefined;
            default?: any;
            enum?: string[] | undefined;
            aliases?: string[] | undefined;
            repeatable?: boolean | undefined;
        }>>>;
        default_args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        output: z.ZodOptional<z.ZodObject<{
            format: z.ZodDefault<z.ZodEnum<["json", "text"]>>;
        }, "strip", z.ZodTypeAny, {
            format: "json" | "text";
        }, {
            format?: "json" | "text" | undefined;
        }>>;
        skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        connector: string;
        command: string[];
        description?: string | undefined;
        skills?: string[] | undefined;
        args?: Record<string, {
            type: "string" | "number" | "boolean" | "integer" | "array";
            required: boolean;
            description?: string | undefined;
            default?: any;
            enum?: string[] | undefined;
            aliases?: string[] | undefined;
            repeatable?: boolean | undefined;
        }> | undefined;
        default_args?: string[] | undefined;
        output?: {
            format: "json" | "text";
        } | undefined;
    }, {
        connector: string;
        command: string[];
        description?: string | undefined;
        enabled?: boolean | undefined;
        skills?: string[] | undefined;
        args?: Record<string, {
            type?: "string" | "number" | "boolean" | "integer" | "array" | undefined;
            required?: boolean | undefined;
            description?: string | undefined;
            default?: any;
            enum?: string[] | undefined;
            aliases?: string[] | undefined;
            repeatable?: boolean | undefined;
        }> | undefined;
        default_args?: string[] | undefined;
        output?: {
            format?: "json" | "text" | undefined;
        } | undefined;
    }>>>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    runtime: z.ZodOptional<z.ZodObject<{
        /**
         * Max concurrent help subprocesses across all connectors (default 24).
         * Per-connector concurrency still applies but shares this global cap.
         */
        max_inflight_help_spawns: z.ZodOptional<z.ZodNumber>;
        /** Cold start: discover enabled connectors in parallel (default true). */
        parallel_connector_discovery: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        max_inflight_help_spawns?: number | undefined;
        parallel_connector_discovery?: boolean | undefined;
    }, {
        max_inflight_help_spawns?: number | undefined;
        parallel_connector_discovery?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    version: 1;
    connectors: {
        name: string;
        binary: string;
        enabled: boolean;
        argv_prefix?: string[] | undefined;
        default_timeout_seconds?: number | undefined;
        help_timeout_seconds?: number | undefined;
        working_dir?: string | null | undefined;
        env?: Record<string, string> | undefined;
        discovery?: {
            mode: "help" | "manual" | "none";
            max_depth?: number | undefined;
            parser?: string | undefined;
            parser_module?: string | undefined;
            template?: string | undefined;
            include_subgroups?: string[] | undefined;
            help_argv?: string[] | undefined;
            materialize_global_args?: boolean | undefined;
            global_arg_allowlist?: string[] | undefined;
            global_arg_denylist?: string[] | undefined;
            concurrency?: number | undefined;
            bfs_preference?: "fifo" | "shallow_first" | undefined;
            startup_budget_seconds?: number | undefined;
            background_continue_discovery?: boolean | undefined;
            exposure_mode?: "flat" | "lazy" | undefined;
        } | undefined;
        skill_root?: string | undefined;
        skills?: string[] | undefined;
    }[];
    skills?: string[] | undefined;
    tools?: Record<string, {
        enabled: boolean;
        connector: string;
        command: string[];
        description?: string | undefined;
        skills?: string[] | undefined;
        args?: Record<string, {
            type: "string" | "number" | "boolean" | "integer" | "array";
            required: boolean;
            description?: string | undefined;
            default?: any;
            enum?: string[] | undefined;
            aliases?: string[] | undefined;
            repeatable?: boolean | undefined;
        }> | undefined;
        default_args?: string[] | undefined;
        output?: {
            format: "json" | "text";
        } | undefined;
    }> | undefined;
    runtime?: {
        max_inflight_help_spawns?: number | undefined;
        parallel_connector_discovery?: boolean | undefined;
    } | undefined;
}, {
    version: 1;
    connectors: {
        name: string;
        binary: string;
        argv_prefix?: string[] | undefined;
        enabled?: boolean | undefined;
        default_timeout_seconds?: number | undefined;
        help_timeout_seconds?: number | undefined;
        working_dir?: string | null | undefined;
        env?: Record<string, string> | undefined;
        discovery?: {
            mode?: "help" | "manual" | "none" | undefined;
            max_depth?: number | undefined;
            parser?: string | undefined;
            parser_module?: string | undefined;
            template?: string | undefined;
            include_subgroups?: string[] | undefined;
            help_argv?: string[] | undefined;
            materialize_global_args?: boolean | undefined;
            global_arg_allowlist?: string[] | undefined;
            global_arg_denylist?: string[] | undefined;
            concurrency?: number | undefined;
            bfs_preference?: "fifo" | "shallow_first" | undefined;
            startup_budget_seconds?: number | undefined;
            background_continue_discovery?: boolean | undefined;
            exposure_mode?: "flat" | "lazy" | undefined;
        } | undefined;
        skill_root?: string | undefined;
        skills?: string[] | undefined;
    }[];
    skills?: string[] | undefined;
    tools?: Record<string, {
        connector: string;
        command: string[];
        description?: string | undefined;
        enabled?: boolean | undefined;
        skills?: string[] | undefined;
        args?: Record<string, {
            type?: "string" | "number" | "boolean" | "integer" | "array" | undefined;
            required?: boolean | undefined;
            description?: string | undefined;
            default?: any;
            enum?: string[] | undefined;
            aliases?: string[] | undefined;
            repeatable?: boolean | undefined;
        }> | undefined;
        default_args?: string[] | undefined;
        output?: {
            format?: "json" | "text" | undefined;
        } | undefined;
    }> | undefined;
    runtime?: {
        max_inflight_help_spawns?: number | undefined;
        parallel_connector_discovery?: boolean | undefined;
    } | undefined;
}>;
export type Config = z.infer<typeof Config>;
/**
 * Validate a raw parsed YAML object against the config schema.
 * Throws an Error with a human-readable, path-annotated message on failure so
 * callers can surface it directly to users.
 */
export declare function validateConfig(raw: unknown): Config;
