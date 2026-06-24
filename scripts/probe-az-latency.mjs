/**
 * Probe az -h latency using the REAL runHelp (handles Windows .cmd shim).
 * Measures per-spawn latency at concurrency 1/4/8/16/24 to find the
 * throughput sweet spot — the cold-start measurement showed ~38s/spawn at
 * 24-way, suggesting contention. Confirm and find the optimum.
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const root = process.cwd();
const { runHelp } = await import(pathToFileURL(join(root, "dist/discovery/help-runner.js")).href);

const connEnv = {
  AZURE_CORE_COLLECT_TELEMETRY: "false",
  AZURE_CORE_DISABLE_TELEMETRY: "true",
  PYTHONDONTWRITEBYTECODE: "1",
  PYTHONNOUSERSITE: "1",
  PYTHONUNBUFFERED: "1",
};

async function oneHelp() {
  const t = Date.now();
  const out = await runHelp("az", [], {
    timeoutMs: 30_000,
    env: { ...process.env, ...connEnv },
    helpArgv: ["-h"],
  });
  const ms = Date.now() - t;
  return { ms, len: out.rawHelp.length, source: out.source, timedOut: out.timedOut };
}

async function probeBatch(label, concurrency, count) {
  const t0 = Date.now();
  let done = 0;
  let timedOut = 0;
  let totalLen = 0;
  const run = async () => {
    while (done < count) {
      done++;
      const r = await oneHelp();
      if (r.timedOut) timedOut++;
      totalLen += r.len;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => run()));
  const totalMs = Date.now() - t0;
  const perSpawn = totalMs / count;
  const throughput = (count / totalMs) * 1000;
  console.log(
    `${label}: c=${concurrency} n=${count} total=${(totalMs/1000).toFixed(1)}s per_spawn=${perSpawn.toFixed(0)}ms throughput=${throughput.toFixed(2)}/s timeouts=${timedOut} avg_len=${Math.round(totalLen/count)}`,
  );
}

console.log("Probing real az -h latency curve...\n");
const single = await oneHelp();
console.log(`single: per_spawn=${single.ms}ms len=${single.len} source=${single.source} timedOut=${single.timedOut}\n`);

// Use az group -h (depth 1) to vary the path and match real discovery load
async function oneHelpPath(path) {
  const t = Date.now();
  const out = await runHelp("az", path, {
    timeoutMs: 30_000,
    env: { ...process.env, ...connEnv },
    helpArgv: ["-h"],
  });
  return { ms: Date.now() - t, len: out.rawHelp.length, timedOut: out.timedOut };
}

// Mix of paths like real BFS
const paths = [[], ["account"], ["group"], ["vm"], ["network"], ["storage"], ["appservice"], ["aks"]];
async function oneHelpMixed(i) {
  return oneHelpPath(paths[i % paths.length]);
}

async function probeMixed(label, concurrency, count) {
  const t0 = Date.now();
  let done = 0;
  let timedOut = 0;
  const run = async () => {
    while (done < count) {
      const i = done;
      done++;
      const r = await oneHelpMixed(i);
      if (r.timedOut) timedOut++;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, () => run()));
  const totalMs = Date.now() - t0;
  console.log(
    `${label}: c=${concurrency} n=${count} total=${(totalMs/1000).toFixed(1)}s per_spawn=${(totalMs/count).toFixed(0)}ms throughput=${((count/totalMs)*1000).toFixed(2)}/s timeouts=${timedOut}`,
  );
}

console.log("Mixed-path probe (closer to real BFS load):");
await probeMixed("c1", 1, 8);
await probeMixed("c4", 4, 16);
await probeMixed("c8", 8, 24);
await probeMixed("c16", 16, 32);
await probeMixed("c24", 24, 48);
console.log("\ndone");
process.exit(0);
