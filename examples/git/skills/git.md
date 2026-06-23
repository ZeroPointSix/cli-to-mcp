# Git 连接器 Skill（给 Agent）

- 本 connector 调用本机 `git`，默认在 `working_dir` 所指仓库根目录执行（未配置则用进程 cwd）。
- 优先用模板工具：`git_status`、`git_log`、`git_diff_stat`、`git_branch`。
- 写操作（commit、push、reset --hard）未预置；需要时在 yaml 里自行声明并承担风险。
- `git_log` 的 `n` 参数控制条数；输出为 text，不要假设 JSON。