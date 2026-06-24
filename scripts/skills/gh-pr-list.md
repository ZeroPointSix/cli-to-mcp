# [测试] 工具级 skill — gh_pr_list

绑定工具：`gh_pr_list`（YAML 声明，mixed 源）。

## 推荐参数

- 默认已带 `-L 5` 与 `--json number,title`。
- 需要更多字段时在 `call_tool.arguments` 里按 schema 追加（若工具声明了对应 arg）。

## 调用示例（MCP）

```json
{
  "name": "call_tool",
  "arguments": {
    "name": "gh_pr_list",
    "arguments": {}
  }
}
```