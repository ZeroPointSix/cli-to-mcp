/**
 * Error classification for CLI execution results.
 *
 * Goal (PRD §10.6): not perfect accuracy, but enough signal for an Agent to
 * decide next step — retry, change args, ask user to login, or stop.
 */
import type { RawExecutionResult } from "./command-executor.js";
export type ErrorType = "BINARY_NOT_FOUND" | "COMMAND_TIMEOUT" | "COMMAND_FAILED" | "CLI_NOT_AUTHENTICATED" | "UNKNOWN_ERROR";
export type ClassifiedError = {
    errorType: ErrorType;
    hint: string;
};
export declare function classifyError(res: RawExecutionResult): ClassifiedError;
