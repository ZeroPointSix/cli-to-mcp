# gh demo connector

A Phase 1 demo showing how to expose the GitHub CLI (`gh`) as MCP tools.

## Prerequisites

- Node.js >= 22
- `gh` installed and authenticated (`gh auth login`)

## Run

From this directory:

```bash
npx cli-to-mcp serve --transport http --host 0.0.0.0 --port 8787 --config ./cli-to-mcp.yaml
```

Or from the repo root:

```bash
node --experimental-sqlite dist/cli/main.js serve \
  --transport http --host 0.0.0.0 --port 8787 \
  --config ./examples/gh/cli-to-mcp.yaml
```

## Tools exposed

| Tool | gh command | Description |
|------|------------|-------------|
| `gh_pr_view`    | `gh pr view`    | View a PR by number/branch/URL |
| `gh_pr_list`    | `gh pr list`    | List PRs in the current repo |
| `gh_repo_view`  | `gh repo view`  | View a repository |
| `gh_issue_list` | `gh issue list` | List issues in the current repo |

Plus the fixed meta-tools: `list_connectors`, `doctor`, `refresh_tools`,
`get_skills`, `get_tool_source`.

All `gh_*` tools request `--json` output, so results come back as structured
JSON in `parsed_output`.

## Try it with curl

```bash
# Initialize session
curl -s -D headers.txt -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# Read the session id from headers.txt, then:
SID=$(grep -i 'mcp-session-id' headers.txt | tr -d '\r' | awk '{print $2}')

# Send initialized notification
curl -s -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# List tools
curl -s -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Call gh_pr_list
curl -s -X POST http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"gh_pr_list","arguments":{}}}'
```

## Tests

The test suite (`test/gh-demo.test.ts`) uses a mock `gh` script so it runs in
CI without `gh` installed. If `gh` is available locally you can also run a
real smoke test by pointing the config at the real `gh` binary.
