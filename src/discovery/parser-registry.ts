/**
 * HelpParser plugin interface (ADR 0002) and a minimal registry.
 *
 * Selection order, per ADR §3.2:
 *   1. explicit plugin id from connector.discovery.parser
 *   2. highest match() score among registered plugins
 *   3. built-in `generic` fallback
 */
import type { DiscoveredCommand } from "./types.js";

export type HelpParserContext = {
  connectorName: string;
  binary: string;
  /** Subcommand path that produced this help, e.g. ["pr","view"]. */
  path: string[];
  rawHelp: string;
  exitCode: number | null;
};

export type HelpParserPlugin = {
  id: string;
  displayName: string;
  /** 0 = will not handle; higher = higher priority. */
  match(ctx: HelpParserContext): number;
  parse(ctx: HelpParserContext): DiscoveredCommand;
};

export class HelpParserRegistry {
  private plugins: HelpParserPlugin[] = [];

  register(plugin: HelpParserPlugin): void {
    this.plugins.push(plugin);
  }

  list(): HelpParserPlugin[] {
    return [...this.plugins];
  }

  /**
   * Select the plugin that would handle a parse, without invoking parse().
   * Mirrors parse()'s selection order: explicit id (if found) → highest match()
   * score → null. Used by HelpSource to log which parser was used per node.
   */
  selectPlugin(ctx: HelpParserContext, explicitId?: string): HelpParserPlugin | null {
    if (explicitId) {
      const p = this.plugins.find((pl) => pl.id === explicitId);
      if (p) return p;
    }
    let best: HelpParserPlugin | null = null;
    let bestScore = 0;
    for (const p of this.plugins) {
      const score = safeMatch(p, ctx);
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    return best;
  }

  parse(ctx: HelpParserContext, explicitId?: string): DiscoveredCommand {
    const p = this.selectPlugin(ctx, explicitId);
    if (p) return safeParse(p, ctx);
    // Should never happen because generic returns 1, but guard anyway.
    throw new Error("no help parser registered");
  }
}

function safeParse(p: HelpParserPlugin, ctx: HelpParserContext): DiscoveredCommand {
  try {
    return p.parse(ctx);
  } catch (err) {
    // Plugin failure: fall back to a minimal command preserving rawHelp.
    return {
      connectorName: ctx.connectorName,
      path: ctx.path,
      rawHelp: ctx.rawHelp,
      description: undefined,
      usage: undefined,
      args: [],
      subcommands: [],
    };
  }
}

function safeMatch(p: HelpParserPlugin, ctx: HelpParserContext): number {
  try {
    return p.match(ctx);
  } catch {
    return 0;
  }
}
