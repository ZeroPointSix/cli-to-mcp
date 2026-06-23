import { describe, it, expect } from "vitest";
import { normalize } from "../src/executor/result-normalizer.js";
import { classifyError } from "../src/executor/error-classifier.js";
import { defineTool } from "../src/registry/tool-definition.js";
import type { RawExecutionResult } from "../src/executor/command-executor.js";

const tool = defineTool({
  name: "t",
  description: "t",
  connectorName: "c",
  binary: "c",
  command: ["run"],
  args: [],
  skillRefs: [],
  source: "yaml",
  enabled: true,
});
const jsonTool = { ...tool, output: { format: "json" as const } };

function mk(over: Partial<RawExecutionResult> = {}): RawExecutionResult {
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 10,
    timedOut: false,
    binaryNotFound: false,
    ...over,
  };
}

describe("normalize - success", () => {
  it("parses JSON stdout into parsed_output when tool declares json", () => {
    const res = normalize(mk({ stdout: '{"a":1}' }), jsonTool);
    expect(res.ok).toBe(true);
    expect(res.parsed_output).toEqual({ a: 1 });
    expect(res.error_type).toBeNull();
  });

  it("parses JSON even without json declaration when output looks like JSON", () => {
    const res = normalize(mk({ stdout: '[1,2,3]' }), tool);
    expect(res.parsed_output).toEqual([1, 2, 3]);
  });

  it("returns raw stdout when not JSON", () => {
    const res = normalize(mk({ stdout: "hello world" }), tool);
    expect(res.ok).toBe(true);
    expect(res.parsed_output).toBeNull();
    expect(res.stdout).toBe("hello world");
  });

  it("returns null parsed_output when json declared but parse fails", () => {
    const res = normalize(mk({ stdout: "not json" }), jsonTool);
    expect(res.ok).toBe(true);
    expect(res.parsed_output).toBeNull();
    expect(res.stdout).toBe("not json");
  });
});

describe("normalize - failures", () => {
  it("classifies binary not found", () => {
    const res = normalize(mk({ binaryNotFound: true, exitCode: null }), tool);
    expect(res.ok).toBe(false);
    expect(res.error_type).toBe("BINARY_NOT_FOUND");
    expect(res.hint).toMatch(/PATH/);
  });

  it("classifies timeout", () => {
    const res = normalize(mk({ timedOut: true, exitCode: null }), tool);
    expect(res.ok).toBe(false);
    expect(res.error_type).toBe("COMMAND_TIMEOUT");
  });

  it("classifies auth failure from stderr", () => {
    const res = normalize(
      mk({ exitCode: 4, stderr: "please login first" }),
      tool,
    );
    expect(res.ok).toBe(false);
    expect(res.error_type).toBe("CLI_NOT_AUTHENTICATED");
    expect(res.hint).toMatch(/login/);
  });

  it("classifies generic command failure", () => {
    const res = normalize(mk({ exitCode: 1, stderr: "boom" }), tool);
    expect(res.ok).toBe(false);
    expect(res.error_type).toBe("COMMAND_FAILED");
  });
});

describe("classifyError edge cases", () => {
  it("detects gh auth login hint", () => {
    const cls = classifyError(mk({ exitCode: 4, stderr: "To get started, run gh auth login" }));
    expect(cls.errorType).toBe("CLI_NOT_AUTHENTICATED");
  });
  it("detects az login hint", () => {
    const cls = classifyError(mk({ exitCode: 1, stderr: "ERROR: Please run 'az login'" }));
    expect(cls.errorType).toBe("CLI_NOT_AUTHENTICATED");
  });
  it("treats unknown exit null as UNKNOWN_ERROR", () => {
    const cls = classifyError(mk({ exitCode: null }));
    expect(cls.errorType).toBe("UNKNOWN_ERROR");
  });
});
