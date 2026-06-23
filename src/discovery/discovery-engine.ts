/**
 * DiscoveryEngine: run all sources for a connector and merge results.
 *
 * Architecture §4.3 / ADR 0003 priority: help < template < user YAML.
 * The engine runs every source, then mergeArtifacts applies that priority.
 *
 * Default sources are wired with built-in template packs (templates/*.yaml)
 * and a help parser registry (generic + cobra). Callers can inject custom
 * sources for testing.
 */
import type { LoadedConfig, ResolvedConnector } from "../config/config-loader.js";
import type { ToolDefinition } from "../registry/tool-definition.js";
import {
  type DiscoverySource,
  YamlSource,
  TemplateSource,
  HelpSource,
  mergeArtifacts,
} from "./sources.js";
import { loadBuiltinPacks } from "./template-registry.js";

export class DiscoveryEngine {
  private sources: DiscoverySource[];

  constructor(sources?: DiscoverySource[]) {
    if (sources) {
      this.sources = sources;
    } else {
      // Default wiring: template packs + help registry auto-loaded.
      this.sources = [
        new YamlSource(),
        new TemplateSource(loadBuiltinPacks()),
        new HelpSource(),
      ];
    }
  }

  async discover(connector: ResolvedConnector, config: LoadedConfig): Promise<ToolDefinition[]> {
    const artifacts = [];
    for (const src of this.sources) {
      const arts = await src.discover(connector, config);
      artifacts.push(...arts);
    }
    return mergeArtifacts(artifacts);
  }
}
