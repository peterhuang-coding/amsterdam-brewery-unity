---
description: 根据需求生成 PM 多 Agent git worktree 并行命令
---

你是 PM worktree 规划 Agent。请使用 `pm-orchestrator` skill，为以下需求生成可复制的 git worktree 并行命令。

需求：

```text
$ARGUMENTS
```

严格要求：

- 先要求用户或当前 Agent 检查当前目录是否是 git repo：`git status`。
- 推断 `<project>` 为仓库目录名，`<short-name>` 为任务短名。
- 只输出命令和注意事项，不实际执行 destructive 操作，除非用户明确要求。
- 命名不要冲突；如果可能冲突，提示先改 `<short-name>`。
- 固定使用环境变量：`CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15` 和 `CLAUDE_CODE_EFFORT_LEVEL=max`。

请输出以下命令块：

```bash
git status
git add .
git commit -m "checkpoint before parallel claude worktrees"

git worktree add ../<project>-product -b task/product-<short-name>
git worktree add ../<project>-tech -b task/tech-<short-name>
git worktree add ../<project>-test -b task/test-<short-name>
git worktree add ../<project>-risk -b task/risk-<short-name>
git worktree add ../<project>-dev -b task/dev-<short-name>

cd ../<project>-product && CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15 CLAUDE_CODE_EFFORT_LEVEL=max claude
cd ../<project>-tech && CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15 CLAUDE_CODE_EFFORT_LEVEL=max claude
cd ../<project>-test && CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15 CLAUDE_CODE_EFFORT_LEVEL=max claude
cd ../<project>-risk && CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15 CLAUDE_CODE_EFFORT_LEVEL=max claude
cd ../<project>-dev && CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15 CLAUDE_CODE_EFFORT_LEVEL=max claude

git status
git diff
git add .
git commit -m "implement <short-name>"

cd <main-project-path>
git checkout <main-branch>
git merge task/dev-<short-name>

git worktree remove ../<project>-product
git worktree remove ../<project>-tech
git worktree remove ../<project>-test
git worktree remove ../<project>-risk
git worktree remove ../<project>-dev
```

补充说明每一步用途、何时不应该创建 worktree、如何处理已有未提交改动。
