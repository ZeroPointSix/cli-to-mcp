import { isAbsolute, relative, resolve } from "node:path";

/** Resolve a path relative to configDir; reject traversal and absolute entries in YAML. */
export function resolvePathUnderConfigDir(configDir: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`absolute paths not allowed in config references: ${relativePath}`);
  }
  const base = resolve(configDir);
  const target = resolve(base, relativePath);
  const rel = relative(base, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`path escapes config directory: ${relativePath}`);
  }
  return target;
}