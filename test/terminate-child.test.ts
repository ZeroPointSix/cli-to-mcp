import { describe, expect, it, vi } from "vitest";
import * as child from "node:child_process";
import { EventEmitter } from "node:events";
import { terminateChildProcess } from "../src/executor/terminate-child.js";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawnSync: vi.fn(() => ({ status: 0 })) };
});

function fakeChild(pid?: number) {
  const c = new EventEmitter() as import("node:child_process").ChildProcess;
  c.kill = vi.fn();
  if (pid != null) c.pid = pid;
  return c;
}

describe("terminateChildProcess", () => {
  it("calls kill on all platforms", () => {
    const c = fakeChild(99);
    terminateChildProcess("linux", c, "SIGTERM");
    expect(c.kill).toHaveBeenCalledWith("SIGTERM");
    expect(child.spawnSync).not.toHaveBeenCalled();
  });

  it("runs taskkill on win32 when pid is set", () => {
    vi.mocked(child.spawnSync).mockClear();
    const c = fakeChild(4242);
    terminateChildProcess("win32", c, "SIGKILL");
    expect(child.spawnSync).toHaveBeenCalledWith(
      "taskkill",
      ["/PID", "4242", "/T", "/F"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("skips taskkill when pid is null", () => {
    vi.mocked(child.spawnSync).mockClear();
    const c = fakeChild(undefined);
    terminateChildProcess("win32", c, "SIGTERM");
    expect(child.spawnSync).not.toHaveBeenCalled();
  });
});