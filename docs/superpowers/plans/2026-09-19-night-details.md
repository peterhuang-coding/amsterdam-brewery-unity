# 夜探细节实施计划

> 基于已获授权的 `2026-09-19-night-details-design.md`。Coding Plan 提供有限上下文的分析、测试/代码草稿和审查，主代理应用、运行、修正与验收。没有为消耗额度而重复调用。

## 验收入口与工作区

基线 c7b4a27，codex/night-details，现有隔离 three-day-slice worktree；工作台 codex/product-research-nightshift 只保存执行记录。默认 HTTP 18767，Node 无需依赖安装。

## 执行清单

- [x] 读取源码/主线/最新 Notion，确认63项基线通过、公开仓库可将必要代码送入套餐。
- [x] 设计取舍与迁移边界自检，记录当前用户对本轮自主细化的授权。
- [x] 写回工作台与 Notion 当前执行范围。
- [x] P1：先在 test-district-core.js 写物理规则、工具交互、旧局和恢复失败测试；运行见到预期失败，再改 backstage-core.js。
- [x] P2：在 test-district-auto.js 写三种街况/工具的组合路径测试；修改 backstage-auto.js 新入口/目标、背包指定放下、实际取物和防卡路。保留所有旧选择。
- [x] P3：在 test-district-daynight.js 写永久修泵/记录上限/重复结算/旧存档回归；修改 reopening-core.js 日间线索、跨夜发现及最近三趟记录。
- [x] P4：backstage-scene.js 绘制与物理同源的带面、控制台、水区、阀门；backstage-ui.js 展示可观察状态、修泵与背包选择；reopening-ui.js 显示线索和夜探记录。按需要少量补 CSS，更新 index.html 缓存键。
- [x] P5：先规格审查，再代码质量审查；复现并修复确凿问题。全量 Node、改动 JS 语法、实际暂存 diff 检查；浏览器真实昼夜链/三种处理/暂停刷新/390px/旧v3。
- [x] P6：README/本计划写真实验证，分阶段 commit，push 玩法分支；工作台仅同步文档并 push，Notion 待验收，Hub 证据与可复用方法写回。

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

## 2026-09-19 实际验收

- 新增核心/自动/昼夜三组测试先 RED；核心首轮16条失败、自动6条失败、昼夜5条失败均为缺失新行为。后续修正入口不在区域、零件不在输送带及旧 visited 类型校验，3条先红后绿。钩子被货物截住和修泵途中放下零件，2条先红后绿。
- 最终 `node --test tools/prototype/test-*.js`：97/97通过，`/tmp/amsterdam-details-final.log`。11份改动/新增JS语法通过；HTTP入口、8脚本、2样式共11份与本地字节相同，缓存键20260919-night-details-r1。
- 规格审查：36组新机制完整行进/撤离、36组真实基线v3存档轨迹比较通过。质量审查：满包四类目标不消失、不谎报成功；修泵后安全/轻装/获救的持久状态与收入/记录恢复通过。补齐结算的真实到访路线和机关动作明细。
- 隔离 Playwright：骑车去Chen实验室获得免费灌溉线索→开店/提前收店→分拣场停带、反转、钩取→温室关阀、消耗一件零件修泵、取酒花→安全撤离→景点手册/晨报→第二夜仍有干路。营业报告保持打烊快照；另走泡沫与直接取货，实际指定放下货物。
- 暂停与刷新：反转后的整趟状态相同；手动工具场景以pagehide实际保存值与恢复值逐字段相等。背包弹窗暂停，Esc不丢货；键盘J/E停带、关阀与点击修泵实测。
- 由c7b4a27真实模块生成的v3行进存档在浏览器继续拿箱、安全撤离；第2夜启用v4。未操作用户浏览器或清除用户存档。
- 390px：分拣场8选项、温室4选项均可操作且边界31–344px；日记/晨报和桌面结算截图已视觉检查，控制台0错误/警告。截图位于忽略目录output/playwright/night-details-*.png；脚本在/tmp/night-details-*.js。

Coding Plan实际承担10包、12次请求，其中11次返回草稿、1次规格审查180秒超时结果未知，未重复发送。已知返回原生用量110729 tokens；套餐剩余额度与5小时窗口不可用，不声称用满。代码/界面/文档及审查合格部分采纳；错误断言、状态快照比较等经源码与真实测试纠正。未知请求保留，未转按量服务。逐包review.json与汇总在/tmp/amsterdam-coding-plan-20260919/，公开仓库不含凭据或模型调用结果。

仍待人工判断：花一件可卖钱的零件修出以后每晚的干路，是否让你想改变路线、再跑一晚。功能通过不代表趣味研究完成。

## 交付回链

玩法7e1ba837e5298615e0f192d0f5ff55aa33384bb4已提交推送，远端SHA核对一致。工作台0c2c958仅同步主线和轮次记录并已push；Notion R01与主页回填后读回，R01为待验收，两处数据库块保留。[查看本轮结果](https://app.notion.com/p/3db3285284df81e683bac3a0cb9140d5)。未自动合并分支、启动其他候选或新增调度。最终暂存检查包含3份新增测试文件。
