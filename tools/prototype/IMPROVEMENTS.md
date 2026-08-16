# Funify 24h — Improvements Log

Web Demo 6 小游戏「手感/反馈/选择」三维优化轨迹。每轮 1 game = 1 commit。

## 三维评分（1-5）

| 游戏 | 手感 | 反馈 | 选择 | 缺口 |
|---|---:|---:|---:|---|
| 酿酒 brewery | 4 | 5 | 5 | 已闭环 → Round8 反馈/选择+1 |
| 酒吧 bar | 4 | 5 | 5 | 已闭环 (Round6 反馈+1) |
| 咖啡 coffee | 4 | 5 | 5 | 已闭环 (Round7 反馈+1) |
| SmartShop | 4 | 5 | 4 | 已闭环 (Round3 反馈+1) |
| 冲浪 surf | 4 | 5 | 5 | 已闭环 (Round4 选择+1) |
| 学术 academic | 4 | 4 | 5 | 已闭环 (Round1+5) |

> 全 6 游戏均已达手感/反馈/选择三维 ≥4，远超验收标准 #3 的「≥3 游戏」门槛。

## Round 1 — academic peer review (Balatro-style blind bet)

- commit: `funify(academic): peer review + key router fix test=19/19`
- 改动: `tools/prototype/index.html` startAcad + acadIn + key router
- 机制: 投稿 SPACE 提交前可按 R 付 $5 揭示协同加成+主题质量分布;不付则保持盲投
- 3-axis lift: 手感 2→3 (中转评审状态) / 反馈 3→4 (选题阶段显示★质量, 付费后显示完整分项) / 选择 4→5 (R 付 $5 vs 直接盲投)
- 关联 bug: 主键路由缺 `academic` 分支 — `acadIn` 函数定义但 keydown handler 从未调用,导致学术投稿手工 1-5 选主题完全失效。本轮一并修复。
- 测试: 19/19 PASS (契约未动, IND_DEF×5、EV_POOL ID 唯一、startXxx 函数名、auto-run 100s 必达 ended)
- 风险: auto-run 不按 R,预期路径不变;新加 reviewed 标志位,不会污染 G.state
- 验证: 浏览器 smoke test — 选 2 个主题后按 R,状态从 "📚 写论文" 切换为 "📝 同行评审 -$5",金额 220→215 (-$5),显示完整分项
- 验收: 测试浏览器 http://127.0.0.1:18765/tools/prototype/index.html,进入学术投稿,选 2 个主题后按 R 看评分拆分

## Round 7 — coffee 热度命中区 + 顾客报价命中预览 (Balatro score zones)

- commit: `funify(coffee): heat zone overlay + customer fit hint test=50/50`
- 改动: `tools/prototype/index.html` 新增 `coffeeHeatZone`+`coffeeFitHint`+`coffeeDangerLeft` 纯函数 + drawMG coffee 段叠 3 区段热度条 + 报价命中色; `test.html` 加 12 条断言;AB_TEST 暴露新函数
- 机制:
  1. **3 区段热度条** (抄 Balatro score zones): 0-40 绿 / 40-70 黄 / 70-100 红,段间白色刻度线;颜色取自新 `coffeeHeatZone(ht)` 函数 + 当前热度叠加填充 + 文字 `安全/警戒/危险/末日`
  2. **顾客报价命中色** (Balatro 选牌颜色): 取代旧二态 "成交/拒客",新增 `coffeeFitHint(pr, cMax)` 返回 ✓成交(绿, gap≥0) / !偏高(黄, -3..-1) / ✗拒(红, ≤-4) / 无客(灰)
  3. **距离危险倒数**: `coffeeDangerLeft(ht)` 返回距下一危险阈值 (40/70/100) 的距离百分比 — `安全 +10%→40 警戒 +20%→70 危险 +15%→末日`
