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
export type HelpArgs = {
    kind: "help";
};
export type UnknownArgs = {
    kind: "unknown";
    command: string;
};
export type ParsedArgs = ServeArgs | HelpArgs | UnknownArgs;
export declare function parseCliArgs(argv: string[]): ParsedArgs;
