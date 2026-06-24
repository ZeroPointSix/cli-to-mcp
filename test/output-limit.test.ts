import { describe, expect, it } from "vitest";
import { appendChildOutput, maxChildOutputBytes } from "../src/executor/output-limit.js";

describe("output-limit", () => {
  it("maxChildOutputBytes defaults to 4MB", () => {
    const prev = process.env.CLI_TO_MCP_MAX_CHILD_OUTPUT_BYTES;
    delete process.env.CLI_TO_MCP_MAX_CHILD_OUTPUT_BYTES;
    expect(maxChildOutputBytes()).toBe(4 * 1024 * 1024);
    if (prev) process.env.CLI_TO_MCP_MAX_CHILD_OUTPUT_BYTES = prev;
  });

  it("truncates by UTF-8 bytes not code units", () => {
    const max = 10;
    const r = appendChildOutput("", "hello 世界", max);
    expect(Buffer.byteLength(r.text, "utf8")).toBeLessThanOrEqual(max);
    expect(r.truncated).toBe(true);
  });

  it("does not grow after truncated", () => {
    const max = 5;
    let t = "";
    let tr = false;
    for (const ch of "abcdef") {
      const r = appendChildOutput(t, ch, max);
      t = r.text;
      tr = tr || r.truncated;
    }
    expect(Buffer.byteLength(t, "utf8")).toBeLessThanOrEqual(max);
    expect(tr).toBe(true);
  });
});