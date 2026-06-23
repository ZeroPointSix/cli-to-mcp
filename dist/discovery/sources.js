import { defineTool } from "../registry/tool-definition.js";
import { toolFromYamlDecl } from "../builder/tool-from-config.js";
import { TemplateRegistry } from "./template-registry.js";
import { runHelp } from "./help-runner.js";
import { HelpParserRegistry } from "./parser-registry.js";
import { genericPlugin } from "./plugins/generic.js";
import { cobraPlugin } from "./plugins/cobra.js";
import { toolFromDiscovered } from "../builder/tool-from-discovered.js";
/** Merge artifacts into final ToolDefinitions. Later entries win on conflicts. */
export function mergeArtifacts(artifacts) {
    // Sort by priority: help (lowest) -> template -> yaml (highest).
    const priority = {
        help: 0,
        template: 1,
        yaml: 2,
    };
    const sorted = [...artifacts].sort((a, b) => priority[a.kind] - priority[b.kind]);
    const merged = new Map();
    const sourceKinds = new Map();
    for (const art of sorted) {
        const existing = merged.get(art.key);
        if (!existing) {
            merged.set(art.key, art.tool);
            sourceKinds.set(art.key, new Set([art.kind]));
            continue;
        }
        // Overlay: higher-priority fields overwrite. For Phase 1 we replace the
        // whole tool but carry forward merged source provenance.
        merged.set(art.key, art.tool);
        sourceKinds.get(art.key).add(art.kind);
    }
    // Apply merged source labels.
    for (const [key, tool] of merged) {
        const kinds = sourceKinds.get(key);
        const finalSource = kinds.size > 1 ? "mixed" : [...kinds][0];
        tool.source = finalSource;
        tool.sources = [...kinds].map((k) => ({
            kind: k,
            confidence: artifacts.find((a) => a.key === key && a.kind === k)?.confidence ?? 1,
        }));
    }
    return [...merged.values()];
}
/**
 * YamlSource: turns explicit `tools:` declarations into tools.
 * Highest priority — user YAML always wins over auto-discovered tools.
 */
export class YamlSource {
    kind = "yaml";
    async discover(connector, config) {
        const out = [];
        for (const [name, decl] of Object.entries(config.tools ?? {})) {
            if (decl.connector !== connector.name)
                continue;
            const tool = toolFromYamlDecl(name, decl, connector);
            out.push({
                tool,
                kind: "yaml",
                confidence: 1,
                key: name,
            });
        }
        return out;
    }
}
/**
 * TemplateSource: built-in connector packs (ADR 0003 §"Connector Template").
 *
 * When a connector matches a registered pack — either by name (auto-match) or
 * via `discovery.template: <id>` — every tool in the pack becomes a template
 * artifact. Template confidence (0.85) sits above help (~0.35) and below yaml
 * (1.0), so user YAML still wins on conflicts.
 */
export class TemplateSource {
    kind = "template";
    registry;
    constructor(registry) {
        this.registry = registry ?? new TemplateRegistry();
    }
    withRegistry(registry) {
        this.registry = registry;
        return this;
    }
    async discover(connector, _config) {
        const pack = this.registry.resolve(connector);
        if (!pack)
            return [];
        const out = [];
        for (const [name, decl] of Object.entries(pack.tools)) {
            // Pack tools declare connector = pack id (e.g. "gh"). When a user
            // aliases a connector (name "mycli" but discovery.template: "gh"), we
            // rebind the tool to the actual connector so executor looks up the
            // right binary/env. Skip only if the pack's connector field is set and
            // does not match either the connector name or the pack id.
            const packConn = decl.connector;
            if (packConn !== connector.name && packConn !== pack.id)
                continue;
            const rebound = { ...decl, connector: connector.name };
            const tool = toolFromYamlDecl(name, rebound, connector, "template");
            out.push({ tool, kind: "template", confidence: 0.85, key: name });
        }
        return out;
    }
}
/**
 * HelpSource: scans `--help` (BFS up to max_depth) and parses each node into
 * DiscoveredCommands, then turns leaf commands into help artifacts.
 *
 * - Respects `discovery.mode`: `manual`/`none` skip help entirely.
 * - Uses the connector's parser id (or auto-selects via match()).
 * - Only leaf commands (no subcommands) become tools, so `gh` root does not get
 *   exposed while `gh pr view` does.
 * - Confidence 0.35 — lowest priority, supplements template/yaml.
 */
