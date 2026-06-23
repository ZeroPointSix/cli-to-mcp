# 新手教程：给 CLI-to-MCP 接一个 Git「插件」

本目录演示 **不写 TypeScript**、只加 **YAML + 模板包**，把 `git` 变成 MCP tools。

## 三步接入

### 1. 确认本机有 git

```bash
git --version
```

### 2. 使用本示例配置

```bash
cd cli-to-mcp
npm run build
node --experimental-sqlite dist/cli/main.js serve \
  --host 127.0.0.1 --port 28989 \
  --config examples/git/cli-to-mcp.yaml
```

MCP 客户端 URL：`http://127.0.0.1:28989/mcp`

### 3. 在 MCP 里应能看到

- 元工具：`doctor`、`list_connectors`、`refresh_tools`、…
- 模板工具：`git_status`、`git_log`、`git_diff_stat`、`git_branch`
- 若开启 `discovery.mode: help`，还会有 `git_*` 来自 help 扫描的叶子命令（与模板同名时 yaml/template 优先）

## 「插件」实际是什么？

| 层级 | 文件 | 作用 |
|------|------|------|
| 模板包 | `templates/git.yaml` | 内置 4 个稳定工具，connector 名叫 `git` 时自动加载 |
| 用户配置 | `examples/git/cli-to-mcp.yaml` | 声明 connector、help 深度、skill 路径 |
| Skill | `examples/git/skills/git.md` | Agent 读到的本地说明（非 URL） |

合并顺序：**你在 yaml 里写的 tools > template > help**。

## 和 gh 一起用

见 `examples/demo/cli-to-mcp.yaml`（gh + git 同一端口）。

## 自己改一个命令

在 `cli-to-mcp.yaml` 增加：

```yaml
tools:
  git_show_head:
    enabled: true
    connector: git
    command: ["show", "--no-patch", "--format=%H %s"]
    description: Show current HEAD commit hash and subject.
    output:
      format: text
```

保存后调用元工具 `refresh_tools` 或重启服务。