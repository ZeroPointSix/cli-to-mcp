import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { resolvePathUnderConfigDir } from "../src/config/path-safety.js";

describe("resolvePathUnderConfigDir", () => {
  const configDir = resolve("/project/config");

  it("resolves relative paths inside config dir", () => {
    expect(resolvePathUnderConfigDir(configDir, "skills/foo.md")).toBe(
      resolve(configDir, "skills/foo.md"),
    );
  });

  it("rejects traversal outside config dir", () => {
    expect(() => resolvePathUnderConfigDir(configDir, "../../../etc/passwd")).toThrow(
      /escapes config directory/,
    );
  });

  it("rejects absolute paths in config", () => {
    expect(() => resolvePathUnderConfigDir(configDir, "C:/outside/file.md")).toThrow(
      /absolute paths not allowed/,
    );
  });
});