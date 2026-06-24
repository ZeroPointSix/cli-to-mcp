/**
 * ConfigLoader: read cli-to-mcp.yaml from disk, parse YAML, validate against
 * the zod schema, and resolve relative paths (skills, working_dir, parser_module)
 * against the config file's directory so the runtime can use absolute paths.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { resolvePathUnderConfigDir } from "./path-safety.js";
import { parse as parseYaml } from "yaml";
import { validateConfig, } from "./schema.js";
export class ConfigLoader {
    load(configPath) {
        const abs = isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath);
        const raw = readFileSync(abs, "utf8");
        const parsed = parseYaml(raw);
        const config = validateConfig(parsed);
        const configDir = dirname(abs);
        const connectors = config.connectors.map((c) => ({
            ...c,
            skills: (c.skills ?? []).map((s) => resolvePathUnderConfigDir(configDir, s)),
            working_dir: c.working_dir ? resolvePathUnderConfigDir(configDir, c.working_dir) : null,
            skill_root: c.skill_root ? resolvePathUnderConfigDir(configDir, c.skill_root) : null,
            discovery: c.discovery
                ? {
                    ...c.discovery,
                    parser_module: c.discovery.parser_module
                        ? resolvePathUnderConfigDir(configDir, c.discovery.parser_module)
                        : undefined,
                }
                : { mode: "help" },
        }));
        const tools = {};
        for (const [name, decl] of Object.entries(config.tools ?? {})) {
            tools[name] = {
                ...decl,
                skills: (decl.skills ?? []).map((s) => resolvePathUnderConfigDir(configDir, s)),
            };
        }
        const parserModules = (config.parsers ?? []).map((p) => resolvePathUnderConfigDir(configDir, p));
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
function hashString(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    // unsigned 32-bit hex
    return (h >>> 0).toString(16).padStart(8, "0");
}
//# sourceMappingURL=config-loader.js.map