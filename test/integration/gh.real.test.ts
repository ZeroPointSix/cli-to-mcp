/**
 * Real `gh` CLI integration (ADR 0005 §5).
 *
 * Runs only when `gh` is on PATH. Does not use mock scripts.
 * Discovery via --help does not require gh auth.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { HelpSource } from "../../src/discovery/sources.js";
import { DiscoveryEngine } from "../../src/discovery/discovery-engine.js";
import type { LoadedConfig, ResolvedConnector } from "../../src/config/config-loader.js";

function ghOnPath(): boolean {
  try {
    execSync("gh --version", { stdio: "ignore", timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

const skip = !ghOnPath();

function mkConnector(discovery: ResolvedConnector["discovery"]): ResolvedConnector {
  return {
    name: "gh",
    binary: "gh",
    enabled: true,
    skills: [],
    skill_root: null,
    working_dir: null,
    discovery,
  };
}

function mkConfigNoYamlTools(): LoadedConfig {
  return {
    config: { version: 1, connectors: [], tools: {} },
    configDir: ".",
    connectors: [],
    tools: {},
    configHash: "integration",
  } as LoadedConfig;
}

describe.skipIf(skip)("gh real CLI (integration)", () => {
  it("HelpSource discovers at least one leaf tool from real gh --help", async () => {
    const src = new HelpSource({ log: () => {} });
    const arts = await src.discover(
      mkConnector({ mode: "help", parser: "cobra", max_depth: 5 }),
      mkConfigNoYamlTools(),
    );
    expect(arts.length).toBeGreaterThan(0);
    for (const a of arts) {
      expect(a.kind).toBe("help");
      expect(a.tool.binary).toBe("gh");
      expect(a.tool.command.length).toBeGreaterThan(0);
      expect(a.tool.name.startsWith("gh_")).toBe(true);
    }
    const names = new Set(arts.map((a) => a.key));
    expect(names.size).toBe(arts.length);
  }, 120_000);

  it("DiscoveryEngine with help-only connector yields help-sourced tools", async () => {
    const engine = new DiscoveryEngine([new HelpSource({ log: () => {} })]);
    const tools = await engine.discover(
      mkConnector({ mode: "help", parser: "cobra" }),
      mkConfigNoYamlTools(),
    );
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((t) => t.source === "help")).toBe(true);
  }, 120_000);
});