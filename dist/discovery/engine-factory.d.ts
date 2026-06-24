import type { LoadedConfig } from "../config/config-loader.js";
import { DiscoveryEngine } from "./discovery-engine.js";
import type { HelpParserRegistry } from "./parser-registry.js";
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
export declare function buildDiscoveryEngine(config: LoadedConfig, opts?: BuildDiscoveryEngineOptions): Promise<{
    engine: DiscoveryEngine;
    parserRegistry: HelpParserRegistry;
}>;
export declare function loadParserModules(config: LoadedConfig, registry: HelpParserRegistry, log?: (msg: string) => void): Promise<void>;
