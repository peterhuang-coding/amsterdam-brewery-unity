# 夜探细节实施计划

> 基于已获授权的 `2026-09-19-night-details-design.md`。Coding Plan 提供有限上下文的分析、测试/代码草稿和审查，主代理应用、运行、修正与验收。没有为消耗额度而重复调用。

## 验收入口与工作区

基线 c7b4a27，codex/night-details，现有隔离 three-day-slice worktree；工作台 codex/product-research-nightshift 只保存执行记录。默认 HTTP 18767，Node 无需依赖安装。

## 执行清单

- [x] 读取源码/主线/最新 Notion，确认63项基线通过、公开仓库可将必要代码送入套餐。
- [x] 设计取舍与迁移边界自检，记录当前用户对本轮自主细化的授权。
- [ ] 写回工作台与 Notion 当前执行范围。
- [ ] P1：先在 test-district-details.js 写物理规则、工具交互、旧局和恢复失败测试；运行见到预期失败，再改 backstage-core.js。
- [ ] P2：在 test-district-auto.js 写三种街况/工具的组合路径测试；修改 backstage-auto.js 新入口/目标、背包指定放下、实际取物和防卡路。保留所有旧选择。
- [ ] P3：在 test-district-daynight.js 写永久修泵/记录上限/重复结算/旧存档回归；修改 reopening-core.js 日间线索、跨夜发现及最近三趟记录。
- [ ] P4：backstage-scene.js 绘制与物理同源的带面、控制台、水区、阀门；backstage-ui.js 展示可观察状态、修泵与背包选择；reopening-ui.js 显示线索和夜探记录。按需要少量补 CSS，更新 index.html 缓存键。
- [ ] P5：先规格审查，再代码质量审查；复现并修复确凿问题。全量 Node、改动 JS 语法、实际暂存 diff 检查；浏览器真实昼夜链/三种处理/暂停刷新/390px/旧v3。
- [ ] P6：README/本计划写真实验证，分阶段 commit，push 玩法分支；工作台仅同步文档并 push，Notion 待验收，Hub 证据与可复用方法写回。

## 实现约束

### P1 核心

- `locations(r)` 放宽为版本 >=3，新增 `districtInfo(r)` 的 v4 检查；create 产生 v4/district，restore 接受1..4，旧3不添加district。
- 带推力与灌溉在 B.step 的子步计算，移动调用 move；世界物品才受到带作用，包内/已交付物品保持状态。
- 命令 `repair` 只在阀门旁有效；互动 E 与钩目标共用控制器/阀门位置。记录新 outcomes 和 pump 发现，但收益只在实际 returnExplore 入账。
- `drop` 的 aim 可携带 itemId；缺省保持原来的末件行为。未知/不在包中的ID不更改状态。
- v4普通物资近身 E/自动取物需视线；现有parcel与旧版规则保持。

### P2 自动器

- 新目标使用事件 sorting/garden，不无限添加弹窗。目标坐标来自 districtInfo 和实际 item；取货目标已完成时回当地事件。
- 分拣场入口改在安全入口，仅v4使用；旧目标继续原坐标。停带/反转后仍由用户选取货或离开。
- 拾取前检查背包容量：放下指定种类后继续原有月雾容量流程；普通物资不够时保留物品并回当地选择，明确说明。
- 新目标与模式在旧run自动存档中拒绝，new GOALS 与 visited 校验同步。

### P3 经营层

- backstage 增加 `journal: []`，仅 restore 缺字段时补；每趟结算保存 day/status/cups/hops/cash/outcomes/visited，最多3条，严格值域。
- 更新 discovery 白名单、morning最大条数保持界面可读；新增线索 greenhouse，由白天实验室免费获得。
- 旧字段/金额/报告快照/探险次数约束不放宽。

## 命令与证据

开发阶段：`node --test tools/prototype/test-district-*.js`；既有回归：`node --test tools/prototype/test-*.js`。后者基线63条通过，日志 `/tmp/amsterdam-detail-baseline-20260919.log`。

草稿与套餐调用证据在 `/tmp/amsterdam-coding-plan-20260919/`，不推公开仓库。首轮 design-audit：建议部分采纳，3条具体bug断言被源码核对否定，review.json 已记录，未据此修改代码。

后续在此记录红/绿、实际浏览器证据与交付提交；未运行不写通过。
