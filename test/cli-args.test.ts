import { describe, it, expect } from "vitest";
import { parseCliArgs } from "../src/cli/args.js";

describe("parseCliArgs", () => {
  it("returns help when no command given", () => {
    expect(parseCliArgs([])).toEqual({ kind: "help" });
  });

  it("returns help for -h/--help/help", () => {
    expect(parseCliArgs(["-h"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["help"])).toEqual({ kind: "help" });
  });

  it("returns unknown for unrecognized command", () => {
    expect(parseCliArgs(["frobnicate"])).toEqual({ kind: "unknown", command: "frobnicate" });
  });

  it("parses serve with defaults", () => {
    expect(parseCliArgs(["serve"])).toEqual({
      kind: "serve",
      transport: "http",
      host: "127.0.0.1",
      port: 8787,
      config: "./cli-to-mcp.yaml",
    });
  });

  it("parses serve with all flags", () => {
    expect(
      parseCliArgs([
        "serve",
        "--transport",
        "http",
        "--host",
        "0.0.0.0",
        "--port",
        "9000",
        "--config",
        "/tmp/c.yaml",
      ]),
    ).toEqual({
      kind: "serve",
      transport: "http",
      host: "0.0.0.0",
      port: 9000,
      config: "/tmp/c.yaml",
    });
  });

  it("rejects non-http transport", () => {
    expect(() => parseCliArgs(["serve", "--transport", "stdio"])).toThrow(/unsupported transport/);
  });

  it("rejects invalid port", () => {
    expect(() => parseCliArgs(["serve", "--port", "0"])).toThrow(/invalid --port/);
    expect(() => parseCliArgs(["serve", "--port", "abc"])).toThrow(/invalid --port/);
  });

  it("rejects missing flag values", () => {
    expect(() => parseCliArgs(["serve", "--host"])).toThrow(/--host requires a value/);
    expect(() => parseCliArgs(["serve", "--port"])).toThrow(/--port requires a value/);
    expect(() => parseCliArgs(["serve", "--config"])).toThrow(/--config requires a value/);
  });
});
