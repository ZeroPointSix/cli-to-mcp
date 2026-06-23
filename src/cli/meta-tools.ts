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
import { exec, type ExecOptions } from "node:child_process";
import { resolve, relative } from "node:path";
import type { LoadedConfig, ResolvedConnector } from "../config/config-loader.js";
import type { InMemoryToolRegistry } from "../registry/tool-registry.js";
import type { CacheStore } from "../cache/db.js";
import type { ToolDefinition } from "../registry/tool-definition.js";
import { summarizeSources } from "../discovery/sources.js";
import { buildDiscoveryEngine } from "../discovery/engine-factory.js";
import type { HelpParserRegistry } from "../discovery/parser-registry.js";

export type MetaToolsDeps = {
  registry: InMemoryToolRegistry;
  cache: CacheStore;
  config: LoadedConfig;
  connectors: Map<string, ResolvedConnector>;
  /** Help parser registry; when omitted doctor reports parsers.registered=[] with a note. */
  parserRegistry?: HelpParserRegistry;
  log?: (msg: string) => void;
};

export type MetaToolHandlers = {
  has(name: string): boolean;
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
  list(): Array<{ name: string; description: string }>;
};

const META_DEFS: Array<{ name: string; description: string }> = [
  { name: "list_connectors", description: "List registered CLI connectors." },
  { name: "doctor", description: "Check CLI binary, version, and cache state." },
  { name: "refresh_tools", description: "Re-run discovery and refresh the tool registry." },
  { name: "get_skills", description: "Read skill files for a connector, command, or tool." },
  { name: "get_tool_source", description: "Report the source (yaml/template/help/mixed) of a tool." },
];

export class MetaTools implements MetaToolHandlers {
  private deps: MetaToolsDeps;
  constructor(deps: MetaToolsDeps) {
    this.deps = deps;
  }

  list() {
    return [...META_DEFS];
  }

