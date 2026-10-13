## PLAY04已单路提交：街景材质与路线可读性

2026-10-13T03:27:24Z，amsterdam-street-atmosphere-20261013已提交，worker PID25035，实际init为Seed Evolving / Read/Edit/Bash / dontAsk，请求enabled/high，状态running。提交前即时全机账本/CLI均0路，本项1路，无原子全局保证；原ID此前不存在，未重复提交。Notion PLAY04执行中。

沿用已push eece422精确合同，6公开输入73182B/哈希不变，基线6e4f7b3；仅城市scene和新scene行为测试，1200秒36轮。父级选择的429后30分钟冷却已过，但尚不宣称服务完全恢复。等待原结果后独立范围/红绿/旧358+新增全量/桌面390px日夜画面/近景全城点击/桥边回店验收。业务已提交1，修正0/1；若失败仅一次定向修正，仍失败搁置。

PLAY03已耗尽修正并搁置，不复活、不采用其候选。当前试玩6e4f7b3/18833和旧档未变，当前包没有新交付。首次整体review05:48:33Z、四天截止2026-10-16T19:48:33Z、现有15分钟心跳不变。证据docs/product-research/2026-10-13-four-day-demo/street-atmosphere；原包/tmp/amsterdam-street-atmosphere-20261013/handoff.json与稳定同ID账本。以下为历史。

# PLAY04：街景材质、光影与路线可读性（准备未提交）

批准来自D23四天网页demo美术/可用性范围，以及D24每项一次修正政策。独立于已搁置PLAY03：从已采用6e4f7b3fbb7ad7eca5d3b30b474f61d7437059c7开始，只改城市场景绘制和一份新行为测试；不采用首杯候选、UI/CSS、不改经济和存档。Notion：https://app.notion.com/p/3f83285284df8121862cd2feb6f3a7a5 。

任务amsterdam-street-atmosphere-20261013；logical play04-street-atmosphere；业务0已提交、修正0/1。固定Seed Evolving enabled/high，1200秒36轮，单路。输入6文件73182B；场景、City、FlowerNetwork和旧city测试均与采用提交一致，brief和空新测试另列。精确暂存city内置13断言通过（node:test外层1/1），scene语法通过，dry-run有效；空新测试不当通过。父级全仓旧358留待收取候选再复验。

## 设计选择与边界

选择保留现有2.6x街景和2.5D建筑，用有限的石岸/砖路纹理、水面明暗、桥面边缘深度、建筑光照建立一致插画感；重点酒馆门、主角和通往Lotte的路线。仅继续改缩放不能解决平涂质感；换背景图会带来碰撞和点击映射风险，均不采用。新增细节不得挤压动线、假装新的交互点或靠密集纹理制造丰富度。减少动态偏好下城市固定状态不随时间改变。

只写reopening-scene.js的城市方法及新test-street-atmosphere.js。City碰撞、相机计算和逆映射、共享工具函数、所有非城市渲染、UI、经济与存档只读。完整接口/执行步骤/精确命令见[brief](brief.md)及[交接包](handoff.json)。预检见[preflight](preflight.json)，输入[哈希](input-hashes.json)。

## 父级采用门槛

范围和输入校验；新减少动态行为回归真实红绿、旧测试不减；全仓旧358+新增；自然新局桌面/390px，酒馆→桥边→返回，近景/全城坐标点击，白天/夜间和减少动态画面对比。看起来更清楚和好玩是独立判断，测试绿灯不替代。任一完整验收未通过不采用；本项最多一次定向修正，仍失败搁置。通过才commit/push独立codex/art-pass-20261013并建立新服务，保留18833及旧档。

## 冷却与派发

前项429后父级冷却至2026-10-13T03:22:28Z；不是服务端Retry-After或恢复保证。现有amsterdam心跳到时重新读取Notion、Git、全机CC在途，容量允许且无原ID账本才提交一次；提交前Notion设执行中并更新主线。没有新后台调度器。当前任务仅准备，不是在途/新交付。四天截止和05:48:33Z首次整体review不变。
