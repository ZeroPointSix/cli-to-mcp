/**
 * Process-wide record of help subprocess failures (spawn error, timeout, or empty help).
 * Surfaced in doctor() when discovery yields 0 tools.
 */
export type LastHelpSpawnError = {
  at: string;
  connector_name?: string;
  binary: string;
  path: string[];
  message: string;
  exit_code?: number | null;
  timed_out?: boolean;
  stderr_snippet?: string;
};

const MAX_FAILURES_PER_CONNECTOR = 32;
const failures: LastHelpSpawnError[] = [];

export function recordLastHelpSpawnError(entry: Omit<LastHelpSpawnError, "at"> & { at?: string }): void {
  const row: LastHelpSpawnError = {
    ...entry,
    at: entry.at ?? new Date().toISOString(),
  };
  failures.push(row);
  if (failures.length > 500) failures.splice(0, failures.length - 500);
}

/** Most recent failure (backward compatible). */
export function getLastHelpSpawnError(): LastHelpSpawnError | null {
  return failures.length ? failures[failures.length - 1]! : null;
}

/** Recent failures for a connector, newest last. */
export function getHelpSpawnErrorsForConnector(connectorName: string, limit = MAX_FAILURES_PER_CONNECTOR): LastHelpSpawnError[] {
  return failures.filter((f) => f.connector_name === connectorName).slice(-limit);
}

/** All recent failures (newest last). */
export function getRecentHelpSpawnErrors(limit = 50): LastHelpSpawnError[] {
  return failures.slice(-limit);
}

export function clearLastHelpSpawnError(): void {
  failures.length = 0;
}

export function clearHelpSpawnErrorsForConnector(connectorName: string): void {
  for (let i = failures.length - 1; i >= 0; i--) {
    if (failures[i]!.connector_name === connectorName) failures.splice(i, 1);
  }
}