/**
 * Error classification for CLI execution results.
 *
 * Goal (PRD §10.6): not perfect accuracy, but enough signal for an Agent to
 * decide next step — retry, change args, ask user to login, or stop.
 */
import type { RawExecutionResult } from "./command-executor.js";

export type ErrorType =
  | "BINARY_NOT_FOUND"
  | "COMMAND_TIMEOUT"
  | "COMMAND_FAILED"
  | "CLI_NOT_AUTHENTICATED"
  | "UNKNOWN_ERROR";

export type ClassifiedError = {
  errorType: ErrorType;
  hint: string;
};

/** Patterns that suggest the CLI is not logged in. Kept intentionally narrow. */
const AUTH_PATTERNS = [
  /not logged in/i,
  /please login/i,
  /login first/i,
  /not authenticated/i,
  /authentication required/i,
  /authenticat/i,
  /credential/i,
  /token.*expired/i,
  /unauthorized/i,
  /gh auth login/i,
  /az login/i,
  /gcloud auth/i,
];

export function classifyError(res: RawExecutionResult): ClassifiedError {
  if (res.binaryNotFound) {
    return {
      errorType: "BINARY_NOT_FOUND",
      hint: "CLI binary is not installed or not on PATH. Install it or fix PATH.",
    };
  }
  if (res.timedOut) {
    return {
      errorType: "COMMAND_TIMEOUT",
      hint: "Command exceeded the timeout. Increase timeout or narrow the request.",
    };
  }
  const combined = `${res.stdout}\n${res.stderr}`;
  if (AUTH_PATTERNS.some((re) => re.test(combined))) {
    return {
      errorType: "CLI_NOT_AUTHENTICATED",
      hint: "CLI may not be authenticated. Run the CLI's login command locally and retry.",
    };
  }
  if (res.exitCode !== null && res.exitCode !== 0) {
    return {
      errorType: "COMMAND_FAILED",
      hint: `CLI exited with code ${res.exitCode}. Inspect stderr for details.`,
    };
  }
  return {
    errorType: "UNKNOWN_ERROR",
    hint: "Unexpected failure with no clear cause. Inspect stdout/stderr.",
  };
}
