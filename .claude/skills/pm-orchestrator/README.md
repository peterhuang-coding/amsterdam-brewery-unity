# PM 总控工作流说明

这套 `.claude` 配置用于把领导指示或模糊需求，变成可执行的多 Agent 工作方案。它适合产品经理使用：你只需要贴需求，总控 Agent 会判断要不要看代码、要不要改代码、要不要并发、要不要创建 git worktree，并生成子 Agent 提示词和验收方式。

## 什么时候用 `/leader-task`

当你拿到一段领导指示、产品想法、Bug 描述或交付要求，还没有拆成研发任务时使用。它会输出需求理解、路由计划、worktree 命令、子 Agent 提示词、汇总方式和风险提醒。

## 什么时候用 `/pm-route`

当你只想“先拆活”，还不想执行、也不想改代码时使用。它只做任务分类和 Agent 路由，不创建文件、不改代码。

## 什么时候用 `/pm-worktrees`

当你已经决定要多个 Claude Code session 并行分析或隔离实现时使用。它会生成 checkpoint、worktree、启动 Claude、查看 diff、commit、merge 和清理命令。

## 什么时候用 `/pm-review`

当你已经收集到 Product / Tech / Test / Dev / Review / Doc / Risk 等子 Agent 输出后使用。它会做总控交叉复核，判断通过、不通过或有条件通过。

## 怎么和 git worktree 配合

推荐先在主仓库确认 `git status`，必要时做 checkpoint commit。分析 Agent 可以放到不同 worktree 里并发看代码；Dev Agent 默认只在一个 dev worktree 里单点实现；实现后再让 Review / Test / Doc 并发验收。不要让多个 Dev Agent 同时改同一批文件。

## 推荐工作流

1. `/leader-task` 贴领导指示。
2. 按输出创建 worktree。
3. 分别启动子 Claude。
4. 收集子 Agent 输出。
5. Dev Agent 单点实现。
6. Review / Test / Doc 并发验收。
7. 总控交叉复核。

## 常见注意事项

- 不要多个 Agent 在同一个目录里改代码。
- 不要让分析 Agent 改代码。
- 不要跳过 checkpoint。
- 不要让 AI 修改密钥、环境变量或生产配置。
- 小任务不要强行并发。
- 不要把未验证的猜测写成事实。

## 快速测试示例

```text
/leader-task 领导让我把某个功能需求拆成研发可执行方案，并给出风险和验收标准
```
