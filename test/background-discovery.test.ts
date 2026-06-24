import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { startRuntime, type Runtime } from "../src/cli/runtime.js";
import { shouldBackgroundContinue } from "../src/cli/discovery-runner.js";

const MOCK_HELP = fileURLToPath(new URL("./fixtures/mock-help-tree.js", import.meta.url));
const NODE = process.execPath.replace(/\\/g, "/");

let dir: string;
let runtime: Runtime | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "c2m-bg-"));
});

afterEach(async () => {
  if (runtime) await runtime.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("background discovery", () => {
  it("shouldBackgroundContinue when budget set", () => {
    expect(
      shouldBackgroundContinue({
        name: "x",
        binary: "x",
        enabled: true,
        working_dir: null,
        skills: [],
        skill_root: null,
        discovery: { mode: "help", startup_budget_seconds: 60 },
      }),
    ).toBe(true);
    expect(
      shouldBackgroundContinue({
        name: "x",
        binary: "x",
        enabled: true,
        working_dir: null,
        skills: [],
        skill_root: null,
        discovery: { mode: "help", startup_budget_seconds: 60, background_continue_discovery: false },
      }),
    ).toBe(false);
  });

  it("starts serve then completes background scan and grows tools", async () => {
    const cfg = join(dir, "cli-to-mcp.yaml");
    writeFileSync(
      cfg,
      `version: 1
connectors:
  - name: demo
    binary: ${NODE}
    argv_prefix: ["${MOCK_HELP.replace(/\\/g, "/")}"]
    enabled: true
    discovery:
      mode: help
      max_depth: 2
      startup_budget_seconds: 1
      background_continue_discovery: true
      concurrency: 4
`,
    );
    runtime = await startRuntime({
      host: "127.0.0.1",
      port: 29001,
      config: cfg,
      cachePath: join(dir, "c.sqlite"),
      log: () => {},
    });
    expect(runtime.backgroundDiscovery).not.toBeNull();
    const sizeAtStart = runtime.registry.size();

    await runtime.backgroundDiscovery!.done;
    expect(runtime.registry.size()).toBeGreaterThanOrEqual(sizeAtStart);
    const st = runtime.backgroundDiscoveryStatus();
    expect(st?.running).toBe(false);
    expect(st?.finished_at).toBeTruthy();
  });
});