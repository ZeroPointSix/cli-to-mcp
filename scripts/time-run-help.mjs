import { pathToFileURL, fileURLToPath } from "node:url";
import { join } from "node:path";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { runHelp } = await import(pathToFileURL(join(root, "dist/discovery/help-runner.js")).href);

const paths = [[], ["account"], ["account", "list"], ["group"], ["vm"]];
for (const path of paths) {
  const t0 = Date.now();
  await runHelp("az", path, { timeoutMs: 25000, helpArgv: ["-h"] });
  console.log(path.join(" ") || "(root)", Date.now() - t0, "ms");
}

const t0 = Date.now();
await Promise.all(
  Array.from({ length: 16 }, (_, i) =>
    runHelp("az", i % 2 === 0 ? ["account"] : ["group"], { timeoutMs: 25000, helpArgv: ["-h"] }),
  ),
);
console.log("parallel 16x (account/group):", Date.now() - t0, "ms");