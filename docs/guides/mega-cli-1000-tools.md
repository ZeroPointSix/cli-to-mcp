# 超大 CLI（gh / az）实测：如何冲到 1000+ 工具

## 结论先说

| 目标 | 能否 5 分钟内完成 | 做法 |
|------|-------------------|------|
| **MCP 能连、能调工具** | ✅ 可以（≤300s + 少量 serve 开销） | `startup_budget_seconds: 300` |
| **注册表里 1000+ 叶子工具** | ❌ 不能压在 5 分钟内 | **后台 `background_continue_discovery`** 或多次 `refresh_tools` |
| **1000+ 且资源可控** | ✅ 可以（总时长 30～120 分钟视机器） | `max_inflight_help_spawns` + `help_cache` |

az 全量 `depth=3` 的 help 节点是**数千级**；单次 `az -h` 在 Windows 上约 0.7～15s。数学上 1000 个叶子 ≈ 至少要完成上千次 help（含非叶子），并行 24 也要**远超过 5 分钟**。

---

## 推荐配置（单 az 冲 1000+）

使用压测脚本生成的配置，或 `examples/mega` 里只保留 az 并提高 `concurrency: 24`：

```yaml
runtime:
  max_inflight_help_spawns: 24
  parallel_connector_discovery: true

connectors:
  - name: az
    binary: az
    help_timeout_seconds: 20
    discovery:
      mode: help
      max_depth: 3
      concurrency: 24
      startup_budget_seconds: 300
      background_continue_discovery: true
      bfs_preference: shallow_first
      exposure_mode: lazy
```

---

## 实测步骤（本机）

```bash
cd source/cli-to-mcp
npm run build

# 1) 仅验证 5 分钟内能 serve（单 az）
node scripts/bench-az-cold.mjs

# 2) gh+az 并行首启
node scripts/bench-mega-cold.mjs

# 3) 冲 1000+：冷启 + 等后台扫完（核心）
node scripts/bench-until-1000.mjs --az-only --keep-cache ./.bench-az-1k
```

脚本输出：

- `phase 1`：`cold_time`、`tools`（通常几百）
- `phase 2`：每分钟 poll `registry=…`
- 结束：`tools_final`、`goal >=1000: PASS/FAIL`

后台上限默认 1 小时，不够时：

```bash
BENCH_BG_MAX_MS=7200000 node scripts/bench-until-1000.mjs --az-only --keep-cache ./.bench-az-1k
```

**第二次**用同一 `--keep-cache` 目录：`help_cache` 命中后，后台阶段会快很多；若 `tools` 已在 SQLite 满 configHash，则直接秒启。

若后台已扫完 help（日志里 `leaf_tools=3000+`）但 `registry` 仍只有冷启数量（旧版本或 bench 超时），**不必重跑 2h help**：

```bash
node scripts/rebuild-tools-from-cache.mjs --cache-dir ./.bench-az-1k
# 约 1～2s，从 help_cache 重建 tools 表；再 serve 同一 cache 即 3000+ 工具
```

`bench-until-1000.mjs --keep-cache` 在 FAIL 时会自动尝试 phase 3 rebuild。

---

## 日常 serve（生产）

```bash
cli-to-mcp serve --config ./examples/mega/cli-to-mcp.yaml
# 或仅 az 的 yaml
```

1. 首次：约 5 分钟可连；`doctor` → `background_discovery.running: true`
2. 等待 `finished_at` 非空且 `running: false`
3. `doctor.cache.tools_count` 或元工具 `list_tool_categories` 看数量
4. 不足 1000：不要删 `.cli-to-mcp/cache.sqlite`，再 `refresh_tools`（无 budget 的全量发现）

---

## gh + az 同时开

- **首启**：gh 与 az **并行** 300s，总墙钟 ≈ max(gh, az)，不是 600s
- **1000+**：主要靠 **az** 叶子；gh depth=3 通常几十～百级
- 要 **双满**：两个 connector 都 `background_continue_discovery: true`（mega 示例已开）

---

## 若仍 < 1000

1. 确认 `max_depth: 3`（depth=2 叶子更少）
2. 不要设 `include_subgroups`（全量树）
3. 看日志 `leaf_tools=`、`tools_per_min~`
4. 延长后台：增大 `BENCH_BG_MAX_MS` 或让进程多跑一会再 `doctor`
5. 解析漏叶子：个别 az 子命令 help 格式非常规 → 换 `parser_module` 或 YAML 补工具