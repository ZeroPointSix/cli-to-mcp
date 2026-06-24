import { describe, expect, it } from "vitest";
import {
  prepareSpawnCommand,
  quoteWindowsCommand,
  resolveWindowsComSpec,
} from "../src/executor/spawn-command.js";

describe("quoteWindowsCommand", () => {
  it("quotes empty args and escapes metacharacters", () => {
    expect(quoteWindowsCommand(["a", ""])).toBe('"a" ""');
    expect(quoteWindowsCommand(['say "hi"'])).toContain("^");
  });
});

describe("resolveWindowsComSpec", () => {
  it("allows bare cmd.exe", () => {
    expect(resolveWindowsComSpec({ ComSpec: "cmd.exe" })).toBe("cmd.exe");
  });

  it("rejects non-cmd ComSpec", () => {
    expect(() => resolveWindowsComSpec({ ComSpec: "C:\\evil\\powershell.exe" })).toThrow(/cmd\.exe/);
  });

  it("allows System32 cmd.exe path", () => {
    const p = "C:\\Windows\\System32\\cmd.exe";
    expect(resolveWindowsComSpec({ ComSpec: p })).toBe(p);
  });

  it("rejects ComSpec with ..", () => {
    expect(() =>
      resolveWindowsComSpec({ ComSpec: "C:\\Windows\\System32\\..\\evil\\cmd.exe" }),
    ).toThrow(/unsafe/);
  });
});

describe("prepareSpawnCommand", () => {
  it("rejects empty argv", () => {
    expect(() => prepareSpawnCommand([])).toThrow(/empty argv/);
  });

  it("passes through unix argv", () => {
    expect(prepareSpawnCommand(["/usr/bin/git", "status"], "linux")).toEqual({
      command: "/usr/bin/git",
      args: ["status"],
    });
  });

  it("uses connector ComSpec for bare win32 names", () => {
    const env = { ComSpec: "C:\\Windows\\System32\\cmd.exe", PATH: "" };
    const cmd = prepareSpawnCommand(["mytool", "--help"], "win32", env);
    expect(cmd.command).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(cmd.args[0]).toBe("/d");
    expect(cmd.args[1]).toBe("/s");
    expect(cmd.args[2]).toBe("/c");
    expect(cmd.args[3]).toContain("mytool");
  });

  it("uses /d /c for full-path .cmd without /s one-string quoting", () => {
    const env = { ComSpec: "cmd.exe", PATH: "" };
    const bin = "C:\\Azure\\az.cmd";
    const cmd = prepareSpawnCommand([bin, "group", "list"], "win32", env);
    expect(cmd.command).toBe("cmd.exe");
    expect(cmd.args).toEqual(["/d", "/c", bin, "group", "list"]);
  });

  it("spawns .exe directly on win32 when path is absolute", () => {
    const env = { PATH: "" };
    const bin = "C:\\Tools\\foo.exe";
    const cmd = prepareSpawnCommand([bin, "-v"], "win32", env);
    expect(cmd).toEqual({ command: bin, args: ["-v"] });
  });
});