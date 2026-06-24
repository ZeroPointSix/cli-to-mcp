import { describe, expect, it } from "vitest";
import { decodeChildOutput } from "../src/executor/child-output.js";

describe("decodeChildOutput", () => {
  it("decodes UTF-8 text", () => {
    const buf = Buffer.from("hello 世界", "utf8");
    expect(decodeChildOutput(buf)).toBe("hello 世界");
  });

  it("passes through strings", () => {
    expect(decodeChildOutput("plain")).toBe("plain");
  });

  it("decodes GBK bytes on win32 when UTF-8 is invalid", () => {
    if (process.platform !== "win32") return;
    const prev = process.env.CLI_TO_MCP_OUTPUT_ENCODING;
    delete process.env.CLI_TO_MCP_OUTPUT_ENCODING;
    // "测" in GBK
    const buf = Buffer.from([0xb2, 0xe2]);
    const out = decodeChildOutput(buf);
    expect(out).toBe("测");
    if (prev !== undefined) process.env.CLI_TO_MCP_OUTPUT_ENCODING = prev;
  });

  it("honors CLI_TO_MCP_OUTPUT_ENCODING=cp936", () => {
    const prev = process.env.CLI_TO_MCP_OUTPUT_ENCODING;
    process.env.CLI_TO_MCP_OUTPUT_ENCODING = "cp936";
    const buf = Buffer.from([0xb2, 0xe2]);
    expect(decodeChildOutput(buf)).toBe("测");
    if (prev !== undefined) process.env.CLI_TO_MCP_OUTPUT_ENCODING = prev;
    else delete process.env.CLI_TO_MCP_OUTPUT_ENCODING;
  });
});