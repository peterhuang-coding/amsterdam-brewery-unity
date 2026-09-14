# 工作台搭建交付

日期：2026-09-15。用户授权：留下几个产品方向调研待办，接入 Notion，关联 Git 并 push，后续白天定方向、夜间执行。

## 范围与结果

- 基线：`407697b`；工作台分支：`codex/product-research-nightshift`。
- 新建 [研究目录](../../../docs/product-research/README.md)、[夜班流程](../../../docs/product-research/nightshift.md) 与 [执行主线](../mainline.md)；更新 README 和两个设计入口，区分候选与授权。
- [Notion 工作台](https://app.notion.com/p/3db3285284df81038056e2dfe875e700) 和 [队列](https://app.notion.com/p/f73277914eef4344a853d7de3ffa2b92) 已创建，7 项产品调研 + E01 修复候选，全部初始未批准。没有启动其中任一项。
- 22:00（Asia/Shanghai）每日 heartbeat 已创建，名称「Amsterdam 夜班执行」，ID `amsterdam`，ACTIVE；没有用户回复具体时间时采用已说明的默认值。没有运行夜班任务来假装验证完整执行链。

## 验证与边界

- Notion 的实际视图查询返回 8 条完整记录，无下一页，均为待决策 / 未批准；抽读 R01 内容，阶段、验收、双向链接均存在。
- 仓库检查 8 个唯一任务 ID、相对文件链接和主线字数；提交前检查全部新文件与实际暂存 diff。游戏代码无变化，不重跑无关游戏测试。
- 当前工作台的 Git 提交以本文件所属提交为准；push 后核对远端分支哈希，提交链接回填 Notion 首页。尚未发生的后续夜班研究、原型实现或玩家反馈不计入本次验证。
- 已有 407697b 与 fe36319 两条玩法分支未合并；E01 的两个 bug 仍待修复。

## 下一步

由用户在白天批准一个任务阶段；建议先选 R01 的「仅调研」，该建议本身不构成批准。
