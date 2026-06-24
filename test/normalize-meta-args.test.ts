import { describe, it, expect } from "vitest";
import { normalizeRegistryToolName } from "../src/cli/normalize-meta-args.js";

describe("normalizeRegistryToolName", () => {
  it("accepts plain string", () => {
    expect(normalizeRegistryToolName("git_status")).toBe("git_status");
  });
  it("parses JSON string with name field", () => {
    expect(normalizeRegistryToolName('{"name":"git_status"}')).toBe("git_status");
  });
  it("accepts object with name", () => {
    expect(normalizeRegistryToolName({ name: "gh_pr_list" })).toBe("gh_pr_list");
  });
  it("rejects invalid", () => {
    expect(normalizeRegistryToolName({})).toBeNull();
    expect(normalizeRegistryToolName("")).toBeNull();
  });
});