import type { ToolDefinition } from "../registry/tool-definition.js";
export type ConnectorRow = {
    name: string;
    binary: string;
    enabled: number;
    version: string | null;
    config_hash: string;
    created_at: string;
    updated_at: string;
};
export type ScanRunStatus = "running" | "ok" | "failed";
export type ScanRunRow = {
    id: number;
    connector_name: string;
    status: ScanRunStatus;
    started_at: string;
    finished_at: string | null;
    error: string | null;
};
export type ToolRow = {
    name: string;
    connector_name: string;
    definition_json: string;
    source: string;
    config_hash: string;
    updated_at: string;
};
export type CommandRow = {
    id: number;
    connector_name: string;
    path: string;
    raw_help: string;
    parsed_json: string | null;
    scan_run_id: number | null;
};
export declare class CacheStore {
    private db;
    constructor(dbPath: string);
    close(): void;
    /** Run `fn` inside a transaction. Rolls back on throw. */
    private tx;
    private migrate;
    /** Upgrade legacy tools(name) PK to (config_hash, name) for per-hash isolation. */
    private migrateToolsPrimaryKey;
    upsertConnector(c: Omit<ConnectorRow, "created_at" | "updated_at">): void;
    getConnector(name: string): ConnectorRow | undefined;
    startScanRun(connectorName: string): number;
    finishScanRun(id: number, status: ScanRunStatus, error: string | null): void;
    latestScanRun(connectorName: string): ScanRunRow | undefined;
    replaceCommands(connectorName: string, scanRunId: number, rows: Array<{
        path: string;
        raw_help: string;
        parsed_json: string | null;
    }>): void;
    getCommands(connectorName: string): CommandRow[];
    /**
     * Atomically replace all tools for a given configHash. Old tools with a
     * DIFFERENT configHash are retained so refresh failure can fall back to them.
     */
    replaceTools(configHash: string, tools: ToolDefinition[]): void;
    loadTools(configHash: string): ToolDefinition[];
    loadLatestTools(): ToolDefinition[];
    getTool(name: string): ToolDefinition | undefined;
    hasToolsForHash(configHash: string): boolean;
}
