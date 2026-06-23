import { classifyError } from "./error-classifier.js";
export function normalize(res, tool) {
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
function tryParseJson(stdout, wantJson) {
    const trimmed = stdout.trim();
    if (!trimmed)
        return null;
    // If tool says JSON, try hard. Otherwise only parse when it clearly is JSON.
    if (wantJson || looksLikeJson(trimmed)) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return null;
        }
    }
    return null;
}
function looksLikeJson(s) {
    const first = s[0];
    return first === "{" || first === "[" || first === '"';
}
//# sourceMappingURL=result-normalizer.js.map