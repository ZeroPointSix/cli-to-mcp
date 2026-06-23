import type { LoadedConfig } from "../config/config-loader.js";
import { DiscoveryEngine } from "./discovery-engine.js";
import type { HelpParserRegistry } from "./parser-registry.js";
import type { runHelp } from "./help-runner.js";
export type BuildDiscoveryEngineOptions = {
    parserRegistry?: HelpParserRegistry;
    log?: (msg: string) => void;
    runHelpFn?: typeof runHelp;
};
export declare function buildDiscoveryEngine(config: LoadedConfig, opts?: BuildDiscoveryEngineOptions): Promise<{
    engine: DiscoveryEngine;
    parserRegistry: HelpParserRegistry;
}>;
export declare function loadParserModules(config: LoadedConfig, registry: HelpParserRegistry, log?: (msg: string) => void): Promise<void>;