  has(name: string): boolean {
    return META_DEFS.some((m) => m.name === name);
  }

  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
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
      default:
        return { ok: false, error: `unknown meta tool: ${name}` };
    }
  }

  private listConnectors() {
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

  private async doctor() {
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

      // binary_on_path: spawn `binary --version` (then --help) with 5s timeout.
      // Catches ENOENT, non-zero exit, and timeout — never throws.
      const binaryOnPath = await checkBinaryOnPath(c.binary, c.working_dir);

      connectors.push({
        name: c.name,
        binary: c.binary,
        enabled: c.enabled,
        cached_version: cached?.version ?? null,
        last_scan_status: latestScan?.status ?? null,
        last_scan_error: latestScan?.error ?? null,
        tool_count: connectorTools.length,
        binary_on_path: binaryOnPath,
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
    return {
      ok: true,
      config_hash: this.deps.config.configHash,
      config_dir: configDir,
      cache: { tools_count: this.deps.registry.size() },
      parsers,
      connectors,
    };
  }

  private async refreshTools() {
    const { engine, parserRegistry } = await buildDiscoveryEngine(this.deps.config, {
      parserRegistry: this.deps.parserRegistry,
      log: this.deps.log,
    });
    this.deps.parserRegistry = parserRegistry;
    const previous = this.deps.registry.listTools();
    const byConnector = new Map<string, ToolDefinition[]>();
    for (const t of previous) {
      const list = byConnector.get(t.connectorName) ?? [];
      list.push(t);
      byConnector.set(t.connectorName, list);
    }

    let failures = 0;
    let refreshedCount = 0;
    let anySuccess = false;

    for (const conn of this.deps.config.connectors) {
      if (!conn.enabled) continue;
      const scanRunId = this.deps.cache.startScanRun(conn.name);
      try {
        const discovered = await engine.discover(conn, this.deps.config);
        byConnector.set(conn.name, discovered);
        refreshedCount += discovered.length;
        anySuccess = true;
        this.deps.cache.finishScanRun(scanRunId, "ok", null);
        const sc = summarizeSources(discovered);
        this.deps.log?.(
          `discovery summary: ${conn.name} tools=${discovered.length} yaml=${sc.yaml} template=${sc.template} help=${sc.help} mixed=${sc.mixed}`,
        );
      } catch (err) {
        failures++;
        this.deps.cache.finishScanRun(scanRunId, "failed", String(err));
        this.deps.log?.(`refresh failed for ${conn.name}: ${String(err)}`);
        // Keep byConnector entry from previous snapshot for this connector.
      }
    }

    const merged: ToolDefinition[] = [];
    for (const conn of this.deps.config.connectors) {
      merged.push(...(byConnector.get(conn.name) ?? []));
    }

    if (anySuccess) {
      this.deps.cache.replaceTools(this.deps.config.configHash, merged);
      this.deps.registry.replaceAll(merged);
    }

    return {
      ok: failures === 0,
      refreshed: refreshedCount,
      failures,
      tools_in_registry: this.deps.registry.size(),
      note:
        failures > 0 && !anySuccess
          ? "old tools retained"
          : failures > 0
            ? "partial refresh: failed connectors kept previous tools"
            : undefined,
    };
  }

  private getSkills(args: Record<string, unknown>) {
    const connectorName = args.connector as string | undefined;
    const toolName = args.tool as string | undefined;
    const listMode = args.list === true;
    const fileArg = args.file as string | undefined;

    if (listMode || fileArg !== undefined) {
      if (!connectorName) {
        return { ok: false, error: "missing 'connector' argument (required for list/file)" };
      }
      const conn = this.deps.config.connectors.find((c) => c.name === connectorName);
      if (!conn) return { ok: false, error: `connector '${connectorName}' not found` };
      if (!conn.skill_root) {
        return { ok: false, error: `connector '${connectorName}' has no skill_root configured` };
      }
      if (listMode) {
        try {
          const entries = readdirSync(conn.skill_root, { withFileTypes: true });
          const files = entries.filter((e) => e.isFile()).map((e) => e.name).sort();
          return { ok: true, connector: connectorName, skill_root: conn.skill_root, files };
        } catch (err) {
          return { ok: false, error: `cannot list skill_root: ${String(err)}` };
        }
      }
      const resolved = resolvePathUnderSkillRoot(conn.skill_root, fileArg!);
      if (!resolved.ok) return { ok: false, error: resolved.error };
      try {
        const content = readFileSync(resolved.abs, "utf8");
        return {
          ok: true,
          connector: connectorName,
          file: fileArg,
          ref: resolved.abs,
          content,
        };
      } catch (err) {
        return { ok: false, error: `cannot read file: ${String(err)}` };
      }
    }

    const skills: Array<{ ref: string; content: string }> = [];

    const collect = (refs: string[]) => {
      for (const ref of refs) {
        try {
          skills.push({ ref, content: readFileSync(ref, "utf8") });
        } catch (err) {
          skills.push({ ref, content: `[unreadable: ${String(err)}]` });
        }
      }
    };

    if (toolName) {
      const tool = this.deps.registry.getTool(toolName);
      if (tool) collect(tool.skillRefs);
    }
    if (connectorName) {
      const conn = this.deps.config.connectors.find((c) => c.name === connectorName);
      if (conn) collect(conn.skills);
    }
    if (!connectorName && !toolName) {
      for (const c of this.deps.config.connectors) collect(c.skills);
      for (const t of this.deps.registry.listTools()) collect(t.skillRefs);
    }

    return { ok: true, skills };
  }

  private getToolSource(args: Record<string, unknown>) {
    const name = args.name as string | undefined;
    if (!name) return { ok: false, error: "missing 'name' argument" };
    const tool = this.deps.registry.getTool(name);
    if (!tool) return { ok: false, error: `tool '${name}' not found` };
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
 * Check whether a CLI binary is reachable on PATH by spawning `binary --version`
 * (falling back to `binary --help`). Returns true only on exit code 0; catches
 * ENOENT, non-zero exit, and timeout (5s) — never throws, so doctor stays
 * crash-free even when a binary is missing.
 */
function checkBinaryOnPath(
  binary: string,
  workingDir: string | null,
  timeoutMs = 5000,
): Promise<boolean> {
  const opts: ExecOptions = {
    timeout: timeoutMs,
    cwd: workingDir ?? undefined,
    // Avoid inheriting stdio that could hang the child on prompts.
    windowsHide: true,
  };
  const tryCmd = (cmd: string): Promise<boolean> =>
    new Promise((resolve) => {
      exec(cmd, opts, (err) => resolve(!err));
    });
  return tryCmd(`"${binary}" --version`).then((ok) => (ok ? true : tryCmd(`"${binary}" --help`)));
}

/**
 * Resolve a user-provided relative path under skill_root. Rejects `..`, absolute
 * paths, and any result that escapes the root directory.
 */
export function resolvePathUnderSkillRoot(
  skillRoot: string,
  relativePath: string,
): { ok: true; abs: string } | { ok: false; error: string } {
  const root = resolve(skillRoot);
  const trimmed = relativePath.trim();
  if (!trimmed) return { ok: false, error: "empty file path" };
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
