# cli-to-mcp

把本机已安装的 **命令行工具** 暴露为 **MCP（Model Context Protocol）** 工具，通过 HTTP 供 Claude Code、MetaMCP 等客户端调用。

## 要求

- **Node.js ≥ 22**（使用实验性 SQLite 缓存）
- 本机已安装并可在 PATH 中调用的 CLI（如 `git`、`gh`）

## 快速开始

### 1. 安装

```bash
npm install -g cli-to-mcp
# 或一次性运行
npx cli-to-mcp serve --help
```

### 2. 配置文件 `cli-to-mcp.yaml`

```yaml
version: 1

connectors:
  - name: git
    binary: git
    enabled: true
    default_timeout_seconds: 30
    discovery:
      mode: manual    # 使用内置 templates/git.yaml，不扫全量 help
    skills:
      - ./skills/git.md   # 可选，相对配置文件目录

  - name: gh
    binary: gh
    enabled: true
    discovery:
      mode: manual
      parser: cobra
```

也可在 `tools:` 下显式声明或覆盖单个命令（优先级最高）。

### 3. 启动服务

```bash
cli-to-mcp serve \
  --host 127.0.0.1 \
  --port 28989 \
  --config ./cli-to-mcp.yaml
```

MCP 端点：**`http://127.0.0.1:28989/mcp`**

在 MCP 客户端中配置上述 URL（Streamable HTTP）。

### 4. 元工具

| 工具 | 作用 |
|------|------|
| `list_connectors` | 已注册的 connector |
| `doctor` | 检查 binary、解析器、缓存 |
| `refresh_tools` | 改配置后重新发现工具 |
| `get_skills` | 读取本地 skill 说明 |
| `get_tool_source` | 查看工具来自 yaml / template / help |

## Discovery 模式

| `discovery.mode` | 行为 |
|------------------|------|
| `help` | 扫描 `--help` 树，自动生成叶子子命令工具 |
| `manual` | 不扫 help，仅用 **template 包** + 你在 `tools:` 里写的项 |
| `none` | 同 manual，且不跑 help 源 |

合并优先级：**用户 YAML > 内置 template > help**。

内置模板：`templates/gh.yaml`、`templates/git.yaml`（connector 名匹配或 `discovery.template: gh`）。

## 示例配置

包内附带：

- `examples/git/cli-to-mcp.yaml` — 仅 Git
- `examples/demo/cli-to-mcp.yaml` — gh + git

复制到项目目录后改 `--config` 路径即可。

## 文档（设计 / 解析器）

产品与设计文档见仓库 [ZeroPointSix/cli-to-mcp](https://github.com/ZeroPointSix/cli-to-mcp) 及开发文档中的 **Help 解析器编写指南**。

## 开发

```bash
git clone https://github.com/ZeroPointSix/cli-to-mcp.git
cd cli-to-mcp
npm install
npm run build
npm test
npm start -- serve --config examples/git/cli-to-mcp.yaml
```

## License

MIT