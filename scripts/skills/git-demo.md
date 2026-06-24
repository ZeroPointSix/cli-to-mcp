# [测试] git connector skill

## 用途（假数据）

- 模板工具示例名：`git_status`、`git_log`、`git_branch`（以注册表 `search_tools` 为准）。
- 执行：`call_tool` + `{"name":"git_status","arguments":{}}`。

## 注意

- git 根 help 在本项目中常 **无子命令叶子**，多数 git 工具来自 **template** 包。
- 与 gh 共用同一 MCP 端口时，两者均为 `exposure_mode: lazy`。