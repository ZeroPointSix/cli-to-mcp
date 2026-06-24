import { describe, expect, it } from "vitest";
import { HelpSpawnGate } from "../src/discovery/help-spawn-gate.js";

describe("HelpSpawnGate", () => {
  it("limits concurrent acquires", async () => {
    const gate = new HelpSpawnGate(2);
    let max = 0;
    let cur = 0;
    const work = async () => {
      await gate.acquire();
      cur++;
      max = Math.max(max, cur);
      await new Promise((r) => setTimeout(r, 30));
      cur--;
      gate.release();
    };
    await Promise.all([work(), work(), work(), work()]);
    expect(max).toBeLessThanOrEqual(2);
  });
});