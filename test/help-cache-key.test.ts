import { describe, expect, it } from "vitest";
import { discoveryFingerprint } from "../src/discovery/help-cache-key.js";
import type { ResolvedConnector } from "../src/config/config-loader.js";

function baseConn(): ResolvedConnector {
  return {
    name: "az",
    binary: "az",
    enabled: true,
    default_timeout_seconds: 10,
    working_dir: null,
    skills: [],
    skill_root: null,
    discovery: { mode: "help" },
  };
}

describe("discoveryFingerprint", () => {
  it("changes when connector.env changes", () => {
    const a = discoveryFingerprint(baseConn());
    const b = discoveryFingerprint({
      ...baseConn(),
      env: { PATH: "C:\\custom\\bin" },
    });
    expect(b).not.toBe(a);
  });

  it("stable for same env keys in different order", () => {
    const c1 = { ...baseConn(), env: { B: "2", A: "1" } };
    const c2 = { ...baseConn(), env: { A: "1", B: "2" } };
    expect(discoveryFingerprint(c1)).toBe(discoveryFingerprint(c2));
  });
});