- 3-axis lift: 手感 4→4 (节奏不变) / 反馈 4→5 (热度分段 + 报价色 + 距离倒数) / 选择 5→5 (已满)
- 测试: **50/50 PASS** (基线 38 + 12 新 coffee 断言: 4×heatZone + 4×fitHint + 4×dangerLeft)
- 风险: 纯函数无副作用,仅替换 drawMG 中两个标签字符串 + 加热度底色叠加层;`coffee` mg 的自动运行路径不动 (autoStep 仍按 s.c.max-1 报价 → 自然命中绿色区)
- 验收: 进咖啡店看 HUD "热度条" 三色分段 + 当前热度叠加,调整 Q/W 看下方 "✓成交 / !偏高 / ✗拒" 文字颜色随 pr 实时变化;热量涨到 ≥70% 看红色段与 "距离末日 X%" 文字

## Round 2 — brewery streak (Balatro-style consecutive hit)

- commit: `funify(brewery): streak multiplier & live quality preview test=23/23`
- 改动: `tools/prototype/index.html` `finBrew`+`brewStreakMul`+`drawMG`(brew 段温度条) + `tools/prototype/test.html` 加 4 条
- 机制:
  1. **连续命中倍率**(抄 Balatro joker 叠加): 失败重置 streak；连击 ≥3 时 +10%/级,封顶 1.5×。状态栏 + drawMG 右下都画 🔥×N 徽章。
  2. **实时质量预览** (补反馈缺口): 调温时画绿±5° 黄±12° 区段叠加 (Balatro 选牌命中区)+ 白色目标刻度线 + 实时「预估: ★完美/好/一般」文字。玩家未提交就知道 ★ 等级。
  3. **温控手感**: ±3° → 步进更稳; 温度刻度文本写明「绿±5°黄±12°」物理范围。
- 3-axis lift: 手感 3→4 (温度叠加层 + 实时预测) / 反馈 3→4 (徽章 + 绿色命中区) / 选择 3→4 (节奏选择 — 现在能故意堆连击 vs 保守提交)
- 测试: **23/23 PASS** (基线 19 + 4 新 streak 断言)
- 风险: streak 不持久(G.brewStreak 仅本 run)，跨新局重置 — 与旧版 G.state 结构兼容；`finBrew` 失败分支加 `G.brewStreak=0` 不影响其他游戏
- 验收: 浏览器连酿 5 次（成功失败各 1）观察 🔥×N 徽章变化与 1.3x 倍率

## Round 3 — SmartShop 实时反馈层 (Balatro 命中区 + Mini Metro 笔记路线)

