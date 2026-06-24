/**
 * Global Arguments / help flags filtering (issue #15 P1-3, #13).
 */
import type { DiscoveredArg } from "./types.js";
import type { DiscoveryConfig } from "../config/schema.js";

const DEFAULT_DENY = new Set(["help", "h", "debug", "verbose", "version", "v"]);

const DEFAULT_ALLOW_GLOBAL = new Set([
  "output",
  "subscription",
  "query",
  "location",
  "resource-group",
  "resource_group",
]);

export type GlobalArgFilterOptions = {
  materialize_global_args?: boolean;
  global_arg_allowlist?: string[];
  global_arg_denylist?: string[];
};

export function globalArgFilterOpts(discovery?: DiscoveryConfig): GlobalArgFilterOptions {
  return {
    materialize_global_args: discovery?.materialize_global_args ?? false,
    global_arg_allowlist: discovery?.global_arg_allowlist,
    global_arg_denylist: discovery?.global_arg_denylist,
  };
}

export function shouldMaterializeArg(
  arg: DiscoveredArg,
  opts: GlobalArgFilterOptions,
  sectionWasGlobal: boolean,
): boolean {
  if (isHelpArg(arg)) return false;
  const name = arg.name.toLowerCase();
  const deny = new Set([...DEFAULT_DENY, ...(opts.global_arg_denylist ?? []).map((s) => s.toLowerCase())]);
  if (deny.has(name)) return false;
  if (opts.materialize_global_args) return true;
  if (!sectionWasGlobal) return true;
  const allow = new Set([
    ...DEFAULT_ALLOW_GLOBAL,
    ...(opts.global_arg_allowlist ?? []).map((s) => s.toLowerCase()),
  ]);
  return allow.has(name);
}

export function isHelpArg(a: DiscoveredArg): boolean {
  return a.name === "help" || a.name === "h" || a.aliases?.includes("-h") === true;
}

export function helpArgv(discovery?: DiscoveryConfig): string[] {
  const raw = discovery?.help_argv;
  if (raw && raw.length > 0) return [...raw];
  return ["--help"];
}