/** Coerce mistaken nested JSON in call_tool.name from some MCP hosts. */
export function normalizeRegistryToolName(raw: unknown): string | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    if (t.startsWith("{")) {
      try {
        const o = JSON.parse(t) as { name?: unknown };
        if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
      } catch {
        /* use as literal name */
      }
    }
    return t;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const n = (raw as { name?: unknown }).name;
    if (typeof n === "string" && n.trim()) return n.trim();
  }
  return null;
}