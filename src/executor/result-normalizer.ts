/**
 * ResultNormalizer: turn RawExecutionResult into an Agent-friendly structure.
 *
 * Tries to JSON-parse stdout when the tool declares JSON output (or when the
 * content looks like JSON). On failure, returns raw stdout and tags the
 * parsed_output as null — never throws on parse failure.
 */
import type { RawExecutionResult } from "./command-executor.js";
import type { ToolDefinition } from "../registry/tool-definition.js";
import { classifyError, type ErrorType } from "./error-classifier.js";

export type NormalizedResult = {
  ok: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
  parsed_output: unknown;
  error_type: ErrorType | null;
  hint: string | null;
};

export function normalize(
  res: RawExecutionResult,
  tool: ToolDefinition,
): NormalizedResult {
  const ok = res.exitCode === 0 && !res.timedOut && !res.binaryNotFound;

  if (!ok) {
    const cls = classifyError(res);
    return {
      ok: false,
      exit_code: res.exitCode,
      stdout: res.stdout,
      stderr: res.stderr,
      duration_ms: res.durationMs,
      parsed_output: null,
      error_type: cls.errorType,
      hint: cls.hint,
    };
  }

  const wantJson = tool.output?.format === "json";
  const parsed = tryParseJson(res.stdout, wantJson);

  return {
    ok: true,
    exit_code: res.exitCode,
    stdout: res.stdout,
    stderr: res.stderr,
    duration_ms: res.durationMs,
    parsed_output: parsed,
    error_type: null,
    hint: null,
  };
}

function tryParseJson(stdout: string, wantJson: boolean): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  // If tool says JSON, try hard. Otherwise only parse when it clearly is JSON.
  if (wantJson || looksLikeJson(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

function looksLikeJson(s: string): boolean {
  const first = s[0];
  return first === "{" || first === "[" || first === '"';
}
