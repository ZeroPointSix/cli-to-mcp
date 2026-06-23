import { describe, it, expect } from "vitest";
import { InMemoryToolRegistry } from "../src/registry/tool-registry.js";
import { defineTool } from "../src/registry/tool-definition.js";

function mkTool(name: string, opts: { enabled?: boolean; source?: "yaml" | "template" | "help" | "mixed" } = {}) {
  return defineTool({
    name,
    description: `tool ${name}`,
    connectorName: "gh",
    binary: "gh",
    command: ["run"],
    args: [
      { name: "n", type: "integer" as const, required: true },
      { name: "v", type: "boolean" as const, required: false },
    ],
    skillRefs: [],
    source: opts.source ?? "yaml",
    enabled: opts.enabled ?? true,
  });
}

describe("InMemoryToolRegistry", () => {
  it("registers and lists enabled tools", () => {
    const r = new InMemoryToolRegistry();
    r.register(mkTool("gh_pr_view"));
    r.register(mkTool("gh_pr_list"));
    expect(r.listTools().map((t) => t.name).sort()).toEqual(["gh_pr_list", "gh_pr_view"]);
    expect(r.size()).toBe(2);
  });

  it("getTool returns tool by name", () => {
    const r = new InMemoryToolRegistry();
    r.register(mkTool("gh_pr_view"));
    expect(r.getTool("gh_pr_view")?.name).toBe("gh_pr_view");
    expect(r.getTool("missing")).toBeNull();
  });

  it("disabled tools are hidden from listTools but still getTool-able", () => {
    const r = new InMemoryToolRegistry();
    r.register(mkTool("gh_pr_view", { enabled: false }));
    expect(r.listTools()).toHaveLength(0);
    expect(r.isExposed("gh_pr_view")).toBe(false);
    expect(r.getTool("gh_pr_view")?.name).toBe("gh_pr_view");
  });

  it("rejects duplicate tool name", () => {
    const r = new InMemoryToolRegistry();
    r.register(mkTool("gh_pr_view"));
    expect(() => r.register(mkTool("gh_pr_view"))).toThrow(/already registered/);
  });

  it("rejects reserved meta-tool names", () => {
    const r = new InMemoryToolRegistry();
    expect(() => r.register(mkTool("doctor"))).toThrow(/reserved for meta-tools/);
    expect(() => r.register(mkTool("refresh_tools"))).toThrow(/reserved/);
  });

  it("replaceAll clears and re-registers", () => {
    const r = new InMemoryToolRegistry();
    r.register(mkTool("a"));
    r.replaceAll([mkTool("b"), mkTool("c")]);
    expect(r.listTools().map((t) => t.name).sort()).toEqual(["b", "c"]);
  });
});

describe("defineTool / inputSchema", () => {
  it("builds JSON schema with required and optional args", () => {
    const t = mkTool("gh_pr_view");
    expect(t.inputSchema.type).toBe("object");
    expect(t.inputSchema.required).toEqual(["n"]);
    expect(t.inputSchema.properties.n).toMatchObject({ type: "integer" });
    expect(t.inputSchema.properties.v).toMatchObject({ type: "boolean" });
    expect(t.inputSchema.additionalProperties).toBe(false);
  });

  it("preserves source provenance", () => {
    expect(mkTool("x", { source: "yaml" }).source).toBe("yaml");
    expect(mkTool("x", { source: "template" }).sources[0].kind).toBe("template");
  });
});
