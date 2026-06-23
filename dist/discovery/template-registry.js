/**
 * Template registry: loads built-in connector template packs and resolves one
 * for a given connector (ADR 0003 §"Connector Template / Connector Pack").
 *
 * Resolution order (per Task 02 §4):
 *   1. connector.discovery.template (explicit id)
 *   2. connector.name matches a pack's connectorNames (auto-match)
 *   3. null — no template
 *
 * Pack files live in `templates/*.yaml` and share the `tools:` shape with
 * cli-to-mcp.yaml so the same builder (toolFromYamlDecl) can consume them.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateConfig } from "../config/schema.js";
export class TemplateRegistry {
    packs = new Map();
    constructor(packs = []) {
        for (const p of packs)
            this.register(p);
    }
    register(pack) {
        this.packs.set(pack.id, pack);
    }
    list() {
        return [...this.packs.values()];
    }
    resolve(connector) {
        const explicit = connector.discovery?.template;
        if (explicit) {
            const p = this.packs.get(explicit);
            if (p)
                return p;
        }
        for (const p of this.packs.values()) {
            if (p.connectorNames.includes(connector.name))
                return p;
        }
        return null;
    }
}
/**
 * Load every `templates/*.yaml` pack at startup. Missing dir is not an error —
 * returns an empty registry so the runtime still works without built-in packs.
 *
 * Searches a few candidate locations so the same code works whether the entry
 * is run from `dist/` (compiled), `src/` (vitest), or the package root (npx):
 *   1. <cwd>/templates
 *   2. <this file's dir>/../templates
 *   3. <this file's dir>/../../templates
 */
export function loadBuiltinPacks(dir) {
    const reg = new TemplateRegistry();
    const candidates = dir
        ? [dir]
        : [
            join(process.cwd(), "templates"),
            join(dirname(fileURLToPath(import.meta.url)), "..", "templates"),
            join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates"),
        ];
    const packDir = candidates.find((d) => existsSync(d));
    if (!packDir)
        return reg;
    for (const file of readdirSync(packDir)) {
        if (!file.endsWith(".yaml") && !file.endsWith(".yml"))
            continue;
        const path = join(packDir, file);
        const raw = readFileSync(path, "utf8");
        const parsed = parseYaml(raw);
        // Validate each tool decl via the shared schema so pack authors get the
        // same field-level checks as user YAML.
        const tools = {};
        for (const [name, decl] of Object.entries(parsed.tools ?? {})) {
            const validated = validateConfig({
                version: 1,
                connectors: [{ name: parsed.id, binary: parsed.id }],
                tools: { [name]: decl },
            }).tools[name];
            tools[name] = { ...validated, skills: [] };
        }
        reg.register({
            id: parsed.id,
            connectorNames: parsed.connectorNames ?? [],
            tools,
        });
    }
    return reg;
}
