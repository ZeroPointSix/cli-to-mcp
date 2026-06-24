/**
 * Decode subprocess stdout/stderr bytes for display and parsing.
 *
 * On Windows, child CLIs often emit the active console code page (e.g. CP936)
 * while Node defaults to UTF-8 in toString(). Prefer UTF-8 when valid; try
 * CP936 (GBK) when UTF-8 shows replacement chars; allow override via
 * CLI_TO_MCP_OUTPUT_ENCODING=latin1|cp936|utf8.
 *
 * Recommended: `chcp 65001` and UTF-8 terminal before starting cli-to-mcp (see README).
 */
import iconv from "iconv-lite";

export function decodeChildOutput(chunk: Buffer | Uint8Array | string): string {
  if (typeof chunk === "string") return chunk;
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const forced = process.env.CLI_TO_MCP_OUTPUT_ENCODING?.trim().toLowerCase();
  if (forced === "latin1" || forced === "binary") {
    return buf.toString("latin1");
  }
  if (forced === "cp936" || forced === "gbk") {
    return iconv.decode(buf, "gbk");
  }
  if (forced === "utf8" || forced === "utf-8") {
    return buf.toString("utf8");
  }
  const utf8 = buf.toString("utf8");
  if (process.platform !== "win32") return utf8;
  // Replacement chars often mean mis-decoded non-UTF-8 console output.
  if (utf8.includes("�") && buf.some((b) => b > 127)) {
    try {
      return iconv.decode(buf, "gbk");
    } catch {
      return buf.toString("latin1");
    }
  }
  return utf8;
}