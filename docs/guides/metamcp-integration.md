# 与 MetaMCP / metamcp-chatgpt 集成

`cli-to-mcp` 与仓库 [metamcp-chatgpt](https://github.com/ZeroPointSix/metamcp-chatgpt) 中的 **Streamable HTTP MCP** 使用同一套传输（`@modelcontextprotocol/sdk` + `Mcp-Session-Id`）。对齐实现包括：

| 能力 | metamcp-chatgpt | cli-to-mcp |
|------|-----------------|------------|
| Streamable HTTP `/mcp` | `/metamcp/{endpoint}/mcp` | `/mcp` |
| 健康检查 | Admin `/health` 等 | `GET /health` |
| Bearer 鉴权 | `ADMIN_MCP_SECRET` / API Key | `CLI_TO_MCP_HTTP_BEARER_TOKEN` |
| Accept 规范化 | `application/json, text/event-stream` | 同左（避免 SDK 406） |
| 请求体上限 | 网关层 | `CLI_TO_MCP_MAX_HTTP_BODY_BYTES`（默认 1MB） |
| 渐进式工具发现 | Facade `search_tools` 等 | 内置 meta：`list_tool_categories` / `search_tools` / `get_tool_schema` / `call_tool` |

## 推荐拓扑

```
Agent (Claude Code)
  → metamcp-local / 业务 MetaMCP HTTP
       → 命名空间：upstream = cli-to-mcp URL
            → 本机 gh/git/az …
```

- **不要**把未鉴权的 `cli-to-mcp` 绑在 `0.0.0.0` 上直接暴露；要么只监听 `127.0.0.1`，要么设置 `CLI_TO_MCP_HTTP_BEARER_TOKEN` 并在 MetaMCP 上游配置里写入相同 Bearer。
- **lazy 暴露**：connector `discovery.exposure_mode: lazy` 时，`tools/list` 只含 meta 工具；与 MetaMCP 门面 + `call_tool` 用法一致。

## 环境变量速查

| 变量 | 作用 |
|------|------|
| `CLI_TO_MCP_HTTP_BEARER_TOKEN` | 保护 `/mcp`（`/health` 除外） |
| `CLI_TO_MCP_MAX_HTTP_BODY_BYTES` | MCP POST 体大小上限 |
| `CLI_TO_MCP_MAX_CHILD_OUTPUT_BYTES` | 子进程 stdout/stderr 截断（UTF-8 字节） |
| `CLI_TO_MCP_OUTPUT_ENCODING` | `utf8` / `cp936` / `latin1` |

## 本地 Claude Code（`.mcp.json` 示例）

直连本机（无 MetaMCP）：

```json
{
  "mcpServers": {
    "cli-to-mcp": {
      "url": "http://127.0.0.1:28989/mcp",
      "headers": {}
    }
  }
}
```

经 Bearer（与 MetaMCP 上游配置一致）：

```json
{
  "headers": {
    "Authorization": "Bearer YOUR_TOKEN"
  }
}
```

更完整的 MetaMCP 运维说明见 metamcp-chatgpt 仓库 `docs/ops/claude-code-metamcp-local.md`。