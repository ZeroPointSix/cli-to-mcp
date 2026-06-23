#!/usr/bin/env node
/**
 * Mock CLI for executor tests. Behaviour is driven by flags:
 *   --sleep        sleep 2s then exit 0 (for timeout tests)
 *   --fail         exit 1 with stderr "boom"
 *   --auth-fail    exit 4 with stderr "please login first"
 *   --echo-stdin   echo stdin (unused for now)
 *   otherwise      echo {"args":[...]} as JSON to stdout
 */
const args = process.argv.slice(2);
if (args.includes("--sleep")) {
  setTimeout(() => process.exit(0), 2000);
  process.stdout.write("starting sleep\n");
} else if (args.includes("--fail")) {
  process.stderr.write("boom\n");
  process.exit(1);
} else if (args.includes("--auth-fail")) {
  process.stderr.write("please login first\n");
  process.exit(4);
} else {
  process.stdout.write(JSON.stringify({ args }));
  process.exit(0);
}
