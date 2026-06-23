import { META_TOOL_NAMES } from "./tool-definition.js";
export class InMemoryToolRegistry {
    tools = new Map();
    async load() {
        // Phase 1: no cache wired yet; tools are pushed in by registry builder.
        // Cache Store integration replaces this body in Task 6.
    }
    listTools() {
        return [...this.tools.values()].filter((t) => t.enabled);
    }
    getTool(name) {
        return this.tools.get(name) ?? null;
    }
    isExposed(name) {
        const t = this.tools.get(name);
        return !!t && t.enabled;
    }
    register(tool) {
        if (META_TOOL_NAMES.has(tool.name)) {
            throw new Error(`tool name "${tool.name}" is reserved for meta-tools; rename it in config`);
        }
        if (this.tools.has(tool.name)) {
            throw new Error(`tool name "${tool.name}" is already registered; set an explicit name in config to avoid conflict`);
        }
        this.tools.set(tool.name, tool);
    }
    replaceAll(tools) {
        this.tools.clear();
        for (const t of tools) {
            // replaceAll allows re-registration during refresh; skip the
            // duplicate-name check only because we just cleared.
            if (META_TOOL_NAMES.has(t.name)) {
                throw new Error(`tool name "${t.name}" is reserved for meta-tools`);
            }
            this.tools.set(t.name, t);
        }
    }
    size() {
        return this.tools.size;
    }
}
