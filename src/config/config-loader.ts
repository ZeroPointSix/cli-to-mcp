/**
 * ConfigLoader: read cli-to-mcp.yaml from disk, parse YAML, validate against
 * the zod schema, and resolve relative paths (skills, working_dir, parser_module)
 * against the config file's directory so the runtime can use absolute paths.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  validateConfig,
  type Config,
  type ConnectorConfig,
  type ToolDecl,
} from "./schema.js";

export type LoadedConfig = {
  config: Config;
  runtime: Config["runtime"];
  /** Absolute directory of the config file, used as base for relative paths. */
  configDir: string;
  /** Absolute paths to custom parser modules from top-level `parsers:`. */
  parserModules: string[];
  /** Connectors with relative paths resolved to absolute. */
  connectors: ResolvedConnector[];
  /** Tools keyed by name with relative skill paths resolved. */
  tools: Record<string, ResolvedTool>;
  /** Hex hash of the raw file contents, used by cache invalidation. */
  configHash: string;
};

export type ResolvedConnector = Omit<
  ConnectorConfig,
  "skills" | "working_dir" | "discovery" | "skill_root"
> & {
  skills: string[];
  working_dir: string | null;
  /** Absolute skill directory when configured; otherwise null. */
  skill_root: string | null;
  discovery: ConnectorConfig["discovery"] & { parser_module?: string };
};

export type ResolvedTool = Omit<ToolDecl, "skills"> & {
  skills: string[];
};

export class ConfigLoader {
  load(configPath: string): LoadedConfig {
    const abs = isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath);
    const raw = readFileSync(abs, "utf8");
    const parsed = parseYaml(raw);
    const config = validateConfig(parsed);
    const configDir = dirname(abs);

    const connectors: ResolvedConnector[] = config.connectors.map((c) => ({
      ...c,
      skills: (c.skills ?? []).map((s) => resolve(configDir, s)),
      working_dir: c.working_dir ? resolve(configDir, c.working_dir) : null,
      skill_root: c.skill_root ? resolve(configDir, c.skill_root) : null,
      discovery: c.discovery
        ? {
            ...c.discovery,
            parser_module: c.discovery.parser_module
              ? resolve(configDir, c.discovery.parser_module)
              : undefined,
          }
        : { mode: "help" as const },
    }));

    const tools: Record<string, ResolvedTool> = {};
    for (const [name, decl] of Object.entries(config.tools ?? {})) {
      tools[name] = {
        ...decl,
        skills: (decl.skills ?? []).map((s) => resolve(configDir, s)),
      };
    }

    const parserModules = (config.parsers ?? []).map((p) => resolve(configDir, p));

    return {
      config,
      runtime: config.runtime,
      configDir,
      parserModules,
      connectors,
      tools,
      configHash: hashString(raw),
    };
  }
}

function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // unsigned 32-bit hex
  return (h >>> 0).toString(16).padStart(8, "0");
}
