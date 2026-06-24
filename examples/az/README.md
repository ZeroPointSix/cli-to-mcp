# Azure CLI（az）示例 — 大连接器与渐进式发现

本示例对应 [issue #15](https://github.com/ZeroPointSix/cli-to-mcp/issues/15)：在工具数量很多时，用 **lazy 暴露** + **元工具分层浏览**，避免 `tools/list` 一次返回数千条。

## 前置条件

- Node.js ≥ 22
- 本机已安装 [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)（`az` 在 PATH 中，或改用 `argv_prefix` 走 `python -m azure.cli`）

## 启动

```bash
cli-to-mcp serve --host 127.0.0.1 --port 28989 --config ./examples/az/cli-to-mcp.yaml
```

首次启动会按 `discovery` 配置做 help 树 BFS（可能较慢）；**工具定义**与**每条路径的原始 help 文本**均写入 SQLite（`help_cache`），后续重启或 `refresh_tools` 在指纹未变时可跳过大量 `az -h` 子进程。配置变更后可调用元工具 `refresh_tools` 重新发现。

## lazy 模式下的渐进式发现流程

当 `discovery.exposure_mode: lazy` 时，**动态 az 子命令工具不会出现在 `tools/list` 里**，但已全部注册在服务端，可通过元工具按需查询：

1. **`list_tool_categories`** — 列出分类（如 `connector:az`、`prefix:az:account`）及每类工具数量。
2. **`list_tools_by_category`** — 传入 `category`（上一步的 `id`），返回该分类下的工具摘要（名称、描述、命令前缀）。
3. **`get_tool_schema`** — 传入具体工具 `name`，获取完整 `inputSchema` 后再 `tools/call` 执行。

辅助检索：

- **`search_tools`** — 按名称、描述或命令路径关键词搜索（`query` + 可选 `limit`）。

与 MetaMCP 门面类似：**先列类目 → 再列工具 → 再取 schema → 再调用**，把上下文占用控制在可接受范围。

### Cursor / 仅注册 `tools/list` 的宿主（重要）

许多 MCP 宿主（含 **Cursor**）只会把 **`tools/list` 里出现的名字** 注册成可调用工具，**不会**为 lazy 隐藏的 `git_*` / `gh_*` 生成 `mcp__…__git_status` 这类代理。

- **服务端**：对未出现在 list 里的工具，原生 **`tools/call` 仍可用**（若宿主支持任意 name）。
- **Cursor 现状**：lazy 下你通常只能看到约 **10 个元工具**；直接 `tools/call` 名为 `git_status` 会报 **unavailable tool**。

**推荐在 lazy 下执行 CLI：**

```json
tools/call → call_tool
{
  "name": "git_status",
  "arguments": {}
}
```

或先 `search_tools` / `get_tool_schema`，再 **`call_tool`**（不要指望宿主暴露每个 `git_*` 独立工具名）。

若必须让 Cursor 出现全部 `git_*`/`gh_*` 工具名，把对应 connector 的 `exposure_mode` 改为 **`flat`**（无 `eager` 配置项，flat 即全量 list）。

## flat 与 lazy 何时选用

| `exposure_mode` | `tools/list` | 适用场景 |
|-----------------|--------------|----------|
| **flat**（默认） | 列出全部已发现工具 | 连接器工具少（如 git/gh 模板包）、客户端不支持元工具、或希望一次看到完整列表 |
| **lazy** | 仅列出元工具 + 非 lazy 连接器工具 | **大 CLI**（如完整 az、kubectl 全树）：避免 MCP 会话初始化时 payload 过大、模型误选错误工具 |

lazy 并不减少发现工作量，只改变**对外暴露方式**；执行仍用注册表里的真实工具名（如 `az_account_list`）。

## 并发与发现范围调优

- **`concurrency`**（1–32，示例为 `16`）：help BFS 使用**持续 worker 池**并行执行 `--help`（完成一条立刻取下一条，而非按批等待）。提高可缩短全量扫描时间，但会增加 CPU/进程压力；在 Windows 或慢磁盘上可从 `8` 起步。
- **`help_timeout_seconds`**（连接器级，示例 `25`）：单次 help 子进程超时，默认 `25`（不再复用 `default_timeout_seconds` 的 120s，避免慢节点拖死整轮扫描）。
- **`startup_budget_seconds`**（如 `300`）：启动阶段墙钟上限；到点后 **先启动 MCP**（硬墙钟约 335s，见上文）。
- **`background_continue_discovery`**（默认 `true`，在设置了 budget 时）：`serve` 起来后在**后台**去掉 budget 继续 help 扫描，把新工具 **merge 进内存注册表 + SQLite**（无需再调 `refresh_tools`）。`doctor` 返回 `background_discovery` 状态（`running` / `finished_at` / `last_registry_size`）。设为 `false` 则仅依赖手动 `refresh_tools`。

**本机实测（Azure CLI 2.87 / Windows）**：
- `runHelp` 并行 16 路（account/group）约 **17s**（`node scripts/time-run-help.mjs`）。
- 全量 `depth=3` 必须设 **`startup_budget_seconds: 300`**：**`startRuntime` / 首次 `serve` 墙钟 ≤300s**（到点即返回，不等待未结束的 `az -h`）。验证：`node scripts/bench-az-cold.mjs`（目标 **PASS ≤300s**）。首批工具数量视预算内扫到的子树而定；全量靠 **`background_continue_discovery`** 或 `refresh_tools` + `help_cache` 补齐。
- 示例 `include_subgroups` 子树：`node scripts/bench-az-demo.mjs`（目标同样 ≤300s；若仍偏慢，检查是否重复执行 `where`——已在 `resolveSpawnBinary` 做进程内缓存）。
- **`max_depth`**：help 树最大深度；az 全量很深，示例用 `3` 配合 **`include_subgroups`** 只扫 `account`、`group` 等一级子树，适合演示与开发机。
- **`include_subgroups`**：仅展开列出的顶层子命令；省略则从零层 help 展开所有子命令（生产接全量 az 时慎用，建议分组多个 connector 或限制子组）。
- **`help_argv`**：传给每个节点的 help 参数（如 `["-h"]`），需与目标 CLI 行为一致。
- **`materialize_global_args`**：为 `false` 时从叶子工具 schema 中剥离 Global Arguments 段的 `--help`/`--debug` 等；常见全局项（如 `--output`）仍可按解析器规则保留。需要把 `--subscription` 等显式暴露给 Agent 时可设为 `true` 并配合 `global_arg_allowlist`。

## 配置字段速查

见同目录 `cli-to-mcp.yaml` 内注释：`argv_prefix`、`parser_module`、`help_argv`、`materialize_global_args` 等均与 issue #15 / schema 一致。