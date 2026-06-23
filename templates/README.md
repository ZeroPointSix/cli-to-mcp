# Connector Template Packs

A template pack is a YAML fragment that ships known-good tool scaffolds for a
common CLI. When a connector matches a pack, every tool in the pack becomes a
`template`-sourced tool — no need to hand-write `tools:` in `cli-to-mcp.yaml`.

## How packs are matched

For each connector, `TemplateSource` resolves a pack in this order:

1. **Explicit**: `connectors[].discovery.template: "gh"` — use the pack with
   that id, regardless of the connector name.
2. **Auto-match by name**: if `connectors[].name` appears in a pack's
   `connectorNames`, that pack is used.
3. Otherwise no template.

## Built-in packs

| id   | connectorNames | Tools |
|------|----------------|-------|
| `gh` | `gh`           | `gh_pr_view`, `gh_pr_list`, `gh_repo_view`, `gh_issue_list` |
| `git` | `git`         | `git_status`, `git_log`, `git_diff_stat`, `git_branch` |

The `gh` pack mirrors `examples/gh/cli-to-mcp.yaml` so the two are
interchangeable: use the pack when you want zero-config defaults, use the
example yaml when you want to copy/edit fields.

## Merge priority

Per ADR 0003: `user YAML > template > help`. A user `tools:` entry with the
same name overrides the template tool's fields; the result is tagged
`source: mixed`. Template-only tools stay `source: template`.

## Adding a pack

1. Create `templates/<id>.yaml` with this shape:

   ```yaml
   id: <id>
   connectorNames:
     - <name>
   tools:
     <tool_name>:
       connector: <id>
       command: ["sub", "cmd"]
       description: ...
       args: { ... }
       default_args: ["--json", "..."]
       output: { format: json }
   ```

2. Restart the runtime — `loadBuiltinPacks()` picks up every `*.yaml` in this
   directory at startup. No code change needed.

3. (Optional) Add a matching `examples/<id>/` demo for users who prefer to
   copy a full config.

## Confidence

Template artifacts use `confidence: 0.85` — higher than help (~0.35) and lower
than yaml (1.0). This keeps templates authoritative over auto-discovery while
leaving user YAML as the final word.
