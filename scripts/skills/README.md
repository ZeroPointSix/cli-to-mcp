# 演示用假 Skill（联调 get_skills）

配置：`scripts/demo-config-lazy.yaml` 引用本目录。

## 测试命令（MCP meta）

| 场景 | 参数 |
|------|------|
| 连接器 gh 全部 skill 文件 | `get_skills` `{ "connector": "gh" }` |
| 连接器 git | `get_skills` `{ "connector": "git" }` |
| 列出 gh skill_root 文件 | `get_skills` `{ "connector": "gh", "list": true }` |
| 读单文件 | `get_skills` `{ "connector": "gh", "file": "gh-demo.md" }` |
| 工具级 | `get_skills` `{ "tool": "gh_pr_list" }` |

`skill_root` 指向 `scripts/skills`；`gh_pr_list` 额外绑定 `gh-pr-list.md`。