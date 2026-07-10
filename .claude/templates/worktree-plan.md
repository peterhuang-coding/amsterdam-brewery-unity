# Worktree Plan

## 1. Checkpoint

```bash
git status
git add .
git commit -m "checkpoint before parallel claude worktrees"
```

## 2. 创建 worktree

```bash
git worktree add ../<project>-product -b task/product-<short-name>
git worktree add ../<project>-tech -b task/tech-<short-name>
git worktree add ../<project>-test -b task/test-<short-name>
git worktree add ../<project>-risk -b task/risk-<short-name>
git worktree add ../<project>-dev -b task/dev-<short-name>
```

## 3. 启动 Claude

```bash
cd ../<project>-product && ANTHROPIC_BASE_URL=https://api.sfkey.cn CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15 claude --model glm-5.2
cd ../<project>-tech && ANTHROPIC_BASE_URL=https://api.sfkey.cn CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15 claude --model glm-5.2
cd ../<project>-test && ANTHROPIC_BASE_URL=https://api.sfkey.cn CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15 claude --model glm-5.2
cd ../<project>-risk && ANTHROPIC_BASE_URL=https://api.sfkey.cn CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15 claude --model glm-5.2
cd ../<project>-dev && ANTHROPIC_BASE_URL=https://api.sfkey.cn CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY=15 claude --model glm-5.2
```

如果当前应用要求 OpenAI 兼容路径，把 `https://api.sfkey.cn` 改成 `https://api.sfkey.cn/v1`。不要把 API key 写入模板或仓库文件。

## 4. 查看 diff

```bash
git status
git diff
```

## 5. Commit

```bash
git add .
git commit -m "implement <short-name>"
```

## 6. Merge

```bash
cd <main-project-path>
git checkout <main-branch>
git merge task/dev-<short-name>
```

## 7. 清理 worktree

```bash
git worktree remove ../<project>-product
git worktree remove ../<project>-tech
git worktree remove ../<project>-test
git worktree remove ../<project>-risk
git worktree remove ../<project>-dev
```
