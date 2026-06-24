const DEFAULT_MAX = 4 * 1024 * 1024;

export function maxChildOutputBytes(): number {
  const raw = process.env.CLI_TO_MCP_MAX_CHILD_OUTPUT_BYTES?.trim();
  if (!raw) return DEFAULT_MAX;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX;
}

function utf8ByteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** Append chunk; limit is UTF-8 byte count (not JS string length). */
export function appendChildOutput(
  current: string,
  chunk: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  if (utf8ByteLength(current) >= maxBytes) return { text: current, truncated: true };
  const next = current + chunk;
  if (utf8ByteLength(next) <= maxBytes) return { text: next, truncated: false };
  let acc = current;
  for (const ch of chunk) {
    const trial = acc + ch;
    if (utf8ByteLength(trial) > maxBytes) break;
    acc = trial;
  }
  return { text: acc, truncated: true };
}