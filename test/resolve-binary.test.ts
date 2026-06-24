import { describe, expect, it } from "vitest";
import { resolveSpawnBinary } from "../src/executor/resolve-binary.js";

describe("resolveSpawnBinary cache", () => {
  it("returns same reference path on repeated calls (win32)", () => {
    if (process.platform !== "win32") return;
    const a = resolveSpawnBinary("az");
    const b = resolveSpawnBinary("az");
    expect(b).toBe(a);
    expect(a.toLowerCase()).toMatch(/az\.(cmd|bat)$/);
  });
});