/**
 * Minimal argument parser for the cli-to-mcp CLI.
 *
 * Kept hand-rolled for Phase 1 to avoid pulling in a CLI framework; the surface
 * is intentionally tiny (serve + a few flags). Returns a discriminated union so
 * callers can pattern-match without losing type safety.
 */

export type ServeArgs = {
  kind: "serve";
  transport: "http";
  host: string;
  port: number;
  config: string;
};

export type HelpArgs = { kind: "help" };

export type UnknownArgs = { kind: "unknown"; command: string };

export type ParsedArgs = ServeArgs | HelpArgs | UnknownArgs;

const DEFAULT_SERVE: ServeArgs = {
  kind: "serve",
  transport: "http",
  host: "127.0.0.1",
  port: 8787,
  config: "./cli-to-mcp.yaml",
};

export function parseCliArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;

  if (command === undefined || command === "-h" || command === "--help" || command === "help") {
    return { kind: "help" };
  }

  if (command !== "serve") {
    return { kind: "unknown", command };
  }

  const serve: ServeArgs = { ...DEFAULT_SERVE };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = rest[i + 1];
    switch (arg) {
      case "--transport":
        if (next !== "http") {
          throw new Error(`unsupported transport: ${String(next)} (only "http" is supported in Phase 1)`);
        }
        serve.transport = "http";
        i++;
        break;
      case "--host":
        if (!next) throw new Error("--host requires a value");
        serve.host = next;
        i++;
        break;
      case "--port": {
        if (!next) throw new Error("--port requires a value");
        const n = Number(next);
        if (!Number.isInteger(n) || n < 1 || n > 65535) {
          throw new Error(`invalid --port: ${next}`);
        }
        serve.port = n;
        i++;
        break;
      }
      case "--config":
        if (!next) throw new Error("--config requires a value");
        serve.config = next;
        i++;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return serve;
}
