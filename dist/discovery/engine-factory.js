import { pathToFileURL } from "node:url";
import { DiscoveryEngine } from "./discovery-engine.js";
import { YamlSource, TemplateSource, HelpSource, createDefaultParserRegistry, } from "./sources.js";
import { loadBuiltinPacks } from "./template-registry.js";
import { runHelp } from "./help-runner.js";
export async function buildDiscoveryEngine(config, opts = {}) {
    const parserRegistry = opts.parserRegistry ?? createDefaultParserRegistry();
    await loadParserModules(config, parserRegistry, opts.log);
    const baseRunHelp = opts.runHelpFn ?? runHelp;
    const gate = opts.helpSpawnGate;
    const runHelpFn = gate == null
        ? baseRunHelp
        : async (binary, path, helpOpts) => {
            await gate.acquire();
            try {
                return await baseRunHelp(binary, path, helpOpts);
            }
            finally {
                gate.release();
            }
        };
    return {
        engine: new DiscoveryEngine([
            new YamlSource(),
            new TemplateSource(loadBuiltinPacks()),
            new HelpSource({
                parserRegistry,
                log: opts.log,
                runHelpFn,
                cache: opts.cache,
            }),
        ]),
        parserRegistry,
    };
}
export async function loadParserModules(config, registry, log = () => { }) {
    const seenModules = new Set();
    const queue = [
        ...(config.parserModules ?? []),
        ...config.connectors
            .filter((c) => c.enabled && c.discovery?.parser_module)
            .map((c) => c.discovery.parser_module),
    ];
    for (const modulePath of queue) {
        if (!modulePath || seenModules.has(modulePath))
            continue;
        seenModules.add(modulePath);
        const mod = (await import(pathToFileURL(modulePath).href));
        const plugins = parserPluginsFromModule(mod);
        if (plugins.length === 0) {
            throw new Error(`parser module did not export a HelpParserPlugin: ${modulePath}`);
        }
        for (const plugin of plugins) {
            if (registry.list().some((p) => p.id === plugin.id)) {
                log(`parser module skipped duplicate parser=${plugin.id} module=${modulePath}`);
                continue;
            }
            registry.register(plugin);
            log(`loaded parser module ${modulePath} parser=${plugin.id}`);
        }
    }
}
function parserPluginsFromModule(mod) {
    const candidates = [];
    if (Array.isArray(mod.plugins))
        candidates.push(...mod.plugins);
    candidates.push(mod.plugin, mod.parser, mod.default, mod);
    return candidates.flatMap((candidate) => {
        if (Array.isArray(candidate))
            return candidate.filter(isParserPlugin);
        return isParserPlugin(candidate) ? [candidate] : [];
    });
}
function isParserPlugin(candidate) {
    return (!!candidate &&
        typeof candidate === "object" &&
        typeof candidate.id === "string" &&
        typeof candidate.displayName === "string" &&
        typeof candidate.match === "function" &&
        typeof candidate.parse === "function");
}
//# sourceMappingURL=engine-factory.js.map