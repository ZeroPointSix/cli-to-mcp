import { describe, expect, it } from "vitest";
import { parseCobraSubcommandLine } from "../src/discovery/plugins/cobra-parse.js";

describe("parseCobraSubcommandLine", () => {
  it("parses colon table rows", () => {
    expect(parseCobraSubcommandLine("auth:        Authenticate")).toBe("auth");
  });

  it("parses spaced columns", () => {
    expect(parseCobraSubcommandLine("acr  Azure Container Registry")).toBe("acr");
  });

  it("parses single token", () => {
    expect(parseCobraSubcommandLine("login")).toBe("login");
  });
});