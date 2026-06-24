import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CacheStore } from "../src/cache/db.js";
import { defineTool } from "../src/registry/tool-definition.js";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "c2m-cache-"));
  dbPath = join(dir, "cache.sqlite");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function mkTool(name: string): ReturnType<typeof defineTool> {
  return defineTool({
    name,
    description: `tool ${name}`,
    connectorName: "gh",
    binary: "gh",
    command: ["pr", "view"],
    args: [],
    skillRefs: [],
    source: "yaml",
    enabled: true,
  });
}

describe("CacheStore", () => {
  it("creates the DB file and tables on construction", () => {
    const db = new CacheStore(dbPath);
    db.close();
    // reopening should not error
    const db2 = new CacheStore(dbPath);
    db2.close();
  });

  it("writes and reads back connectors", () => {
    const db = new CacheStore(dbPath);
    db.upsertConnector({
      name: "gh",
      binary: "gh",
      enabled: 1,
      version: "2.60.0",
      config_hash: "abc12345",
    });
    const row = db.getConnector("gh");
    expect(row?.binary).toBe("gh");
    expect(row?.config_hash).toBe("abc12345");
    db.close();
  });

  it("writes and reads tools by configHash", () => {
    const db = new CacheStore(dbPath);
    db.replaceTools("hashA", [mkTool("gh_pr_view"), mkTool("gh_pr_list")]);
    const tools = db.loadTools("hashA");
    expect(tools.map((t) => t.name).sort()).toEqual(["gh_pr_list", "gh_pr_view"]);
    expect(db.hasToolsForHash("hashA")).toBe(true);
    expect(db.hasToolsForHash("hashB")).toBe(false);
    db.close();
  });

  it("survives restart (persists to disk)", () => {
    const db1 = new CacheStore(dbPath);
    db1.replaceTools("hashA", [mkTool("gh_pr_view")]);
    db1.close();

    const db2 = new CacheStore(dbPath);
    const tools = db2.loadTools("hashA");
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("gh_pr_view");
    db2.close();
  });

  it("stores and reads help_cache rows", () => {
    const db = new CacheStore(dbPath);
    db.putHelpCache({
      connector_name: "az",
      fingerprint: "fp1",
      path_key: "account list",
      raw_help: "help text",
      exit_code: 0,
    });
    expect(db.getHelpCache({ connector_name: "az", fingerprint: "fp1", path_key: "account list" })?.raw_help).toBe(
      "help text",
    );
    expect(db.countHelpCache("az", "fp1")).toBe(1);
    db.close();
  });

  it("configHash change is detectable (old hash has no tools)", () => {
    const db = new CacheStore(dbPath);
    db.replaceTools("hashA", [mkTool("gh_pr_view")]);
    expect(db.hasToolsForHash("hashA")).toBe(true);
    expect(db.hasToolsForHash("hashB")).toBe(false);
    db.close();
  });

  it("refresh keeps old tools: writing new hash does not delete old hash rows", () => {
    const db = new CacheStore(dbPath);
    db.replaceTools("hashA", [mkTool("gh_pr_view")]);
    db.replaceTools("hashB", [mkTool("gh_pr_list")]);
    // both hashes still queryable
    expect(db.loadTools("hashA").map((t) => t.name)).toEqual(["gh_pr_view"]);
    expect(db.loadTools("hashB").map((t) => t.name)).toEqual(["gh_pr_list"]);
    // latest fallback returns at least one tool
    expect(db.loadLatestTools().length).toBeGreaterThanOrEqual(1);
    db.close();
  });

  it("records scan runs", () => {
    const db = new CacheStore(dbPath);
    const id = db.startScanRun("gh");
    db.finishScanRun(id, "ok", null);
    const latest = db.latestScanRun("gh");
    expect(latest?.status).toBe("ok");
    expect(latest?.error).toBeNull();
    db.close();
  });

  it("records failed scan run with error message", () => {
    const db = new CacheStore(dbPath);
    const id = db.startScanRun("gh");
    db.finishScanRun(id, "failed", "binary not found");
    const latest = db.latestScanRun("gh");
    expect(latest?.status).toBe("failed");
    expect(latest?.error).toBe("binary not found");
    db.close();
  });

  it("stores raw discovery commands per scan run", () => {
    const db = new CacheStore(dbPath);
    const id = db.startScanRun("gh");
    db.replaceCommands("gh", id, [
      { path: "gh", raw_help: "root help", parsed_json: null },
      { path: "gh pr", raw_help: "pr help", parsed_json: '{"x":1}' },
    ]);
    const cmds = db.getCommands("gh");
    expect(cmds).toHaveLength(2);
    expect(cmds[0].path).toBe("gh");
    expect(cmds[1].parsed_json).toBe('{"x":1}');
    db.finishScanRun(id, "ok", null);
    db.close();
  });
});
