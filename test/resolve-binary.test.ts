import { afterEach, describe, expect, it, vi } from "vitest";
import * as child from "node:child_process";
import {
  clearWinBinaryCache,
  resolveSpawnBinary,
} from "../src/executor/resolve-binary.js";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: vi.fn(actual.spawnSync),
  };
});

describe("resolveSpawnBinary", () => {
  afterEach(() => {
    clearWinBinaryCache();
    vi.mocked(child.spawnSync).mockReset();
  });

  it("returns input unchanged on non-win32", () => {
    expect(resolveSpawnBinary("git", "linux")).toBe("git");
  });

  it("returns full paths unchanged on win32", () => {
    expect(resolveSpawnBinary("C:\\x\\y.exe", "win32")).toBe("C:\\x\\y.exe");
  });

  it("does not cache where failures", () => {
    vi.mocked(child.spawnSync).mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "not found",
      pid: 1,
      output: [null, "", ""],
      signal: null,
      error: undefined,
    } as ReturnType<typeof child.spawnSync>);

    resolveSpawnBinary("missingtool", "win32", { PATH: "x" });
    resolveSpawnBinary("missingtool", "win32", { PATH: "x" });
    expect(child.spawnSync).toHaveBeenCalledTimes(2);
  });

  it("rejects unsafe bare names without calling where", () => {
    const spy = vi.mocked(child.spawnSync);
    expect(resolveSpawnBinary("az;calc", "win32")).toBe("az;calc");
    expect(spy).not.toHaveBeenCalled();
  });

  it("prefers .cmd over bash shim from where.exe", () => {
    vi.mocked(child.spawnSync).mockReturnValue({
      status: 0,
      stdout: "C:\\Git\\usr\\bin\\az\r\nC:\\Program Files\\Azure\\az.cmd\r\n",
      stderr: "",
      pid: 1,
      output: [null, "", ""],
      signal: null,
      error: undefined,
    } as ReturnType<typeof child.spawnSync>);

    const env = { PATH: "C:\\fake" };
    const resolved = resolveSpawnBinary("az", "win32", env);
    expect(resolved.toLowerCase()).toMatch(/az\.cmd$/);
    expect(child.spawnSync).toHaveBeenCalledWith(
      "where.exe",
      ["az"],
      expect.objectContaining({ shell: false, env }),
    );
  });

  it("caches per binary+PATH", () => {
    vi.mocked(child.spawnSync).mockReturnValue({
      status: 0,
      stdout: "C:\\bin\\gh.cmd\r\n",
      stderr: "",
      pid: 1,
      output: [null, "", ""],
      signal: null,
      error: undefined,
    } as ReturnType<typeof child.spawnSync>);

    const env = { PATH: "C:\\bin" };
    const a = resolveSpawnBinary("gh", "win32", env);
    const b = resolveSpawnBinary("gh", "win32", env);
    expect(b).toBe(a);
    expect(child.spawnSync).toHaveBeenCalledTimes(1);
  });

  it("uses distinct cache entries for different PATH", () => {
    vi.mocked(child.spawnSync)
      .mockReturnValueOnce({
        status: 0,
        stdout: "C:\\a\\tool.cmd\r\n",
        stderr: "",
        pid: 1,
        output: [null, "", ""],
        signal: null,
        error: undefined,
      } as ReturnType<typeof child.spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: "C:\\b\\tool.cmd\r\n",
        stderr: "",
        pid: 1,
        output: [null, "", ""],
        signal: null,
        error: undefined,
      } as ReturnType<typeof child.spawnSync>);

    const r1 = resolveSpawnBinary("tool", "win32", { PATH: "a" });
    const r2 = resolveSpawnBinary("tool", "win32", { PATH: "b" });
    expect(r1).not.toBe(r2);
    expect(child.spawnSync).toHaveBeenCalledTimes(2);
  });
});