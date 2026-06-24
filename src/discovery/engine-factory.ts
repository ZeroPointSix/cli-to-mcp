import { pathToFileURL } from "node:url";
import type { LoadedConfig } from "../config/config-loader.js";
import { DiscoveryEngine } from "./discovery-engine.js";
import {
  YamlSource,
  TemplateSource,
  HelpSource,
  createDefaultParserRegistry,
} from "./sources.js";
import { loadBuiltinPacks } from "./template-registry.js";
import type { HelpParserRegistry, HelpParserPlugin } from "./parser-registry.js";
import { runHelp } from "./help-runner.js";
import type { CacheStore } from "../cache/db.js";
import type { HelpSpawnGate } from "./help-spawn-gate.js";

export type BuildDiscoveryEngineOptions = {
  parserRegistry?: HelpParserRegistry;
  log?: (msg: string) => void;
  runHelpFn?: typeof runHelp;
  cache?: CacheStore;
  helpSpawnGate?: HelpSpawnGate;
};

export async function buildDiscoveryEngine(
  config: LoadedConfig,
  opts: BuildDiscoveryEngineOptions = {},
): Promise<{ engine: DiscoveryEngine; parserRegistry: HelpParserRegistry }> {
  const parserRegistry = opts.parserRegistry ?? createDefaultParserRegistry();
  await loadParserModules(config, parserRegistry, opts.log);
  const baseRunHelp = opts.runHelpFn ?? runHelp;
  const gate = opts.helpSpawnGate;
  const runHelpFn: typeof runHelp =
    gate == null
      ? baseRunHelp
      : async (binary, path, helpOpts) => {
          await gate.acquire();
          try {
            return await baseRunHelp(binary, path, helpOpts);
          } finally {
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

export async function loadParserModules(
  config: LoadedConfig,
  registry: HelpParserRegistry,
  log: (msg: string) => void = () => {},
): Promise<void> {
  const seenModules = new Set<string>();
  for (const connector of config.connectors) {
    if (!connector.enabled) continue;
    const modulePath = connector.discovery?.parser_module;
    if (!modulePath || seenModules.has(modulePath)) continue;
    seenModules.add(modulePath);
    const mod = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown>;
    const plugins = parserPluginsFromModule(mod);
    if (plugins.length === 0) {
      throw new Error(`parser_module did not export a HelpParserPlugin: ${modulePath}`);
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

function parserPluginsFromModule(mod: Record<string, unknown>): HelpParserPlugin[] {
  const candidates: unknown[] = [];
  if (Array.isArray(mod.plugins)) candidates.push(...mod.plugins);
  candidates.push(mod.plugin, mod.parser, mod.default, mod);
  return candidates.flatMap((candidate) => {
    if (Array.isArray(candidate)) return candidate.filter(isParserPlugin);
    return isParserPlugin(candidate) ? [candidate] : [];
  });
}

function isParserPlugin(candidate: unknown): candidate is HelpParserPlugin {
  return (
    !!candidate &&
    typeof candidate === "object" &&
    typeof (candidate as HelpParserPlugin).id === "string" &&
    typeof (candidate as HelpParserPlugin).displayName === "string" &&
    typeof (candidate as HelpParserPlugin).match === "function" &&
    typeof (candidate as HelpParserPlugin).parse === "function"
  );
}