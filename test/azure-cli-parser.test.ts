import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { azureCliPlugin } from "../src/discovery/plugins/azure-cli.js";
import { createDefaultParserRegistry } from "../src/discovery/sources.js";
import type { HelpParserContext } from "../src/discovery/parser-registry.js";

const AZ =
  process.platform === "win32"
    ? "C:/Program Files/Microsoft SDKs/Azure/CLI2/wbin/az.cmd"
    : "az";

function ctx(raw: string, path: string[] = []): HelpParserContext {
  return {
    connectorName: "az",
    binary: "az",
    path,
    rawHelp: raw,
    exitCode: 0,
  };
}

describe("azureCliPlugin", () => {
  it("matches az root help", () => {
    let raw: string;
    try {
      raw = execSync(`"${AZ}" --help`, { encoding: "utf8", maxBuffer: 4e6 });
    } catch {
      return; // skip when az not installed
    }
    expect(azureCliPlugin.match(ctx(raw))).toBeGreaterThanOrEqual(85);
    const cmd = azureCliPlugin.parse(ctx(raw));
    expect(cmd.subcommands.length).toBeGreaterThan(50);
    expect(cmd.subcommands).toContain("account");
    expect(cmd.subcommands).toContain("group");
  });

  it("parses az account help: subgroups + leaf commands", () => {
    let raw: string;
    try {
      raw = execSync(`"${AZ}" account --help`, { encoding: "utf8" });
    } catch {
      return;
    }
    const cmd = azureCliPlugin.parse(ctx(raw, ["account"]));
    expect(cmd.subcommands).toEqual(
      expect.arrayContaining(["show", "list", "lock", "management-group"]),
    );
  });

  it("is registered in default parser registry", () => {
    const reg = createDefaultParserRegistry();
    expect(reg.list().map((p) => p.id)).toContain("azure-cli");
  });
});