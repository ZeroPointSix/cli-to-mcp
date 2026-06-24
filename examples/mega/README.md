# gh + az 超大连接器同进程（mega 示例）

同一 MCP 进程挂载 **GitHub CLI** 与 **Azure CLI**，面向「数千工具、首启 ≤5 分钟、资源可控、向 1000+ 工具靠拢」。

## 设计要点

| 机制 | 作用 |
|------|------|
| `runtime.parallel_connector_discovery` | gh 与 az **同时**冷发现，不串行浪费 300s×2 |
| `runtime.max_inflight_help_spawns: 24` | 全进程最多 24 个 `--help` 子进程，避免 az×16+gh×8 打满 CPU |
| `startup_budget_seconds: 300` + 硬墙钟 | 每个 connector 首扫 ≤300s，`serve` 总墙钟约 300s（并行取 max） |
| `bfs_preference: shallow_first` | 预算内优先浅层路径 → **更多叶子工具** |
| `background_continue_discovery` | `serve` 后 **并行** 无预算续扫并 merge 注册表 |
| `exposure_mode: lazy` | `tools/list` 只暴露元工具，大列表走 `search_tools` / `call_tool` |

## 启动

```bash
cli-to-mcp serve --config ./examples/mega/cli-to-mcp.yaml
```

## 验收

| 阶段 | 命令 | 期望 |
|------|------|------|
| 首启 ≤5min | `node scripts/bench-mega-cold.mjs` | ≤302s 可 serve |
| **冲 1000+ 工具** | `node scripts/bench-until-1000.mjs --az-only` | 后台扫完后 `tools_final>=1000` |
| gh+az 全量 | `node scripts/bench-until-1000.mjs` | 同上（az 占大头） |

后台阶段可能 **30～90 分钟**（Windows + 全量 az depth=3）。保留缓存二次更快：

```bash
node scripts/bench-until-1000.mjs --az-only --keep-cache ./.bench-az-cache
```

环境变量 `BENCH_BG_MAX_MS=7200000` 可延长后台等待上限（默认 1h）。

运行中可看 `doctor` 的 `background_discovery.running`；完成后 `registry.size()` 即总工具数（lazy 下用 `search_tools` / `list_tool_categories` 浏览）。

## 调优

- 仅 az：复制 `examples/az/cli-to-mcp.yaml` 并加上 `runtime` 段
- 降低压力：`max_inflight_help_spawns: 16`，`az.concurrency: 12`
- 提高吞吐（机器够强）：`max_inflight_help_spawns: 32`，`help_timeout_seconds: 15`