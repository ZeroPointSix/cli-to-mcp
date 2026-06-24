# [测试] Lazy 暴露 — Agent 阅读顺序

1. `doctor` — 看 `executor_probe.ok` 与 `tool_count`
2. `list_tool_categories` — 选 `prefix:gh:pr` 等
3. `list_tools_by_category` 或 `search_tools`
4. `get_tool_schema` — 单工具参数
5. `get_skills` — connector / tool / skill_root 列表
6. `call_tool` — 真正执行 CLI

无效 category 会返回 `unknown_category: true`。