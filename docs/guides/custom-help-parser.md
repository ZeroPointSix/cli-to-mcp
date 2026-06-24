# 自定义 Help 解析器（只写解析器即可接入 CLI）

目标：**不改 cli-to-mcp 源码**，写一个 `HelpParserPlugin` 模块，在 YAML 里引用后即可对任意 CLI 做 `discovery.mode: help` 扫描。

## 1. 写一个解析器模块（`.mjs` 推荐）

导出对象需实现：

| 字段 | 说明 |
|------|------|
| `id` | 全局唯一，connector 用 `discovery.parser: <id>` 引用 |
| `displayName` | 展示名 |
| `match(ctx)` | 返回 0（不用）或正整数（越大越优先） |
| `parse(ctx)` | 返回 `DiscoveredCommand`（`subcommands`、`args`、`rawHelp` 等） |

```javascript
// parsers/my-cli.mjs
export const plugin = {
  id: "my-cli",
  displayName: "My CLI",
  match(ctx) {
    return ctx.rawHelp.includes("MY COMMANDS") ? 80 : 0;
  },
  parse(ctx) {
    return {
      connectorName: ctx.connectorName,
      path: ctx.path,
      rawHelp: ctx.rawHelp,
      description: undefined,
      args: [],
      subcommands: ["run", "list"], // 从 help 文本解析
    };
  },
};
```

也支持：`export default`、`export const parser`、`export const plugins = [...]`。

## 2. 在配置里加载一次（推荐顶层 `parsers:`）

```yaml
version: 1

parsers:
  - ./parsers/my-cli.mjs   # 相对配置文件目录

connectors:
  - name: mytool
    binary: mytool
    enabled: true
    discovery:
      mode: help
      parser: my-cli        # 对应插件 id
      max_depth: 3
```

多个 connector 共用同一解析器时，**只写一行 `parsers:`**，不必在每个 connector 上重复 `parser_module`。

## 3. 内置解析器（无需 `parsers:`）

| id | 适用 |
|----|------|
| `generic` | 常见 `Commands:` / `Options:` 段落 |
| `cobra` | Cobra / gh 风格 |
| `azure-cli` | Azure CLI `az`（`Subgroups:` / `Commands:`） |

示例（az 全量 help）：

```yaml
connectors:
  - name: az
    binary: az
    discovery:
      mode: help
      parser: azure-cli
      max_depth: 3
```

## 4. 兼容：按 connector 挂载（旧写法）

```yaml
connectors:
  - name: az
    binary: az
    discovery:
      parser: az
      parser_module: ./parsers/az.mjs
```

仍支持；与顶层 `parsers:` 可同时使用（同路径只加载一次）。

## 5. 验证

`doctor` 元工具会列出 `parsers.registered`；启动日志含 `loaded parser module ... parser=<id>`。