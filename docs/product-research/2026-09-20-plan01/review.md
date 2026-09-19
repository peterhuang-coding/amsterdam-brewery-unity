# PLAN01 验收记录：草稿保留，停止修订

2026-09-20。用户本轮只批准需求、任务与验收文档；要求只用 Coding Plan，失败即停。两次套餐调用正常返回，但内容验收未通过。因此没有追加修稿请求、切换模型/平台，也没有由主代理接管重写方案。

## 产物与状态

- [需求原稿](requirements-draft.md)：六个需求类别，现状、候选增量、范围外、三个方向比较与待决策问题。
- [任务与验收原稿](tasks-acceptance-draft.md)：T01–T10，共45个 Given/When/Then 场景、依赖、并行组及阶段门槛。
- [派发与验收数据](dispatch-review.json)：本轮真实请求、并发、结构检查及拒收原因。

两份文档仅保留为待审草稿，**不是通过验收的实施规格**。版本化副本只添加拒收标识、清理行尾空格；没有代替套餐修改实质内容。精确原始响应保存在本机 `/tmp/amsterdam-plan01-20260920/batch-01/jobs/`。

## 已通过的结构检查

- 两份均覆盖 REQ-01 至 REQ-06；10个任务均有需求映射、类型、输入、范围外、交付物、依赖和失败判据。
- 按“依赖”字段核对，任务图无环；“可与某任务并行”不视为依赖边。
- 45条场景覆盖自动/手动、暂停恢复、跨日结算、地图与人物等主题。场景数量只说明结构齐全，不代表每条内容正确。
- 文档区分现有三天 Web 原型、未合入算法成果、候选功能；把人工趣味观察与自动规则验证分开；样本建议未写成已发生的玩家调查。

## 未通过的内容验收

### F1：把尚未实现的夜店后果放进现状核验

任务原稿 T05 第3条要求：等待鼓点或用瓶声引开守卫后，次日反馈应描述对应行动。当前基线实际在**拿起冷藏箱**时记 `club-backstage`，次日显示取箱传闻；“等待/引声本身的次日报告”没有独立记录。

证据：[backstage-core.js 的取箱与引声](https://github.com/peterhuang-coding/amsterdam-brewery-unity/blob/78b13c06a5df7914fbbb4eb404bec6489b7376cb/tools/prototype/backstage-core.js#L179)、[reopening-core.js 的后果映射](https://github.com/peterhuang-coding/amsterdam-brewery-unity/blob/78b13c06a5df7914fbbb4eb404bec6489b7376cb/tools/prototype/reopening-core.js#L260)。

验收要求：现状核验必须按实际触发条件书写；如希望新增等待/引声后果，需要明确标为候选增量并列范围，不能通过错误断言把现有行为判坏。本轮只标注问题，未改写草稿或游戏。

### F2：基线未复现不构成关闭分支故障的证据

需求原稿方向 A 建议，若卡住只出现在 ALG01 而可玩基线不可复现，应关闭技术线索。这会丢失已经保留的独立分支反例。

原记录为 seed 6/day 1/hook，`club → take-hook → garden`，状态仍 active、事件 stuck。它来自 ALG01 独立分支；本轮没有在可玩版复测，所以既不能声称可玩页面必现，也不能宣告该问题消失。证据是 `/tmp/amsterdam-algorithms-4h-20260919/batch-07/routes-24.json`，汇总24例中1例失败；这是历史实验记录，不是本轮新测。

验收要求：保留分支、输入与未解决状态；未复现只能缩小证据适用范围。没有关闭条件验证就不能关闭故障。本轮不执行复现或修复。

### F3：人物关系与经营效果的事实需要分开

需求原稿 REQ-04 把 Lotte 收花、留酒承诺与耐心/小费效果并在一句现状描述中，容易误认为送花直接改善经营参数。当前送 Lotte 花增加关系点；摆窗台的花增加耐心；兑现留酒承诺形成次日音乐效果，才影响耐心和小费。

证据：[flowerUse](https://github.com/peterhuang-coding/amsterdam-brewery-unity/blob/78b13c06a5df7914fbbb4eb404bec6489b7376cb/tools/prototype/reopening-core.js#L302)、[顾客耐心](https://github.com/peterhuang-coding/amsterdam-brewery-unity/blob/78b13c06a5df7914fbbb4eb404bec6489b7376cb/tools/prototype/reopening-core.js#L136)、[次日音乐](https://github.com/peterhuang-coding/amsterdam-brewery-unity/blob/78b13c06a5df7914fbbb4eb404bec6489b7376cb/tools/prototype/reopening-core.js#L204)。

### F4：主代理提供的背景存在一个动作名错误

背景及需求原稿写了 `explore_return`，实际动作名是 [`returnExplore`](https://github.com/peterhuang-coding/amsterdam-brewery-unity/blob/78b13c06a5df7914fbbb4eb404bec6489b7376cb/tools/prototype/reopening-core.js#L245)。这是主代理在组织背景时引入的错误，不能归咎于下游。一次性结算的产品语义仍有源码依据；未来若重新授权修订，应先纠正背景再派发。

## 实际执行边界

本轮可委派文档包2项，`volcengine-plan / doubao-seed-evolving` 实际调用2次，峰值并发2，均返回 verifying；内容验收通过的完整文档为0份，保留原稿2份。已返回原生用量合计36,142 tokens，不代表现金、额度余额或节省比例。无重试、无修正请求、无其他模型/平台接管、无按量调用。

主代理只做背景、派发、结构/源码事实核对、拒收记录和文档归档。没有运行新的游戏测试或浏览器玩法验证。当前可玩目录55份文件、暂停的算法目录69份文件的前后 SHA-256 集合相同；已有未提交文件原样保留。

旧 ALG01 线程已 idle，状态 `paused_by_user_scope`；有限续跑 `amsterdam-2` 已 PAUSED。已提交 `e740f71` / `c764eb0` 不回滚、不合入当前试玩；其他候选没有新实现许可。

唯一下一步：由用户决定是否另行允许 Coding Plan 针对以上验收问题修订；当前不自动重试，也不进入实现。
