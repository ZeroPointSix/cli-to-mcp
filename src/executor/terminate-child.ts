import { spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";

/**
 * Best-effort terminate a spawned child; on Windows use taskkill /T to drop cmd trees.
 */
export function terminateChildProcess(
  platform: NodeJS.Platform,
  child: ChildProcess,
  signal: "SIGTERM" | "SIGKILL" = "SIGTERM",
): void {
  const pid = child.pid;
  try {
    child.kill(signal);
  } catch {
    /* ignore */
  }
  if (platform !== "win32" || pid == null) return;
  if (signal === "SIGKILL" || signal === "SIGTERM") {
    try {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        shell: false,
        stdio: "ignore",
      });
    } catch {
      /* ignore */
    }
  }
}