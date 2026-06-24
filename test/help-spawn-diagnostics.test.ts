import { describe, expect, it, beforeEach } from "vitest";
import {
  clearHelpSpawnErrorsForConnector,
  clearLastHelpSpawnError,
  getHelpSpawnErrorsForConnector,
  getLastHelpSpawnError,
  recordLastHelpSpawnError,
} from "../src/discovery/help-spawn-diagnostics.js";

describe("help-spawn-diagnostics", () => {
  beforeEach(() => clearLastHelpSpawnError());

  it("accumulates failures per connector", () => {
    recordLastHelpSpawnError({
      connector_name: "az",
      binary: "az",
      path: ["account"],
      message: "empty help",
    });
    recordLastHelpSpawnError({
      connector_name: "az",
      binary: "az",
      path: ["group"],
      message: "timeout",
      timed_out: true,
    });
    const list = getHelpSpawnErrorsForConnector("az");
    expect(list).toHaveLength(2);
    expect(list[1].path).toEqual(["group"]);
    expect(getLastHelpSpawnError()?.message).toBe("timeout");
  });

  it("clearHelpSpawnErrorsForConnector removes only that connector", () => {
    recordLastHelpSpawnError({
      connector_name: "az",
      binary: "az",
      path: [],
      message: "a",
    });
    recordLastHelpSpawnError({
      connector_name: "gh",
      binary: "gh",
      path: [],
      message: "b",
    });
    clearHelpSpawnErrorsForConnector("az");
    expect(getHelpSpawnErrorsForConnector("az")).toHaveLength(0);
    expect(getHelpSpawnErrorsForConnector("gh")).toHaveLength(1);
  });
});