export class HelpSource {
    kind = "help";
    parserRegistry;
    runHelpFn;
    log;
    constructor(opts) {
        this.parserRegistry = opts?.parserRegistry ?? createDefaultParserRegistry();
        this.runHelpFn = opts?.runHelpFn ?? runHelp;
        this.log = opts?.log ?? (() => { });
    }
    async discover(connector, _config) {
        const mode = connector.discovery?.mode ?? "help";
        if (mode !== "help")
            return [];
        /** Default 5: recurse help tree up to 5 command segments; deeper paths are not scanned (ADR 0006). */
        const maxDepth = connector.discovery?.max_depth ?? 5;
        this.log(`help discovery: ${connector.name} max_depth=${maxDepth}`);
        const parserId = connector.discovery?.parser;
        const helpTimeoutMs = (connector.default_timeout_seconds ?? 10) * 1000;
        const includeSubgroups = connector.discovery?.include_subgroups;
        const artifacts = [];
        const visited = new Set();
        // BFS queue of { path }.
        const queue = [{ path: [] }];
        while (queue.length > 0) {
            const { path } = queue.shift();
            const key = path.join(" ");
            if (visited.has(key))
                continue;
            visited.add(key);
            const out = await this.runHelpFn(connector.binary, path, {
                timeoutMs: helpTimeoutMs,
                env: connector.env ? { ...process.env, ...connector.env } : undefined,
                cwd: connector.working_dir ?? undefined,
                argvPrefix: connector.argv_prefix ? [...connector.argv_prefix] : undefined,
            });
            if (!out.rawHelp)
                continue;
            const ctx = {
                connectorName: connector.name,
                binary: connector.binary,
                path,
                rawHelp: out.rawHelp,
                exitCode: out.exitCode,
            };
            const cmd = this.parserRegistry.parse(ctx, parserId);
            const usedParser = this.parserRegistry.selectPlugin(ctx, parserId);
            this.log(`help node: ${connector.name} path=[${path.join(" ")}] parser=${usedParser?.id ?? "none"} subcommands=${cmd.subcommands.length}`);
            // Enqueue subcommands if within depth and not filtered.
            if (path.length < maxDepth) {
                let subs = cmd.subcommands;
                if (path.length === 0 && includeSubgroups && includeSubgroups.length > 0) {
                    subs = subs.filter((s) => includeSubgroups.includes(s));
                }
                for (const sub of subs) {
                    queue.push({ path: [...path, sub] });
                }
            }
            // Tool generation rule (see tool-from-discovered.ts): only leaf commands
            // become tools. Root and intermediate nodes are traversal only.
            const isLeaf = cmd.subcommands.length === 0;
            if (!isLeaf || path.length === 0)
                continue;
            const tool = toolFromDiscovered(cmd, connector);
            if (!tool)
                continue;
            artifacts.push({ tool, kind: "help", confidence: 0.35, key: tool.name });
        }
        return artifacts;
    }
}
/** Build the default parser registry with generic + cobra registered. */
export function createDefaultParserRegistry() {
    const reg = new HelpParserRegistry();
    reg.register(genericPlugin);
    reg.register(cobraPlugin);
    return reg;
}
/** Helper for tests: build a template artifact from a partial tool. */
export function makeTemplateArtifact(tool, confidence = 0.5) {
    const defined = defineTool({ ...tool, source: "template" });
    return { tool: defined, kind: "template", confidence, key: defined.name };
}
/** Helper for tests: build a help artifact. */
export function makeHelpArtifact(tool, confidence = 0.3) {
    const defined = defineTool({ ...tool, source: "help" });
    return { tool: defined, kind: "help", confidence, key: defined.name };
}
/**
 * Count final tools by their resolved source label. Used by refresh_tools and
 * runtime startup to emit a per-connector discovery summary. A tool whose
 * `source` is "mixed" (multiple sources contributed via mergeArtifacts) is
 * counted only under `mixed`.
 */
export function summarizeSources(tools) {
    return {
        yaml: tools.filter((t) => t.source === "yaml").length,
        template: tools.filter((t) => t.source === "template").length,
        help: tools.filter((t) => t.source === "help").length,
        mixed: tools.filter((t) => t.source === "mixed").length,
    };
}
