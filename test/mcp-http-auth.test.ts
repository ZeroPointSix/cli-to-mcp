import { describe, expect, it } from "vitest";
import { safeEqualSecret, extractBearerToken } from "../src/mcp/http-auth.js";
import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";

function fakeReq(headers: Record<string, string>): IncomingMessage {
  const e = new EventEmitter() as IncomingMessage;
  e.headers = headers;
  return e;
}

describe("mcp http-auth", () => {
  it("safeEqualSecret rejects length mismatch", () => {
    expect(safeEqualSecret("a", "ab")).toBe(false);
    expect(safeEqualSecret("secret", "secret")).toBe(true);
  });

  it("extractBearerToken from Authorization and X-CLI-To-MCP-Secret", () => {
    expect(extractBearerToken(fakeReq({ authorization: "Bearer tok123" }))).toBe("tok123");
    expect(extractBearerToken(fakeReq({ "x-cli-to-mcp-secret": "alt" }))).toBe("alt");
    expect(extractBearerToken(fakeReq({}))).toBeUndefined();
  });
});