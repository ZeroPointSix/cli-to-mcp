# [测试] gh connector skill

## 用途（假数据，仅供 get_skills 联调）

- 在 **lazy** 模式下先用 `list_tool_categories` / `search_tools`，再 `get_tool_schema`，最后用 **`call_tool`** 执行 `gh_*` 工具。
- 只读场景优先：`gh_pr_list`、`gh_pr_view`、`gh_auth_status`（勿随意传 `show-token`）。

## 输出约定

- 带 `default_args: --json` 的 YAML 工具会返回可解析 JSON；help 发现工具多为纯文本。

## 故障排查

| 现象 | 处理 |
|------|------|
| Cursor 报 unavailable `gh_*` | 正常；改 `call_tool` + `name: "gh_pr_list"` |
| doctor `executor_probe.ok: false` | Windows 检查 `where gh`；重启 MCP 前 `npm run build` |