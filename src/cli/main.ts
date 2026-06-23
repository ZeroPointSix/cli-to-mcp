#!/usr/bin/env node
/**
 * cli-to-mcp CLI entrypoint.
 *
 * Phase 1 target command:
 *   npx cli-to-mcp serve --transport http --host 0.0.0.0 --port 8787 --config ./cli-to-mcp.yaml
 */
import { parseCliArgs } from "./args.js";
import { startRuntime } from "./runtime.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = parseCliArgs(args);

  if (parsed.kind === "unknown") {
    process.stderr.write(`cli-to-mcp: unknown command "${parsed.command}"\n`);
    process.stderr.write(`Usage: cli-to-mcp serve [--transport http] [--host HOST] [--port PORT] [--config PATH]\n`);
    process.exit(2);
  }

  if (parsed.kind === "help") {
    process.stdout.write(`cli-to-mcp\n\nUsage: cli-to-mcp serve [--transport http] [--host HOST] [--port PORT] [--config PATH]\n`);
    process.exit(0);
  }

  // parsed.kind === "serve"
  const serve = parsed;
  const runtime = await startRuntime({
    host: serve.host,
    port: serve.port,
    config: serve.config,
  });

  // Graceful shutdown on SIGINT/SIGTERM.
  const shutdown = async (signal: string) => {
    process.stderr.write(`\n[cli-to-mcp] received ${signal}, shutting down\n`);
    try {
      await runtime.stop();
    } catch (err) {
      process.stderr.write(`[cli-to-mcp] shutdown error: ${String(err)}\n`);
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  process.stderr.write(`cli-to-mcp: ${String(err)}\n`);
  process.exit(1);
});
