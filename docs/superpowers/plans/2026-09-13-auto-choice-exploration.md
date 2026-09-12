# 自动探索与关键选择 Implementation Plan

**Goal:** 将城市背面默认入口改为自动行走/处理常规动作、在关键情境暂停等玩家选择，同时保留随时切换手动的操作方式。

**Architecture:** BackstageAuto 在现有 Backstage 模拟上产生移动和工具指令；寻路使用真实墙体，不直接更改坐标、奖励或剧情结果。决策、目的地和播放倍速保存在当前 run；临时路径不入存档。BackstageUI 展示情境、行动选项和播放控制，复用原有结算。

**Tech Stack:** 无新增依赖，原生 JavaScript、Canvas、CSS、Node 行为测试、Playwright CLI。

用户原话“我想要一个自动播放那种选择方式”。已异步询问三种解释；在可选澄清未回复时按首选“自动探索、关键事件暂停选择”实施，保留手动切换便于调整。当前授权只涉及探险操作方式。

- [x] 核对当前 worktree/存档/绘制与输入；复用首个切片规则。
- [x] 先写 `test-backstage-auto.js`：默认入口、等待选择时全世界冻结、真实走路拿包/交付/温室撤离、不同选择后果、容量不足、手动切换、保存恢复及非法状态拒绝。运行看到缺失自动模式的失败。
- [x] 新增 `backstage-auto.js`：`enable(run)`、`disable(run)`、`choose(run,id)`、`step(run,seconds)`、`view(run)`、`valid(run)`。事件枚举与合法选项统一由 view 产生；禁止无提示时执行 choice。寻路节点检查玩家半径与线段，不穿墙，无法继续时暂停给出撤回/改路线。
- [x] `reopening-core.js` 默认 explore 启用自动模式，显式 manual 保留旧玩法；旧 run 缺少 auto 字段保持兼容，新增状态验证拒绝非法目的地/倍速/选项状态。
- [x] 接入 `backstage-ui.js`、`index.html`、`reopening-ui.js`：自动/手动切换，1×/2×，大幅情境选择区，暂停提示。自动模式不接受手动移动/工具，选择时冻结世界和时间，弹窗/后台也暂停；结束复用原结果页。地图下方就能看到选择，移动端无需先滚过手动控制。
- [x] 样式沿用运河蓝 #2c4350、路灯米 #ddc297、霓虹粉 #c9a7bc 和薄荷 #b8d5bb；行动按钮采用完整动词、风险/占位说明。进行中显示目的地和自动行为，选择中明确“时间暂停”。
- [x] 运行新测试与现有16探险+40经营+13城市检查；浏览器实际点击走通至少一个完整自动分支，验证关键选择冻结、刷新、390px布局和手动切换。
- [x] README 和本计划写回实际证据；提交本地分支，更新 Hub，提供试玩入口。耐玩性仍待用户反馈。


## 实际验证与修正

- 新入口测试先因 auto 缺失失败，然后实现。完整路线暴露未归一化移动方向导致过桥抖动，归一化后通过。
- 独立审查发现自动模式拦截 P/H/Escape；新增测试先失败，限制输入消费范围后通过并复核。
- 浏览器发现交还箱子后仍显示夜店取箱选项；新增测试先失败，再按任务状态生成选项，失效目标暂停重选，不暗中转去别处。重复拜访 Noor 的旧对白也增加先失败回归并修正。
- `node --test tools/prototype/test-backstage-auto.js tools/prototype/test-backstage.js tools/prototype/test-reopening.js tools/prototype/test-city.js`：9＋16＋40＋13＝78 项行为检查通过（TAP为4文件）；所有变更JS语法检查及diff空白检查通过。
- 浏览器独立会话 `auto-choice-check`，实际点击去夜店→泡沫拿箱→Noor交还→手动拉杆→进入温室→切手动/自动→再访Noor/温室→屋顶撤回。6杯艾尔、1酒花、€19，回店cash64、ale12、trips1、resolution returned。
- 2×播放、选择冻结、行进中P暂停、刷新恢复同一待选事件通过；390px文档宽390，选项328×76px；控制台0错误/警告。截图位于忽略的 `output/playwright/auto-choice-{desktop,mobile,greenhouse,result}.png`。
- HTTP服务在本轮恢复，使用独立进程提供18767端口。未重置用户原file页存档；新代码保持相对脚本加载，本轮未再次验证直接file入口。未运行旧Phase E、Unity或CI。
- 探险玩法整体趣味仍待用户试玩。本轮解释为自动进行/关键处暂停选择；未收到异步偏好题的选择，不把默认解释写成用户逐项确认。
