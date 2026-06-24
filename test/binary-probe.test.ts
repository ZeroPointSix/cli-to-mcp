import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { probeArgv } from "../src/executor/binary-probe.js";

const MOCK_CLI = fileURLToPath(new URL("./fixtures/mock-cli.js", import.meta.url));
const NODE = process.execPath;

describe("binary-probe", () => {
  it("probeArgv succeeds for mock cli (same path as executor)", async () => {
    const r = await probeArgv([NODE, MOCK_CLI], { timeoutMs: 5000 });
    expect(r.ok).toBe(true);
    expect(r.exit_code).toBe(0);
  });

  it("probeArgv fails for missing binary", async () => {
    const missing =
      process.platform === "win32"
        ? "C:\\no\\such\\probe-missing-xyz.exe"
        : "definitely-not-a-binary-xyz-12345";
    const r = await probeArgv([missing], { timeoutMs: 2000 });
    expect(r.ok).toBe(false);
    if (process.platform === "win32") {
      expect(r.exit_code).toBe(null);
    }
  });
});