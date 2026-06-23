/**
 * ResultNormalizer: turn RawExecutionResult into an Agent-friendly structure.
 *
 * Tries to JSON-parse stdout when the tool declares JSON output (or when the
 * content looks like JSON). On failure, returns raw stdout and tags the
 * parsed_output as null — never throws on parse failure.
 */
import type { RawExecutionResult } from "./command-executor.js";
import type { ToolDefinition } from "../registry/tool-definition.js";
import { type ErrorType } from "./error-classifier.js";
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
export declare function normalize(res: RawExecutionResult, tool: ToolDefinition): NormalizedResult;