- commit: `funify(smartshop): real-time optimal-range overlay + ★ quality predictor test=25/25`
- 改动: `tools/prototype/index.html` `shroomQuality` + `drawMG`(shroom 三表盘 + 底部预测条) + `tools/prototype/test.html` 加 2 条
- 机制:
  1. **命中区叠加** (抄 Balatro 选牌绿黄命中区): 已知笔记时,每个参数表盘画绿色±tBand 弧 + 黄色±yBand 弧 + 白色目标刻度线。指针移到哪一目了然
  2. **实时 ★ 预测条** (补反馈缺口#1): 调参时实时 `shroomQuality(err)`,右下方显示 5 级填充预测条 — 玩家未提交就知道下次 ★ 等级
  3. **参数-目标差值染色**: "70% → 70% (命中)" 绿 / "(近)" 黄 / "(偏)" 红 (Balatro score color)
  4. **笔记持久化** (抄 Mini Metro 已发现路线跨局): `G.strainNotes` 不被 `newRun` 清,跨 run 仍能命中已知菌株参数
- 3-axis lift: 手感 3→4 (染料即时反馈) / 反馈 3→5 (命中区+目标线+预测条+色彩) / 选择 4→4 (新增策略: 先调整后看 ★)
- 测试: **25/25 PASS** (基线 23 + 2 新 shroom 断言)
- 风险: drawMG 画弧时 std arc 跨 0/12 点需负向 angle, 函数无副作用; `shroomQuality` 是纯函数,与污染判定独立
- 验收: 浏览器进入 SmartShop,首次种植看「? → ?」灰色目标; 调参看预测条实时变化; 收获一次后第二次显示「📓笔记已知」+ 绿黄弧 + 目标刻度线

## Round 4 — surf 浪报预承诺 (Balatro 盲注式 ×1.5 押注)

- commit: `funify(surf): tide forecast pre-commit ×1.5 mul test=28/28`
- 改动: `tools/prototype/index.html` `pickWavePoint`+`commitSurfBrief`+`surfBriefIn`+`finSurf.mul`+draw+key router+autoStep+`AB_TEST.mg`; `test.html` 加 3 条
- 机制:
  1. **预承诺盲注** (抄 Balatro 盲注式选择): 选浪点后不再直接进入冲浪,显示 3 张「风/水温/洋流」报卡,值均显示 ❓
  2. **F 揭示**: 支付 $5 后 3 张全显 + 终局倍率 ×1.5 (Balatro 揭示信息优势)
  3. **SPACE / X 盲出**: 保持 ❓ 出航,倍率 ×1 (mini metro "unexplored route" 快路径)
  4. **状态机**: 新增 `mg='surfBrief'` 子状态,key router/autoStep/draw 都接入
  5. **t.mg 暴露**: AB_TEST 新增 `mg: MG` 字段,便于测试访问
- 3-axis lift: 手感 4→4 (节奏不变) / 反馈 5→5 (UI 已强) / 选择 4→5 (3 路径抉择: 付$5揭示/盲出/老派X)
- 测试: **28/28 PASS** (基线 25 + 3 新 surfBrief 断言)
- 风险: autoStep 在 surfBrief 时直接 commitSurfBrief() 出航,不影响自动跑通;`finSurf.mul=1` 时不出现 "(×1.5浪报)" 后缀,默认 user 走 blind
- 验收: 进入冲浪,选 1 号浪点 → 看见 3 张 ❓ 报卡 → 按 F 揭示 → 按 SPACE 出航 → 结算信息含 "(×1.5浪报)"

## Round 5 — academic 投稿会议预承诺 (4 会议 × 不同门槛/倍率)

- commit: `funify(academic): venue pre-commit 4 venues ×1.0–1.8 mul test=31/31`
- 改动: `tools/prototype/index.html` `startAcad`+`commitAcad`(抽出)+`acadIn`(venuePick)+`drawMG`+`autoStep`; `test.html` 加 3 条
- 机制:
  1. **4 会议选择** (Balatro 多难度盲注): 进入学术首屏先按 1-4 选投稿会议
     - 本地研讨 (需30分 · ×0.6) — 稳赚
     - ICML投稿 (需50分 · ×1.0) — 主流
     - NeurIPS投稿 (需65分 · ×1.4) — 难录
     - ACL投稿 (需80分 · ×1.8) — 顶会
  2. **提交结算用 venue 阈值**: sc≥venue.thr 接收，否则拒稿(无默认60 fallback)
  3. **commitAcad 抽出**: 测试可独立触发提交,便于验证
- 3-axis lift: 手感 3→4 (预承诺选择步骤填入空档) / 反馈 4→4 (UI 已强) / 选择 5→5 (已满)
- 测试: **31/31 PASS** (基线 28 + 3 新 academic 断言)
- 风险: autoStep 默认走 NeurIPS (s.venues[2]) — 不破坏 7 天 auto-run;旧 `s.venue==='NeurIPS投稿'?2...` 字符串匹配改为 `s.venue.mul`,向后兼容靠新 venue 对象结构
- 验收: 进入学术,4 行会议卡片清晰显示门槛/倍率;选 ACL 然后很快提交 → 看 `📋 论文被拒` 出现

## Round 6 — bar 实时小费预览 (Balatro 选牌分数预览)

- commit: `funify(bar): live tip preview + patience bar + combo badge test=38/38`
- 改动: `tools/prototype/index.html` 新增纯函数 `barTipPreview`+`barPatienceLeft`,drawMG 酒吧段叠加预估行+耐心秒数; `test.html` 加 7 条
- 机制:
  1. **小费预估预览** (抄 Balatro 选牌时实时显示分数): 调 Q/W 报价时实时算 `~$${offer*tip*drinkMult*(1+regularBonus)}`,按命中/常客/错过给颜色 + 文字标签 (-10% 红 / +20% 绿 / +10% 黄 / +44% 绿)
  2. **耐心倒计时** (补反馈缺口): 顾客头顶已有 5px 微条; HUD 文本再加 `⏱Ns` 秒数显示,玩家无需看头顶小条也能感知剩余时间
  3. **Combo 徽章**: HUD 标题从 `combo×N` 改为 `🔥×N (combo)` 在 combo≥3 时高亮(沿用 brew streak 视觉)
- 3-axis lift: 手感 4→4 (节奏不变) / 反馈 4→5 (预估线+颜色+耐心秒数+combo 徽章) / 选择 5→5 (已满)
- 测试: **38/38 PASS** (基线 31 + 7 新 bar 断言: 4×barTipPreview 公式 + 2×barPatienceLeft 边界 + 1×集成检查)
- 风险: 纯函数无副作用,barTipPreview/PatienceLeft 是新公开 surface 但命名清晰不易冲突;drawMG 文字行从 448→446/460/478 整体下移,无视觉重叠
- 验收: 进入酒吧,看 HUD 第一行出现 `🔥×3 (combo)`,报价条下方 `预估 ~$X · +20% (命中推荐)` 颜色变化,顾客喝想要推荐酒时变绿,错过时变红
## Round 8 — brewery 配方笔记跨局掌握 (Mini Metro 已发现路线)

- commit: `funify(brewery): recipe notes & cross-run mastery test=58/58`
- 改动: `tools/prototype/index.html` 新增纯函数 `brewNoteProgress`+G.brewNotes 状态 + startBrew/finBrew 笔记记录 + drawMG 选原料/控温两阶段叠加 📓/✓掌握 徽章 + AB_TEST 暴露; `test.html` 加 8 条
- 机制:
  1. **配方笔记** (抄 Mini Metro "discovered route" 跨局保留): 每次成功酿造后 `G.brewNotes[type]={temp,recipe,count}++`;不随 `newRun` 清零,与 SmartShop `strainNotes` 同模式
  2. **掌握度 0→3**: 第 1/2 次显示 `📓记忆×N`,第 3 次跨过门槛显示 `✓掌握配方!`(addEvt 'info' 级别 + setStatus 主标题变更)
  3. **HUD/选原料阶段**: 订单卡片下方新增 14px 深底条,颜色: 0/3 隐藏 / 1-2 浅蓝 / 3 绿色 ✓ 掌握
  4. **控温阶段**: 订单小卡 (560,335) 下方 12px 同样笔记条,玩家调温时也能瞄一眼掌握度
  5. **纯函数 `brewNoteProgress(notes,type)`**: 0..3 整数,>3 封顶;空笔记/未知类型返 0,易测试
- 3-axis lift: 手感 4→4 (节奏不变) / 反馈 4→5 (笔记条+✓掌握提示+info 事件) / 选择 4→5 (可故意堆连击已掌握配方 vs 探索新类型)
- 测试: **58/58 PASS** (基线 50 + 8 新 brewery 断言: 5×brewNoteProgress 边界 + 1×finBrew 自增 + 1×newRun 保留 + 1×掌握门槛)
- 风险: 纯函数无副作用;G.brewNotes 与 strainNotes 同模式,不写 localStorage (跨页保留靠内存),不会污染 ab_meta_v2 v2 存档;drawMG 仅在 _np>0 时画 14px/12px 小条,不抢视觉
- 验收: 进入酿酒,首次看订单无笔记条;成功一次后回选原料阶段看见 `📓IPA 记忆 ×1/3`;连成 3 次后看到 `✓ 掌握 IPA 配方!` 状态标题;新 run 后重选 IPA 仍有笔记条

## Round 9 — 全局可访问性 (ARIA dialog + 自动聚焦 + prefers-reduced-motion)

> funify-24h-v2 第 1 轮，BACKLOG #4 可访问性 收尾。基线 58/58 → 63/63。

- commit: `polish(a11y): modal ARIA + autofocus + reduced-motion test=63/63`
- 改动: `tools/prototype/index.html` start-modal/help-modal 加 `role="dialog" aria-modal="true" aria-labelledby="...-title"` + h1 加 id + seed input 加 `autofocus aria-label` + 新增 `@media (prefers-reduced-motion: reduce)` 规则关闭 `.btn.go` 与 `.evt` 动画; `tools/prototype/test.html` 加 5 条; `tools/prototype/BACKLOG.md` 标记 #4 完成
- 机制:
  1. **ARIA dialog 角色**: 两个模态 `<div>` 升级到 `role="dialog" aria-modal="true"`;h1 加 id 后 `aria-labelledby` 绑定,屏幕阅读器能直接朗读标题
  2. **自动聚焦 seed input**: `<input autofocus aria-label="Seed 输入框">` — 首屏键盘用户按 Enter 立即开跑,无需先 Tab 到输入框
  3. **prefers-reduced-motion 媒体查询**: 关闭 `.btn.go` 红色脉冲 + `.evt` 滑入动画 + 全局 `transition-duration:.01ms`,对前庭/光敏玩家友好
  4. **测试可验证**: CSS 规则用 `doc.styleSheets` 枚举 + `r.type===4` + `mediaText.includes('prefers-reduced-motion')` + `cssText.includes('.btn.go')` 命中 — 与现有契约测试同栈
- 3-axis lift: 反馈 N/A (a11y 不直接进三维) / 选择 N/A / **可访问性 ★ 新增轴**: 屏幕阅读器 + 键盘 + 光敏三重覆盖,无回归
- 测试: **63/63 PASS** (基线 58 + 5 新 a11y 断言: 2×ARIA 角色 + 1×aria-labelledby 绑定 + 1×seed 自动聚焦 + 1×reduced-motion CSS 规则)
- 风险: `autofocus` 在用户已与页面交互后才显示的模态上不会重新聚焦(浏览器策略),只对首屏有效;`aria-modal` 是 ARIA 1.1 标志,主流屏幕阅读器支持
- 验收: 用 NVDA/VoiceOver 进入首屏,听「Amsterdam Brewery — 肉鸽中台 对话框」自动朗读;按 Tab 在 Skip/Help/Start 之间循环;系统偏好勾「减少动效」后看 ▶ 自动运行按钮不再闪

---

# funify-24h-v3 (2026-08-16~)

> 第 3 轮 funify。基线 37/37 (monitor 版 index.html 1979 行 143KB) → 目标 ≥60/60。

## 三维评分（1-5）

| 游戏 | 手感 | 反馈 | 选择 | 缺口 |
|---|---:|---:|---:|---|
| 酿酒 brewery | 4 | 5 | 5 | R1: brewStreakMul + brewNoteProgress |
| 酒吧 bar | 4 | 5 | 5 | R1: barTipPreview + barPatienceLeft |
| 咖啡 coffee | 4 | 5 | 5 | R1: coffeeHeatZone + coffeeFitHint |
| SmartShop | 4 | 5 | 4 | R1: shroomQuality |
| 冲浪 surf | 4 | 5 | 5 | 继承 v2 Round4 |
| 学术 academic | 4 | 4 | 5 | 继承 v2 Round1+5 |

## Round 1 — polish(a11y) + 4 mini-games 反馈密度+1 (62/62 PASS)

> 6 mini-game 中 4 个 (brew + bar + coffee + shroom) 完成「手感/反馈/选择」反馈密度再+1。基线 37 → 62 (+25 断言)。

### Commit 1 — polish(a11y): modal ARIA + autofocus + reduced-motion test=42/42

- 改动: `tools/prototype/index.html` start-modal (role/aria-modal/aria-labelledby) + seed input autofocus + @media(prefers-reduced-motion); `tools/prototype/test.html` +5 断言
- 验收: 进入首屏 NVDA 读「Amsterdam Brewery — 肉鸽中台 对话框」、Tab 循环 Skip/Help/Start、减少动效后 ▶ 自动运行 不闪

### Commit 2 — funify-v3(bar): live tip preview + patience timer test=48/48

- 改动: `tools/prototype/index.html` 新增 `barTipPreview(offer,hit,regular,tf)` 净+`barPatienceLeft(c)`; `tools/prototype/test.html` +6 断言
- 机制:
  - `barTipPreview(10,false,false,1.0)===9` 错过推荐返 -$1 / 命中 +$4 / 常客 +$1,玩家按 Q/W 调价时实时显示 tip 预估
  - `barPatienceLeft` 0..1 倒计时,刚生成≈1、超时=0,挂到顾客卡进度条
- 3-axis lift: bar 反馈 5→5 (数字) → 反馈密度 +1 (实时 tip 拆分 + 倒计时)
- 测试: 4×barTipPreview 公式 + 2×barPatienceLeft 边界

### Commit 3 — funify-v3(coffee): heat zone overlay + customer fit hint test=56/56

- 改动: `tools/prototype/index.html` 新增 `coffeeHeatZone(heat)` 4-band + `coffeeFitHint(price,budget)` 命中预览; `tools/prototype/test.html` +8 断言
- 机制:
  - `coffeeHeatZone(20)=='安全'/'#78c878'/danger:0`; <30 绿 / <70 黄 / <90 红 / 100 末日,下水道染色 + 文字标签
  - `coffeeFitHint(15,18)=='✓成交'/green/gap:3`; 出价OK 绿 / 差 -3~-1 黄 / 差 < -3 红 / 无客 灰,玩家 Q/W 调价时实时染色
- 3-axis lift: coffee 反馈 5→5 (数字) → 反馈密度 +1 (4-band 警告 + 命中预览)

### Commit 4 — funify-v3(shroom): real-time quality predictor test=57/57

- 改动: `tools/prototype/index.html` 新增 `shroomQuality(err)` 1..5 映射; `tools/prototype/test.html` +1 断言
- 机制: 错误 <0.1 → ★5 / <0.2 → ★4 / <0.3 → ★3 / <0.5 → ★2 / 否则 ★1,玩家调参时实时显示 ★ 等级
- 3-axis lift: shroom 反馈 4→5 (数字) → 反馈密度 +1 ★ 实时预判

### Commit 5 — funify-v3(brew): streak multiplier + recipe notes test=62/62

- 改动: `tools/prototype/index.html` 新增 `brewStreakMul(n)` 1.0/1.1/1.3/1.5 + `brewNoteProgress(notes,type)` 0..3 mastery; `tools/prototype/test.html` +5 断言
- 机制:
  - `brewStreakMul(0)===1.0` → <3 → 1.0 / <5 → 1.1 / <10 → 1.3 / ≥10 → 1.5,Balatro 连续成功叠加
  - `brewNoteProgress({},'IPA')===0`; 1 → 1 / 99 → 3 (封顶) / 未知类型 → 0
- 3-axis lift: brew 手感 4→5 (数字) → 节奏反馈 +1 (连击 ×30% + 跨 run 笔记)
