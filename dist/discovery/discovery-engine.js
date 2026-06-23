import { YamlSource, TemplateSource, HelpSource, mergeArtifacts, } from "./sources.js";
import { loadBuiltinPacks } from "./template-registry.js";
export class DiscoveryEngine {
    sources;
    constructor(sources) {
        if (sources) {
            this.sources = sources;
        }
        else {
            // Default wiring: template packs + help registry auto-loaded.
            this.sources = [
                new YamlSource(),
                new TemplateSource(loadBuiltinPacks()),
                new HelpSource(),
            ];
        }
    }
    async discover(connector, config) {
        const artifacts = [];
        for (const src of this.sources) {
            const arts = await src.discover(connector, config);
            artifacts.push(...arts);
        }
        return mergeArtifacts(artifacts);
    }
}
//# sourceMappingURL=discovery-engine.js.map