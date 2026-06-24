/**
 * Phase 1 fixed meta-tools (architecture §5.1, PRD §10.9):
 *
 *   list_connectors  — list registered CLI connectors
 *   doctor           — check binary / version / cache state
 *   refresh_tools    — re-run discovery and update registry + cache
 *   get_skills       — read skill files referenced by connector/tool
 *   get_tool_source  — report which source a tool came from
 *
 * These are exposed alongside dynamic tools via the MCP server. They have
 * reserved names (META_TOOL_NAMES) so user tools can never shadow them.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { summarizeSources } from "../discovery/sources.js";
import { buildDiscoveryEngine } from "../discovery/engine-factory.js";
import { getToolSchema, listToolCategories, listToolsByCategory, searchTools, } from "./tool-explorer.js";
import { executeDynamicTool } from "./execute-dynamic-tool.js";
import { buildMetaToolListEntries } from "./meta-tool-schemas.js";
import { normalizeRegistryToolName } from "./normalize-meta-args.js";
import { probeConnectorBinary } from "../executor/binary-probe.js";
import { applyMergedTools, discoverOneConnector, snapshotRegistryByConnector, } from "./discovery-runner.js";
const META_DEFS = [
    { name: "list_connectors", description: "List registered CLI connectors." },
    { name: "doctor", description: "Check CLI binary, version, and cache state." },
    { name: "refresh_tools", description: "Re-run discovery and refresh the tool registry." },
    { name: "get_skills", description: "Read skill files for a connector, command, or tool." },
    { name: "get_tool_source", description: "Report the source (yaml/template/help/mixed) of a tool." },
    { name: "list_tool_categories", description: "List tool categories (connector / command prefix) for progressive discovery." },
    { name: "list_tools_by_category", description: "List tool summaries in a category (use get_tool_schema for full schema)." },
    { name: "search_tools", description: "Search tools by name, description, or command path." },
    { name: "get_tool_schema", description: "Return full inputSchema for one tool by name." },
    {
        name: "call_tool",
        description: "Execute any registry CLI tool by name (required for exposure_mode lazy when the host only registers tools/list). Args: name, arguments (object).",
    },
];
export class MetaTools {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    list() {
        return buildMetaToolListEntries(META_DEFS);
    }
    has(name) {
        return META_DEFS.some((m) => m.name === name);
    }
    async call(name, args) {
        switch (name) {
            case "list_connectors":
                return this.listConnectors();
            case "doctor":
                return this.doctor();
            case "refresh_tools":
                return this.refreshTools();
            case "get_skills":
                return this.getSkills(args);
            case "get_tool_source":
                return this.getToolSource(args);
            case "list_tool_categories":
                return { ok: true, categories: listToolCategories(this.deps.registry) };
            case "list_tools_by_category": {
                const category = args.category;
                if (!category)
                    return { ok: false, error: "missing 'category' argument" };
                const limit = typeof args.limit === "number" ? args.limit : 200;
                const { tools, unknown_category } = listToolsByCategory(this.deps.registry, category, limit);
                return {
                    ok: true,
                    category,
                    tools,
                    unknown_category,
                    ...(unknown_category ? { hint: "Unknown category id; use list_tool_categories for valid ids." } : {}),
                };
            }
            case "search_tools": {
                const query = args.query;
                if (!query)
                    return { ok: false, error: "missing 'query' argument" };
                const limit = typeof args.limit === "number" ? args.limit : 50;
                return { ok: true, query, tools: searchTools(this.deps.registry, query, limit) };
            }
            case "get_tool_schema": {
                const toolName = args.name;
                if (!toolName)
                    return { ok: false, error: "missing 'name' argument" };
                return getToolSchema(this.deps.registry, toolName);
            }
            case "call_tool": {
                const toolName = normalizeRegistryToolName(args.name);
                if (!toolName) {
                    return {
                        ok: false,
                        error: "missing or invalid 'name' (use a string tool name, e.g. git_status; do not pass nested JSON as name)",
                    };
                }
                if (!this.deps.executor) {
                    return { ok: false, error: "call_tool unavailable (executor not wired)" };
                }
                const toolArgs = args.arguments && typeof args.arguments === "object" && !Array.isArray(args.arguments)
                    ? args.arguments
                    : {};
                return executeDynamicTool({
                    registry: this.deps.registry,
                    executor: this.deps.executor,
                    connectors: this.deps.connectors,
                }, toolName, toolArgs);
            }
            default:
                return { ok: false, error: `unknown meta tool: ${name}` };
        }
    }
    listConnectors() {
        return {
            ok: true,
            connectors: this.deps.config.connectors.map((c) => ({
                name: c.name,
                binary: c.binary,
                enabled: c.enabled,
                working_dir: c.working_dir,
                default_timeout_seconds: c.default_timeout_seconds,
                discovery: c.discovery,
            })),
        };
    }
    async doctor() {
        const parserRegistry = this.deps.parserRegistry;
        const registered = parserRegistry
            ? parserRegistry.list().map((p) => ({ id: p.id, display_name: p.displayName }))
            : [];
        const registryIds = parserRegistry ? parserRegistry.list().map((p) => p.id) : [];
        const parsers = parserRegistry
            ? { registered }
            : { registered, note: "parser registry unavailable" };
        const connectors = [];
        for (const c of this.deps.config.connectors) {
            const cached = this.deps.cache.getConnector(c.name);
            const latestScan = this.deps.cache.latestScanRun(c.name);
            const configuredParser = c.discovery?.parser;
            // Default fallback parser is "generic" (the always-matches plugin).
            const discoveryParser = configuredParser ?? "generic";
            const parserResolved = registryIds.includes(discoveryParser);
            const skills = (c.skills ?? []).map((path) => ({ path, exists: existsSync(path) }));
            const connectorTools = this.deps.registry
                .listTools()
                .filter((t) => t.connectorName === c.name);
            const sc = summarizeSources(connectorTools);
            const env = c.env ? { ...process.env, ...c.env } : process.env;
            const probe = await probeConnectorBinary(c, env);
            connectors.push({
                name: c.name,
                binary: c.binary,
                enabled: c.enabled,
                cached_version: cached?.version ?? null,
                last_scan_status: latestScan?.status ?? null,
                last_scan_error: latestScan?.error ?? null,
                tool_count: connectorTools.length,
                /** @deprecated use executor_probe.ok — same spawn path as CommandExecutor */
                binary_on_path: probe.ok,
                executor_probe: {
                    ok: probe.ok,
                    tried_argv: probe.tried_argv,
                    exit_code: probe.exit_code,
                    stderr_snippet: probe.stderr_snippet || undefined,
                },
                discovery: { parser: discoveryParser },
                parser_resolved: parserResolved,
                skills,
                tools: {
                    from_yaml: sc.yaml,
                    from_template: sc.template,
                    from_help: sc.help,
                    mixed: sc.mixed,
                },
            });
        }
        const configDir = resolve(this.deps.config.configDir);
        const bg = this.deps.getBackgroundDiscoveryStatus?.() ?? null;
        return {
            ok: true,
            config_hash: this.deps.config.configHash,
            config_dir: configDir,
            cache: { tools_count: this.deps.registry.size() },
            background_discovery: bg,
            parsers,
            connectors,
        };
    }
    async refreshTools() {
        const { engine, parserRegistry } = await buildDiscoveryEngine(this.deps.config, {
            parserRegistry: this.deps.parserRegistry,
            log: this.deps.log,
            cache: this.deps.cache,
        });
        this.deps.parserRegistry = parserRegistry;
        const byConnector = snapshotRegistryByConnector(this.deps.registry);
        let failures = 0;
        let refreshedCount = 0;
        let anySuccess = false;
        for (const conn of this.deps.config.connectors) {
            if (!conn.enabled)
                continue;
            try {
                const discovered = await discoverOneConnector(engine, conn, this.deps.config, (m) => this.deps.log?.(m), this.deps.cache);
                byConnector.set(conn.name, discovered);
                refreshedCount += discovered.length;
                anySuccess = true;
            }
            catch {
                failures++;
            }
        }
        if (anySuccess) {
            applyMergedTools(this.deps.config, this.deps.registry, this.deps.cache, byConnector);
        }
        return {
            ok: failures === 0,
            refreshed: refreshedCount,
            failures,
            tools_in_registry: this.deps.registry.size(),
            note: failures > 0 && !anySuccess
                ? "old tools retained"
                : failures > 0
                    ? "partial refresh: failed connectors kept previous tools"
                    : undefined,
        };
    }
    getSkills(args) {
        const connectorName = args.connector;
        const toolName = args.tool;
        const listMode = args.list === true;
        const fileArg = args.file;
        if (listMode || fileArg !== undefined) {
            if (!connectorName) {
                return { ok: false, error: "missing 'connector' argument (required for list/file)" };
            }
            const conn = this.deps.config.connectors.find((c) => c.name === connectorName);
            if (!conn)
                return { ok: false, error: `connector '${connectorName}' not found` };
            if (!conn.skill_root) {
                return { ok: false, error: `connector '${connectorName}' has no skill_root configured` };
            }
            if (listMode) {
                try {
                    const entries = readdirSync(conn.skill_root, { withFileTypes: true });
                    const files = entries.filter((e) => e.isFile()).map((e) => e.name).sort();
                    return { ok: true, connector: connectorName, skill_root: conn.skill_root, files };
                }
                catch (err) {
                    return { ok: false, error: `cannot list skill_root: ${String(err)}` };
                }
            }
            const resolved = resolvePathUnderSkillRoot(conn.skill_root, fileArg);
            if (!resolved.ok)
                return { ok: false, error: resolved.error };
            try {
                const content = readFileSync(resolved.abs, "utf8");
                return {
                    ok: true,
                    connector: connectorName,
                    file: fileArg,
                    ref: resolved.abs,
                    content,
                };
            }
            catch (err) {
                return { ok: false, error: `cannot read file: ${String(err)}` };
            }
        }
        const skills = [];
        const collect = (refs) => {
            for (const ref of refs) {
                try {
                    skills.push({ ref, content: readFileSync(ref, "utf8") });
                }
                catch (err) {
                    skills.push({ ref, content: `[unreadable: ${String(err)}]` });
                }
            }
        };
        if (toolName) {
            const tool = this.deps.registry.getTool(toolName);
            if (tool)
                collect(tool.skillRefs);
        }
        if (connectorName) {
            const conn = this.deps.config.connectors.find((c) => c.name === connectorName);
            if (conn)
                collect(conn.skills);
        }
        if (!connectorName && !toolName) {
            for (const c of this.deps.config.connectors)
                collect(c.skills);
            for (const t of this.deps.registry.listTools())
                collect(t.skillRefs);
        }
        return { ok: true, skills };
    }
    getToolSource(args) {
        const name = args.name;
        if (!name)
            return { ok: false, error: "missing 'name' argument" };
        const tool = this.deps.registry.getTool(name);
        if (!tool)
            return { ok: false, error: `tool '${name}' not found` };
        return {
            ok: true,
            name: tool.name,
            source: tool.source,
            sources: tool.sources,
            connector: tool.connectorName,
            binary: tool.binary,
            command: tool.command,
        };
    }
}
/**
 * Resolve a user-provided relative path under skill_root. Rejects `..`, absolute
 * paths, and any result that escapes the root directory.
 */
export function resolvePathUnderSkillRoot(skillRoot, relativePath) {
    const root = resolve(skillRoot);
    const trimmed = relativePath.trim();
    if (!trimmed)
        return { ok: false, error: "empty file path" };
    const normalized = trimmed.replace(/\\/g, "/");
    if (normalized.includes("..") || normalized.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(trimmed)) {
        return { ok: false, error: "path traversal or absolute paths are not allowed" };
    }
    const abs = resolve(root, trimmed);
    const relToRoot = relative(root, abs);
    if (relToRoot.startsWith("..") || relToRoot.split(/[/\\]/).includes("..")) {
        return { ok: false, error: "path escapes skill_root" };
    }
    return { ok: true, abs };
}
//# sourceMappingURL=meta-tools.js.map