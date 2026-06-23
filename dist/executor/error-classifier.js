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
export function classifyError(res) {
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
