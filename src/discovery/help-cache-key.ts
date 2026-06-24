/**
 * Stable keys for caching raw help text per connector command path.
 * Uses a discovery fingerprint (not full config file hash) so unrelated
 * connector edits do not invalidate az help rows.
 */
import { createHash } from "node:crypto";
import type { ResolvedConnector } from "../config/config-loader.js";

function hashString(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
}

/** Fingerprint of fields that affect help invocation and parsing. */
export function discoveryFingerprint(connector: ResolvedConnector): string {
  const d = connector.discovery ?? { mode: "help" as const };
  return hashString(
    JSON.stringify({
      binary: connector.binary,
      argv_prefix: connector.argv_prefix ?? [],
      working_dir: connector.working_dir,
      help_argv: d.help_argv ?? ["--help"],
      parser: d.parser,
      parser_module: d.parser_module,
      materialize_global_args: d.materialize_global_args,
      global_arg_allowlist: d.global_arg_allowlist,
      global_arg_denylist: d.global_arg_denylist,
    }),
  );
}

export function helpPathKey(path: string[]): string {
  return path.length === 0 ? "" : path.join(" ");
}

export function helpCacheLookupKey(
  connectorName: string,
  fingerprint: string,
  path: string[],
): { connector_name: string; fingerprint: string; path_key: string } {
  return {
    connector_name: connectorName,
    fingerprint,
    path_key: helpPathKey(path),
  };
}