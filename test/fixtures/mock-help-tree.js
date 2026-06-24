#!/usr/bin/env node
const args = process.argv.slice(2);
const helpIdx = args.findIndex((a) => a === "--help" || a === "-h");
const path = helpIdx >= 0 ? args.slice(0, helpIdx) : args;
const key = path.join(" ");

const pages = {
  "": `Commands:\n  a   A\n  b   B\n`,
  a: `Commands:\n  leaf   Leaf A\n`,
  b: `Commands:\n  leaf   Leaf B\n`,
  "a leaf": `Options:\n  --x   x\n`,
  "b leaf": `Options:\n  --y   y\n`,
};

const text = pages[key];
if (text) {
  process.stdout.write(text);
  process.exit(0);
}
process.stderr.write("unknown\n");
process.exit(1);