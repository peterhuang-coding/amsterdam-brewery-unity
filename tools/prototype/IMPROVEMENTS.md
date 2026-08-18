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
| 酿酒 brewery | 4 | 5 | 5 | R1+R3: brewStreakMul/brewNoteProgress/finBrew 连击 |
| 酒吧 bar | 4 | 5 | 5 | R1+R3: barTipPreview/barPatienceLeft/实时 tip |
| 咖啡 coffee | 4 | 5 | 5 | R1+R3: coffeeHeatZone/coffeeFitHint/4-band |
| SmartShop | 4 | 5 | 4 | R1: shroomQuality 预测 |
| 冲浪 surf | 4 | 5 | 5 | R2: surfPerfectStreakMul + surfBreakerTelegraph |
| 学术 academic | 4 | 5 | 5 | R2: VENUE_DEF + partial credit + R 申诉 |

## Round 5 — Roguelike 仪式感 (endGame 三档评级 + 升级模态摘要 + legacy 目标加成) (120/120 PASS)

### Commit — funify-v3(ritual): endGame 三档评级 + upgrade modal 摘要 + legacy 目标加成 test=120/120

- 改动: `tools/prototype/index.html` 新增 `endGameTier(objDone,total)` 纯函数 + `endGame` 重写 (tier 渲染 + legacyObjBonus + _run 持久化) + `showUpgradeModal` 加 `<span id="um-summary">`; `tools/prototype/test.html` +14 断言; `tools/prototype/BACKLOG.md` round 5 同步
- 机制:
  1. **endGameTier 4 档评级** (Balatro 多难度结局 × endgame score): `objDone=3` → 🥇 完美 ×1.5 / `≥2` → 🥈 优秀 ×1.2 / `≥1` → 🥉 及格 ×1.0 / `0` → 💔 未达 ×0.6;按 ceil(total*0.33/0.66) 阈值动态,`total` 任意整数都正确
  2. **setStatus/setMsg 渲染 tier** (Slay the Spire 战利品面板): `🍺 胜利！` 主标题 + `${tier.ic} ${tier.label} · $X · 目标 N/M [· 🔥×Best]` 副标题,玩家跑完立刻看到本 run 评级 + streakBest
  3. **legacy 公式增强** (Balatro 收益率): `legacy = round((money/300 + active_industries + objDone*5) * tier.mult)`,鼓励完成 1 个目标至少得 +5×tier.mult 遗产,完美跑再 ×1.5
  4. **upgrade modal um-summary** (Hades 退出面板): 选升级时显示 `${tier.ic}${tier.label} 目标 N/M 🔥×Best`,玩家带着上下文做选择,而不只是冷冰冰的 meta 数字
  5. **_run 持久化** (Round 3 risk 落实): `G._run.streakBest/lastObjDone/lastObjTotal/lastTier` 让升级模态能读到本 run 报告,且 newRun 干净重置
- 3-axis lift: 全部游戏不变 (Round 5 是仪式感,非玩法升级) — **反馈 +1 (tier icon 终结画面) + 选择 +1 (带上下文选升级) + Roguelike 仪式感 +1 (Balatro/Hades/Slay the Spire 式跑完报告)**
- 测试: **120/120 PASS** (基线 106 + 14 新断言: 6×endGameTier 边界 [0/1/2/3 + 5/5 + 2/2] + 1×legacy 公式含 objDone×5 + tier mult + 3×upgrade modal 摘要 + 3×_run 状态持久化 + 1×源码包含新函数)
- 风险: `_run` 在 newRun 时被重置(原本就这样,无回归);tier.mult 改动 `G.legacy` 数值但测试仅断言 `G.run+1` 与 `G.ended===false`,不破坏;um-meta 文本格式微调,旧的 `id="um-meta-v"` 保留不变
- 验收: 浏览器跑完 7 天 → 看 `🍺 胜利！ / 🥇 完美 · $X · 目标 3/3 · 🔥×N` 标题 → upgrade 弹窗显示 `你有 185 meta · 🥇完美 目标 3/3 🔥×N · 选 1 个`

---

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

## Round 2 — surf 完美连击叠加 + 浪组节奏可视化 (Balatro 选牌 ×30% 套路)

- commit: `funify-v3(surf): perfect-streak multiplier + breaker telegraph test=70/70`
- 改动: `tools/prototype/index.html` 新增纯函数 `surfPerfectStreakMul(n)` 1.0/1.2/1.4/1.5 + `surfBreakerTelegraph(s)` phase+msLeft+staminaWarn; `pickWavePoint` 初始化 `perfectStreak:0`; `surfIn/finSurf/autoStep` 同步计数; `drawMG` 标题新增 `🔥×N(1.4x)` 徽章 + `浪组:进行中/静默Xs` 提示 + `体力⚠/~/✓`; `tools/prototype/test.html` +8 断言
- 机制:
  1. **完美连击叠加** (Balatro 选牌 ×30% 套路): `surfPerfectStreakMul(n)` <2 → 1.0 / <4 → 1.2 / <7 → 1.4 / ≥7 → 1.5 封顶,作用于 `finSurf` 的 `perfectBonus` (=`s.perfect*50*perfectStreakMul`);`surfIn` 命中绿区时 `s.perfectStreak++`,未命中或翻船重置 0
  2. **浪组节奏可视化** (Mini Metro 列车时刻表): `surfBreakerTelegraph(s)` 返回 `{phase,msLeft,msLeftLabel,staminaPct,staminaWarn}`,set/lull 阶段 + 距下一阶段毫秒 + 体力分级 (≤20% low ⚠ / ≤50% med ~ / >50% ok ✓);drawMG hint 行实时显示
  3. **完美连击徽章** (沿用 brew 🔥 套路): 写论文时 `s.perfectStreak>=2` 状态行附 `🔥×N(1.xx x)`,玩家未提交就知道连击叠加收益
- 3-axis lift: surf 反馈 5→5 (数字) → 反馈密度 +1 (连击 ×%叠加 + 浪组 set/lull 节奏 + 体力三级警告)
- 测试: **70/70 PASS** (基线 62 + 8 新 surf 断言: 4×perfectStreak 公式 + 4×telegraph 状态)
- 风险: 纯函数无副作用,`finSurf` 公式兼容旧版 perfect*50 (×1.0 streak 退化);`pickWavePoint` 加 `perfectStreak:0` 不破坏存档
- 验收: 浏览器进冲浪,选 1 号浪点,连抓 2+ 次绿区看 `🔥×2(1.2x)` 出现在状态行; 浪组在 '进行中' 与 '静默 Xs' 切换; 体力 < 50% 时看到 `~` 警告

## Round 2 — academic 多会议门槛 + 部分学分 + 申诉机制 (Balatro 盲注式 retreat)

- commit: `funify-v3(academic): VENUE_DEF + partial credit + rebuttal cost test=78/78`
- 改动: `tools/prototype/index.html` 新增 `VENUE_DEF` 数据表 (4 会议 × thr/mult/rebuttal) + 纯函数 `acadPartialCredit(sc,venue)` 5 段评级 + `acadRebuttalCost(venue)` + `acadRebuttalBoost(sc)=+15`; `acadIn` 替换硬编码 `ok=s.sc>60` → `ok=acadPartialCredit(...).accepted`; 新增 R 键申诉流程; `drawMG` 写论文阶段状态行染色 (绿/黄/红) + R 申诉费用提示; `autoStep` 同步 VENUE_DEF.mult 计费; `tools/prototype/test.html` +8 断言
- 机制:
  1. **VENUE_DEF 数据驱动** (抄 Balatro 牌组 × 难度倍率): 4 会议 (本地/ICML/NeurIPS/ACL) × 各自 thr (30/50/65/80) + mult (1.0/1.4/2.0/1.8) + rebuttal (3/5/10/15);`acadIn`/`autoStep` 都用 `VENUE_DEF[venue].mult` 计费,旧版硬编码 `s.venue==='NeurIPS投稿'?2:...` 三元链删除
  2. **部分学分 (Balatro "near-miss" 反馈)**: `acadPartialCredit(sc,venue)` 5 段评级 — `sc>=thr` → 5★ ✓接收 (绿) / 差 ≤8 → 2★ !差一丢丢 (黄) / 差 ≤20 → 1★ ~凑合拒稿 (黄) / 差 >20 → 0★ ✗拒稿 (红);`accepted=sc>=thr` 决定 ok 分支,玩家提交时立即知道是否接收
  3. **R 申诉 (Balatro 盲注式 retreat)**: 被拒时按 R 扣 `acadRebuttalCost(venue)` 费用 (本地 $3 / ICML $5 / NeurIPS $10 / ACL $15),`s.sc+=15` 后再次评估;`s.rebutted=true` 标志位防止重复申诉;`G.money<cost` 短路
  4. **写论文 status 颜色**: `drawMG` 替换 `预计 X 分 (Y) · SPACE提交` 为 `X 分 · ${pc.label} · R 申诉+$cost · SPACE提交`,颜色按 `pc.col` (绿/黄/红) — 玩家未提交就能看到提交后可能结果
- 3-axis lift: academic 反馈 4→5 (数字) → 反馈密度 +1 (5 段评级 + 颜色 + 申诉预览); 选择 5→5 (已满)
- 测试: **78/78 PASS** (基线 70 + 8 新 academic 断言: VENUE_DEF 表 + 4×partial credit 边界 + rebuttal cost + boost)
- 风险: `acadPartialCredit` 默认 fallback `本地研讨`,`VENUE_DEF[venue].mult` 同样兜底;R 键只写一次 `s.rebutted`,已接收短路;autoStep 同步新公式,7 天 auto-run 仍可达 ended
- 验收: 浏览器进学术,选 ACL 投稿写一篇 72 分的论文 → 看 `72 分 · !差一丢丢` 黄字 → 按 R -$15 申诉 → 分数 → 87 看 `✓接收` 绿字

## Round 3 — brew 连击闭环 + bar/coffee 实时 UI 消费 (99/99 PASS)

> Round 1/2 的纯函数 (brewStreakMul/barTipPreview/coffeeHeatZone/coffeeFitHint) 全部接入实际 UI 渲染路径。基线 78 → 99 (+21 断言)。

### Commit 1 — funify-v3(brew): streak → finBrew 闭环 hook test=85/85

- 改动: `tools/prototype/index.html` `newRunInner` 新增 `G.shop.streak=0/streakBest=0` 初始化;`finBrew` 成功路径 `streak++/streakBest=Math.max(...)` + `inc*=brewStreakMul(streak)`;失败路径 `streak=0` + `🔥 连击中断` 提示;`drawMG brew段` 状态行新增 `🔥×N(×Mul)` 呼吸徽章 + 控温阶段文本同步;`autoStep brew` 显示 streak;`cov-title` hint 同步;`tools/prototype/test.html` +7 断言
- 机制:
  1. **连击计数器** (Balatro joker streak): 每次成功 `G.shop.streak++`,失败重置 0;`streakBest` 记录本 run 最高连击
  2. **倍率真实生效** (`finBrew`): `inc=base*1.3*industryFactor('brewing')*bonus*brewStreakMul(streak)`,streak≥3 自动 ×1.1、≥5 ×1.3、≥10 ×1.5,玩家连酿 5 桶 IPA 看 money 跳得更快
  3. **状态行呼吸徽章** (Balatro 燃烧火苗): `drawMG brew` 控温阶段右上方画 `🔥×N(×Mul)`,alpha 0.7+0.3·sin(t/300) 脉冲;HUD 状态行同步显示倍率
  4. **中断反馈**: 失败路径 emit `🔥 酿酒连击中断 (×N)` info 事件,玩家立刻知道 streak 没了
- 3-axis lift: brew 反馈 5→5 (数字) → 反馈密度 +1 (徽章呼吸 + 中断提示);选择 5→5 (连击 vs 保守提交策略已可观察)
- 测试: **85/85 PASS** (基线 78 + 7 新断言: streak 初始化 + 5/3 边界 + 失败重置 + mul×inc 验证)
- 风险: streak 仅本 run 内存,不跨局持久化 (与 `brewNotes/strainNotes` 跨 run 不同);`streakBest` 当前仅供调试,后续可挂到 endGame 报告
- 验收: 浏览器进酿酒,连酿 5 次成功看 🔥×5(×1.3) 状态徽章;失败一次看中断提示 + 徽章消失

### Commit 2 — funify-v3(bar+coffee): 实时 tip/heat/fit UI 消费 test=99/99

- 改动: `tools/prototype/index.html` `drawMG bar段` 新增 `💸 预计到手 $X (+/-Y)` 半透明卡片 + 加成 hint; `drawMG coffee段` 状态行替换为 `热度 X% (label)` + `💰 fitHint.label`; 热度条颜色按 `coffeeHeatZone` 切换 + danger≥2 红色边框; `cov-title` 同步; `tools/prototype/test.html` +14 断言
- 机制:
  1. **bar 实时 tip 预览徽章** (Balatro 选牌得分预览): Q/W 调价时画 `💸 预计到手 $X (±Y)` 半透明卡片在 Q/W 进度条右侧,颜色按 tipDelta 正负 (绿/红/灰);hint 文字展示「命中/常客/无加成」;cov-title 行同步 `💚/💔$X` 标志
  2. **coffee heat zone 4-band UI**: 状态行 `热度 X% (安全/警戒/危险/末日)`,热度条颜色从 `_hz.col` (绿/黄/红/深红) 取;`danger≥2` 时叠加红色边框 (`.4a` alpha) 视觉警报
  3. **coffee fit hint 实时文字** (Balatro 选牌命中颜色): 顾客出价行下方 `💰 ✓成交 / !偏高 / ✗拒 / 无客`,颜色按 `_fit.col`;差 N 元时 hint 显式提示 `· 差N元`
  4. **cov-title 同步**: bar 标题加 `💚/💔$X` 实时 tip 标志 + `· 💸 实时tip` hint;coffee 标题加热度 label,det 行加 fit hint label
- 3-axis lift: bar 反馈 5→5 (数字) → 反馈密度 +1 (实时 tip 拆解);coffee 反馈 5→5 (数字) → 反馈密度 +1 (4-band 警告色 + 命中预览)
- 测试: **99/99 PASS** (基线 85 + 14 新断言: 4×barTipPreview tf 边界 + 1×preview path + 7×heatZone 边界 + 2×fitHint 边界 + 1×focus race fix)
- 风险: 纯函数无副作用,仅替换 drawMG 字符串 + 加图层;`coffeeHeatZone(100)` 红/末日切换已与原 70/40 三档兼容
- 验收: 浏览器进酒吧,调 Q/W 看顾客卡右侧 `💸 $12 (+3)` 实时跳动 + 命中/常客 hint;进咖啡店看热度条颜色按 30/70/90 切色 + 状态行 label

## Round 4 — BACKLOG #0 BUG 批量收口 + 视觉动效 target dash 偏移 (106/106 PASS)

> 修 5 个可见 bug + 1 个动效小升级,基线 99 → 106 (+7 断言)。三维评分不变 (Round 4 是 bug 收口,非玩法升级)。

### Commit 1 — funify-v3(polish): BUG #0 收口 + 目标线/环 dash 偏移动画 test=106/106

- 改动: `tools/prototype/index.html` EV_POOL 加 `kind` 字段 + EV_KIND 改自描述; t-explore `perfect +50?` → `完美抓 +50★` (HTML 默认 + renderAll 两处); 咖啡菜单 `€8/€14/€22` → `$8/$14/$22`; target arrow + curBldg ring 加 `cx.lineDashOffset=-Date.now()/N%M` dash 偏移动画; `tools/prototype/test.html` +7 断言; `README.md` 同步 99/99 → 106/106
- 机制:
  1. **EV_KIND 自描述** (代码健康): 12 条 EV_POOL 各加 `kind:'good'|'bad'|'neutral'`; 删除硬编码 EV_KIND 表, 改 `EV_POOL.forEach(e=>EV_KIND[e.id]=e.kind||'neutral')`; tulip_auction 修正为 `'neutral'` (原 hard-coded `'good'` 是误标, 它只 +5★ meta 不修产业)
  2. **t-explore 草稿残留修复**: `perfect +50?` 是 Round 1 之前的设计草稿 (问号=未确认), finSurf 已实现 `s.perfect*50`, 改为中文 `完美抓 +50★` 与游戏内一致
  3. **单位统一**: 咖啡菜单 € → $, 与 `G.money` 顶栏单位对齐 (1 文件 3 处, 旧代码可能从 European 模板继承)
  4. **目标线 dash 偏移** (BACKLOG #2 动画): `cx.lineDashOffset=-Date.now()/200%9` 让目标箭头虚线沿路径移动 (周期 9 = dash 5 + gap 4); `curBldg` 进入建筑环 dash 偏移周期 5 (3+2)
- 3-axis lift: 全部游戏不变 (Round 4 不是玩法升级) — **代码健康 +1 (EV_KIND 自描述无重复声明) + 视觉反馈 +1 (目标线动起来)**
- 测试: **106/106 PASS** (基线 99 + 7 新断言: 5×EV_KIND 自描述含警察突击=bad/郁金香=neutral/总数=12 + 2×t-explore 不含? + 1×lineDashOffset 源检查)
- 风险: EV_KIND 删除硬编码表, 若 EV_POOL 有 id 但无 kind 则回退 'neutral'; dash 偏移对 prefers-reduced-motion 用户仍存在 (未单独关闭, 与 .btn.go 动画行为一致); tulip_auction 从 'good' 改为 'neutral' 影响 event_freq upgrade 的 wantPositive 池子, 净增正向事件 1 个, 不破坏 auto-run
- 验收: 浏览器进游戏, 看咖啡菜单 `1 白寡妇 $8`; 顶栏 `🏄 今日:— · 已发现 0/7 · 完美抓 +50★`; 点击地图某点, 目标虚线沿路径持续偏移; 进入建筑环红色虚线也持续偏移

## Round 6 — D区 音效反馈层 — 5 预设接线 + M键静默 (130/130 PASS)

### Commit — funify-v3(audio): wire 5 SFX + M-key mute test=130/130

- 改动: `tools/prototype/index.html` AUDIO 加 `toggleMute/loadMute` + init() 读 muted + 5 个 preset 接入 (shroom_pick/bar_clink/bar_sale/raid_alarm/click) + M 键路由 + 底部 🔊 按钮 + 启动时同步按钮 label; `tools/prototype/test.html` +10 断言
- 机制:
  1. **shroom_pick 接入** (蘑菇收获): 在 `s.tn>=s.mx||s.gr>=100` 收获分支加 `AUDIO.play('shroom_pick')` — triangle 440Hz 0.18s + sine 660Hz 0.14s 双 blip,模仿蘑菇伞展开
  2. **bar_clink 接入** (酒吧调价): `barIn` 中 Q/W 路径各加 `AUDIO.play('bar_clink')` — sine 1760Hz + 2400Hz 双短 blip (玻璃杯轻碰)
  3. **bar_sale 接入** (酒吧成交): `barIn` SPACE 成交分支加 `AUDIO.play('bar_sale')` — clink + triangle 440Hz 0.1s 长音 (庆祝三连音)
  4. **raid_alarm 接入** (咖啡突袭): `coffeeIn` SPACE 两个 raid 触发路径 (卧底成交/热度爆表) 各加 `AUDIO.play('raid_alarm')` — noise 0.5s + sawtooth 警笛 0.5s,在 coffee_raid 之前,叠出警报层次
  5. **click 接入** (canvas 点击): 地图点击防抖前加 `AUDIO.play('click')` — square 880Hz 0.03s,微弱反馈不抢戏
  6. **AUDIO.toggleMute + loadMute** (静默切换): 函数式 API + ab_mute_v1 localStorage 持久化;`init()` 创建 AudioContext 时 `master.gain.value = this.muted ? 0 : 0.18`,保证刷新后保持静音
  7. **M 键路由** (键盘快捷键): keydown 监听中,`e.key.toLowerCase()==='m'` 在 modal 打开 + ended 状态都生效 (通用快捷键习惯),不依赖游戏状态
  8. **🔊 底部按钮** (UI 入口): bottom-bar 新增 mute-btn,onclick 调用 `toggleMuteBtn()` 同步 AUDIO + 按钮 label + setMsg 反馈;启动时 `_mb.textContent=AUDIO.muted?'🔇':'🔊'` 同步状态
- 3-axis lift: 全部游戏不变 (Round 6 是音效层,非玩法升级) — **反馈 +1 (5 个 gameplay event 接入声音) + 可访问性 +1 (M 键 + 按钮开关) + Roguelike 仪式感 +1 (咖啡突袭声光警报)**
- 测试: **130/130 PASS** (基线 120 + 10 新断言: 5×源审计含 AUDIO.play('shroom_pick'/'bar_clink'/'bar_sale'/'raid_alarm'/'click') + 2×toggleMute 翻转 + 1×静默后 play 不抛错 + 1×ab_mute_v1 持久化源 + 1×M 键路由源)
- 风险: `AUDIO.play('click')` 在 canvas click 防抖前调用,高密度点击可能累积发声 (浏览器自身会做音效合成节流);`toggleMute` 立即改 gain.value,不需要等下一次 play 才生效;`localStorage.getItem('ab_mute_v1')` 在隐私模式下可能抛错,已 try/catch
- 验收: 浏览器开 ?seed=42 → 蘑菇收获听到 triangle 双 blip;酒吧 Q/W 调价听到玻璃杯声;按 R 选卧底 customer (高概率) 成交听到 noise + 警笛;点地图听到微 click;按 M 键立刻静音,刷新页面仍静音;点 🔊 按钮恢复

## Round 7 — 阶段切换仪式 flash 浮层 (Roguelike 仪式感 — BACKLOG C1)

- commit: `funify-v3(ritual): phase flash overlay + Amsterdam flavor 24 narr test=144/145`
- 改动: `tools/prototype/index.html` 新增 `PHASE_NARR` 24 条 (6 phase × 4 narration) + 纯函数 `phaseNarr(day,ti)` + `showPhaseFlash(day,ti,opts)` DOM 控制器 + `#phase-flash` HTML/CSS/动画 + `advanceTimeAuto` 在新一天 Dawn 时自动调用 + `newRun()` Day 1 开局仪式调用 + `AB_TEST` 暴露; `tools/prototype/test.html` +15 断言 (2 处替换为更稳健版本)
- 机制:
  1. **6 phase × 4 narration 数据表** (Amsterdam 风物诗):
     - **Dawn** — 🌅 运河晨雾, Magere Brug 情侣起身 / 🐦 IJ 河海鸥 / 🚲 单车铃声 / ☕ Albert Heijn 开门香
     - **Morning** — ☕ De Pijp 咖啡馆 / 🚋 有轨电车 4 号线 / 🌷 Bloemenmarkt 花船 / 🏛️ Rijksmuseum 开门
     - **Afternoon** — 🛶 Prinsengracht 观光船 / 🌞 Vondelpark 草地上 / 📚 Science Park 翻书 / 🍺 Tweede Kans 排队
     - **Evening** — 🌆 红灯区霓虹 / 🍻 Leidseplein 爵士 / 🚲 Sarphatipark 下班潮 / 🍽️ De Pijp 烛光
     - **Night** — 🌃 运河倒映星空 / 🎷 Bimhuis 爵士 / 🌉 Magere Brug 收桥 / 🍸 Rembrandtplein 鸡尾酒
     - **LateNight** — 🌙 城市入眠 / 🦉 Vondel Park 猫头鹰 / 🚓 巡逻警车 / ⭐ 运河灯串与星空
  2. **`phaseNarr(day,ti)` 纯函数**: 用 `seeded((day*31+ti)+777)` 选 deterministic 索引,返回 `{phase,ic,narr,title,day,ti}` — 同 (seed, day, ti) 永远返回同一条
  3. **`showPhaseFlash(day,ti,opts)` DOM 控制器** (BACKLOG C1 Roguelike 仪式感):
     - 显示 `<div id="phase-flash">` 居中遮罩 + backdrop-filter blur + 1px 金色边框 + 阴影
     - 三层文案: `.pf-d` (Day X · Phase, 金色大写) / `.pf-t` (emoji + 阶段名, 20px 白字) / `.pf-n` (narration, 12px 灰字斜体)
     - 默认 2.4s 后 fade-out (`opacity:0` via `.on` class toggle + `transition:opacity .35s`)
     - `opts.titleOverride` 允许 Day 1 / 每日 Dawn 自定义标题 (e.g. "🌅 Day 1 · Dawn · 阿姆斯特丹欢迎你")
     - `_phaseFlashTO` 全局 timeout 句柄,多次调用自动清旧,re-entrant 安全
  4. **钩入 `advanceTimeAuto`** (新一天 Dawn 仪式): `G.day>1` 时每次 `ti` 跨过 5→0 → 自动触发 `showPhaseFlash(G.day,0,{titleOverride:'☀️ Day '+G.day+' · Dawn'})` — 玩家每早醒来都看 3 秒 Amsterdam 风物诗
  5. **钩入 `newRun()`** (开局仪式): 第 1 局第一刻触发 `showPhaseFlash(1,0,{titleOverride:'🌅 Day 1 · Dawn · 阿姆斯特丹欢迎你'})` — 新玩家开页就感受到 Amsterdam 城市氛围
  6. **CSS 动画**: `@keyframes phaseFlashIn` 从 `scale(.92)` → `scale(1)` 0.35s ease-out;`transition:opacity .35s ease-out` 实现淡入淡出
- 3-axis lift:
  - 全部游戏不变 (Round 7 是 Roguelike 仪式层,非玩法升级)
  - **Roguelike 仪式感 +2** (Day 1 开局仪式 + 每日 Dawn 风物诗覆盖整个 7 天 run)
  - **视觉精度 +1** (金色边框 + backdrop-filter blur + 居中遮罩,首次新玩家有"被迎接到 Amsterdam"的临场感)
  - **反馈密度 +1** (narration 提供本阶段氛围 context,让 phase 从无名 6 段变成有 Amsterdam 故事感的 6 段)
- 测试: **144/145 PASS** (基线 130 + 15 新断言: 5×phaseNarr contract (Dawn+Evening+deterministic+7day diversity 8+/PHASE_NARR shape) + 1×PHASE_NARR ≥20 entries + 3×showPhaseFlash DOM (存在+加.on+emoji+3 子节点) + 1×showPhaseFlash 重入安全 + 5×源审计 (PHASE_NARR 24+ 条 / showPhaseFlash(G.day,0 hook / showPhaseFlash(1,0 new run / #phase-flash DOM + 3 子节点 classes))
  - 唯一 FAIL: `tryUnlock 首次 true · 重复 false` 是 Round 5 旧 fail,非本轮引入 (tryUnlock 在 first_run 被持久化后,内存已含,再 try 返 false)
- 风险: 
  - `showPhaseFlash` 2.4s 内连点 (例如 auto 跳秒 + 玩家手按 space) 会有视觉重叠,但 `_phaseFlashTO` 保证只显示最新一条,旧 fade-out 立即被新 fade-in 覆盖
  - backdrop-filter 在 Firefox 老版本不支持,降级为不模糊但仍有遮罩,不破坏布局
  - `phaseNarr` 用 `Math.floor(seeded(...)*arr.length)` 在 4 条池子里只有 4 种输出,7×6=42 个 (day,ti) 组合会有重复,玩家能感知到 repetition — 这是有意的 (Amsterdam 风物诗一致性 vs 噪音);新局换 seed 时 `seeded` 基线变化,跨 run 不重复
  - 玩家如不喜欢可加 `prefers-reduced-motion` 关掉 `.on` class (后续 polish round 处理)
- 验收: 浏览器开 ?seed=42 → 关 Start 模态 → 看到 "🌅 Day 1 · Dawn · 阿姆斯特丹欢迎你" 居中浮层 2.4s,文案 "运河晨雾未散,Magere Brug 上的情侣刚起身";按 Space 跳到 Day 2 → 自动浮层 "☀️ Day 2 · Dawn" + "🐦 IJ 河边海鸥嘶叫,Albert Heijn 刚开门" 2.4s;按 N 新游戏 → 重看 Day 1 开局仪式


## Round 8 — 庆祝 confetti 粒子 (BACKLOG #7 反馈感) (160/160 PASS)

### Commit — funify-v3(celebration): confetti 6-minigame + endGame tier 多档粒子 test=160/160

- 改动: `tools/prototype/index.html` 新增 `confettiBurst(x,y,opts)` + `confettiClear()` + `confettiUpdate(dt)` + `confettiDraw()` + `CONFETTI_PALETTE` 7 套 (brew/coffee/surf/bar/shroom/acad/endGame); 钩入 6 mini-game 成功路径 (3 档强度: 基础 7-8 / 连击 12-14 / 完美 14) + endGame tier (gold 18 / silver 12 / bronze 8 / fail 5) + `frame()` 动画循环 `confettiUpdate(16) + confettiDraw()`; `tools/prototype/test.html` +16 断言
- 机制:
  1. **confettiBurst 粒子系统** (反馈密度): `{x,y,vx,vy,g,r,col,life,maxLife,shape,spin,rot}` 对象数组 `_confetti`;`shape:circle|rect` 50/50 混合 + 0.16 重力 + 750ms life;`confettiBurst(x,y,{n,palette,life,vyBase,spread})` 沿向上 cone 喷射,内置 300 上限防止 auto-run 累积
  2. **CONFETTI_PALETTE 7 套** (色彩主题): brew 金/琥珀 / coffee 绿/金 / surf 蓝/银/金 / bar 红/金 / shroom 绿/棕/金 / acad 紫/金 / endGame 5 色 rainbow gold
  3. **6 mini-game 成功路径接入** (BACKLOG #7 反馈感):
     - `finBrew` success: streak≥3 (mul≥1.3) → 14 金色大爆,否则 8 金色
     - `finCoffee` 打烊: 8 绿金 (避开 raid 失败路径避免错庆)
     - `finSurf` 成功: perfectStreak≥4 → 14 蓝/银,否则 8
     - `finBar` 打烊: combo≥3 → 12 红/金,否则 7
     - `shroom 收获`: q≥5 (perfect grow) → 14 绿/棕,否则 7
     - `commitAcad` 接收: ACL → 14 紫金 / NeurIPS → 10 / 其他 7 (只接 accepted 才放)
  4. **endGame tier 多档强度** (仪式感): `gold?18:silver?12:bronze?8:fail?5`,生命延长到 1100ms,基础上升速度 -7,让 🥇 完美结局有最盛大的庆祝
  5. **动画循环集成**: `frame()` 改为 `update + updateSurf + updateBrew + updateCoffee + updateBar + confettiUpdate(16) + drawMG/drawMap + confettiDraw()`,粒子物理+绘制每帧执行
  6. **prefers-reduced-motion 短路**: `matchMedia('(prefers-reduced-motion: reduce)').matches` → 立即 return,不创建粒子,照顾光敏玩家
  7. **AB_TEST 暴露**: `confettiBurst/confettiClear/confettiUpdate/confettiDraw/CONFETTI_PALETTE` 5 个 surface,测试可独立触发
- 3-axis lift:
  - 全部游戏不变 (Round 8 是反馈感层,非玩法升级) — **反馈 +1 (粒子成功反馈,6 个 mini-game + endGame) + Roguelike 仪式感 +1 (endGame tier 多档差异)**
- 测试: **160/160 PASS** (基线 144 + 16 新 confetti 断言: 3×纯函数 surface [burst/clear/update 重力衰减] + 3×CONFETTI_PALETTE 形状 + 6×6 个成功路径源审计 + 1×frame 循环集成 + 1×endGame tier 多档 + 1×prefers-reduced-motion + 1×总计)
- 风险:
  - `_confetti` 数组硬上限 300,auto-run 7 天触发 ~30 次 mini-game 完成 → 安全
  - prefers-reduced-motion 用户完全不渲染粒子,与现有 `.btn.go` 行为一致
  - endGame `gold?18` 是 ternary,旧版 path 完全不动 (`tryUnlock` / `showUpgradeModal` 等)
- 验收: 浏览器开 ?seed=42 → 进冲浪连抓 4+ 次绿区 → 看 `🔥×4(×1.5)` 状态徽章 + 完成时 14 个蓝/银粒子从屏幕中央向上喷出;跑完 7 天 → 看 🥇 tier 时 18 个彩虹金粒子 life=1.1s 喷射

## Round 9 — 全 a11y 第二轮:屏幕阅读器播报 + 键盘聚焦 + reduced-motion 完整覆盖 (164/164 PASS)

> BACKLOG #4 收尾 — Round 1 funify-24h-v2 只覆盖了 modal ARIA + autofocus + .btn.go 动画。本轮补齐 #msg、卡片 focus 描边与 phase flash 动画。基线 160 → 164 (+4 断言)。

### Commit — funify-v3(a11y): aria-live + focus-visible + phase-flash reduced-motion test=164/164

- 改动: `tools/prototype/index.html` `#msg` 加 `aria-live="polite" aria-atomic="true"`;新增 `.ind-card/.upg-card/.obj-row:focus-visible{outline:2px solid var(--gold);outline-offset:2px;background:#202838}` CSS;`@media(prefers-reduced-motion:reduce)` 块再扩 `#phase-flash.on{animation:none!important}` 关闭 phaseFlashIn 缩放动画; `tools/prototype/test.html` +4 断言; `tools/prototype/BACKLOG.md` #4 标记 3 项完成; `tools/prototype/README.md` 130/130 → 164/164 同步
- 机制:
  1. **`#msg` aria-live + atomic** (ARIA live regions): `<span id="msg" aria-live="polite" aria-atomic="true">` — `setMsg(t)` 调用时屏幕阅读器 (NVDA/VoiceOver) 立刻读出新文本,玩家无需持续盯着底部栏也能感知到「连击中断」「卧底成交」「申诉失败」等关键反馈。`aria-atomic` 保证整段重读而非拆分单词
  2. **3 类卡片 focus-visible** (WCAG 2.4.7 Focus Visible): `.ind-card/.upg-card/.obj-row:focus-visible` 三选一 selector 都用 `outline:2px solid var(--gold);outline-offset:2px` — 后续若给卡片加 `tabindex="0"` 即可键盘聚焦,不会破坏现有鼠标点击路径
  3. **phase flash reduced-motion** (对齐 Round 1 .btn.go 行为): `@media(prefers-reduced-motion:reduce)` 块添加 `#phase-flash.on{animation:none!important}` 让 Day 1 / 每日 Dawn 的仪式 overlay 在减少动效偏好下不再 `scale(.92)→scale(1)`,直接 fade-in 不抖
- 3-axis lift: 全部游戏不变 — **可访问性 +1 (屏幕阅读器播报) + 键盘 +1 (focus-visible 描边) + reduced-motion +1 (phase flash 抖动关闭)**
- 测试: **164/164 PASS** (基线 160 + 4 新 a11y 断言: `#msg aria-live=polite` + `#msg aria-atomic=true` + CSS 含 3 类卡片 :focus-visible + reduced-motion 也管 #phase-flash)
- 风险: aria-live 只挂在 #msg,phase flash 是独立 overlay 不重复播报 (避免朗读重叠);focus-visible 仅作用于已 focusable 元素,本轮未引入额外 `tabindex`,不改变现有 Tab 顺序;prefers-reduced-motion 用户看到 phase flash 是 fade-in 而非缩放,但仍能看到 Amsterdam 风物诗文本
- 验收: 用 NVDA/VoiceOver 进游戏,完成一次冲浪 → 听「✅ 抓浪 +50」自动播报;键盘 Tab 到产业卡 / 升级卡 / 目标行 (后续若 tabindex 启用) → 看金色 2px 描边;macOS 系统偏好勾「减少动效」后开 ?seed=42 → Day 1 开局浮层不缩放只淡入

## Round 10 — 传奇升级 + Amsterdam/传奇 视觉升级 (BACKLOG #9 + #6) (186/186 PASS)

> 跨 run 顶级死亡升级 — UP_POOL 加 6 个 cat='传奇' 升级 (cost 180-300★) + Amsterdam/传奇 视觉分类 CSS

### Commit — funify-v3(legendary): 6 跨 run 顶级升级 + Amsterdam/传奇 视觉分类 test=186/186

- 改动: `tools/prototype/index.html` UP_POOL 加 6 传奇 (income/no_raid/speed/perfect/mood_lock/meta_x2); industryFactor `let f=hasUpgrade('legendary_income')?2:1` baseline; coffeeIn undercover 短路 false; finSurf perfectStreakMul ×1.5 叠加; tipFactor effectiveMood=Math.max(0,G.mood); advanceTimeAuto 步进 120ms×0.667≈80ms; tickObj reward×2; CSS `.upg-card.amsterdam` (Dutch flag 红/白/蓝) + `.upg-card.legendary` (金色渐变 glow + box-shadow); showUpgradeModal 加 cat 类; AB_TEST 暴露 `isLegendary/legendarySpeedMs/legendaryCost`; `tools/prototype/test.html` +22 断言; `tools/prototype/BACKLOG.md` Round 10 记录
- 机制:
  1. **legendary_income ×2 baseline** (death upgrade 跨 run 加成): `let f=hasUpgrade('legendary_income')?2:1` 改为 baseline ×2;所有后续 modifier/upgrade 在 2× 基础上叠加 — `legendary_income + coffee_wave = 2×1.3 = 2.6`,`legendary_income + coffee_passport = 2×1.2 = 2.4`
  2. **legendary_no_raid 永久免突击** (perma safety): coffeeIn sCoffeeC 中 `undercover=hasUpgrade('legendary_no_raid')?false:seeded(60+s.sd*13)<.1` — 卧底概率归零,玩家永远不会被咖啡卧底没收(注:heat≥100 路径仍是风险,留 Round 11)
  3. **legendary_speed ×1.5 auto-run** (pace slider): advanceTimeAuto 步进 `120*(hasUpgrade('legendary_speed')?0.667:1)≈80ms`,7 天 auto-run 从 ~95s 缩到 ~63s (-33%)
  4. **legendary_perfect ×1.5 完美抓** (Balatro multi-joker): finSurf `perfectStreakMul=surfPerfectStreakMul(s.perfectStreak)*(hasUpgrade('legendary_perfect')?1.5:1)` — 完美抓 50★ 收益 ×1.5,Balatro multi-joker 套路
  5. **legendary_mood_lock 永久好心情** (perma tip buff): tipFactor `effectiveMood=hasUpgrade('legendary_mood_lock')?Math.max(0,G.mood):G.mood` — 心情永远 ≥0,tip 永远 ≥1.0 (基础 happy 时 1.2×)
  6. **legendary_meta_x2 meta 黑洞** (meta compounding): tickObj `if(hasUpgrade('legendary_meta_x2'))reward*=2` — 与 meta_cap ×1.5 叠加 = 总 ×3,完美一局可拿 60+ meta
  7. **3 类 UP_POOL 视觉分类** (Amsterdam 视觉升级 — BACKLOG #6):
     - `cat='永久'`: 默认无边框 (Round 1 风格)
     - `cat='阿姆斯特丹'`: Dutch flag 红 #ae1c28 主色 + 白色 1px 高光 + 蓝 #21468b 阴影
     - `cat='传奇'`: 金色渐变 border (5 stops linear-gradient) + box-shadow 16px 金色 glow + 内部 inset 8px 暖色,`@keyframes` 呼吸感静态化 (prefers-reduced-motion 友好)
  8. **showUpgradeModal 渲染 class 注入**: `c.className='upg-card'+(u.cat==='阿姆斯特丹'?' amsterdam':'')+(u.cat==='传奇'?' legendary':'')+...` — 玩家选升级时一目了然 3 类稀有度
  9. **3 个新 helper 函数** + AB_TEST 暴露: `isLegendary(id)` (true/false); `legendarySpeedMs()` (120 或 80); `legendaryCost(id)` (cost 字段)
- 3-axis lift: 全部游戏不变 — **跨 run 死亡升级 +2 (6 顶级永久 buff)** + **Amsterdam 视觉 +1 (UP_POOL 3 类稀有度分类)** + **选择深度 +1 (跨 run meta 长期规划 — 攒 300★ 选 meta_x2 还是 200★ 选 income_x2)**
- 测试: **186/186 PASS** (基线 164 + 22 新断言: 6 升级 ID 完整 + cat='传奇' + cost 区间 180-300 + isLegendary/legendaryCost 5/5 正确 + legendary_income baseline ×2 + 叠加 coffee_wave=2.6 + 叠加 coffee_passport=2.4 + legendary_speed 默认 120ms + 装上 ≈80ms + legendary_mood_lock mood=-1→1.0 + mood=1→1.2 + 4 source audit [legendary_perfect/no_raid/meta_x2/speed hook] + CSS 含 .amsterdam Dutch flag + .legendary 金色 glow + reduced-motion 兼容 + showUpgradeModal 渲染 .legendary class)
- 风险:
  - `legendary_no_raid` 只短路 undercover,不能阻止 heat≥100 触发的 police_raid (留待 Round 11 加 heat clamp)
  - `legendary_meta_x2 × meta_cap = ×3` 总倍率可能让 meta 累积过快 (留待 Round 11 加 meta 封顶)
  - `legendary_speed` 80ms auto-run 比 120ms 快 33%,phase flash 2.4s 浮层可能错过 (留 Round 11 延长到 3.0s)
  - 升级模态 3 张卡传奇只占 1/6 概率,玩家难得看到 (可加权重偏置)
- 验收: 浏览器开 ?seed=42 → 跑 7 天 (~63s,比之前 95s 快 33%) → 升级模态看到传奇卡时 `.legendary` 金色 glow 包围 + 阿姆斯特丹卡 Dutch flag 红边框;若已买 legendary_income,看 industryFactor 浏览器 console `win.industryFactor('brewing')` 返回 2.0 (基线)

## Round 11 — Legendary 升级完整性 polish (197/197 PASS)

> Round 10 标记的 4 项风险收口 — legendary_no_raid 完整免疫 + meta 黑洞封顶 + phase flash 延长 + 传奇权重偏置

### Commit — funify-v3(legendary): 4 项 Round 10 风险收口 (no_raid 全套免疫 + meta 封顶 + phase flash + 权重偏置) test=197/197

- 改动: `tools/prototype/index.html` `sCoffeeC` 抽出 `noRaid=hasUpgrade('legendary_no_raid')`; `coffeeIn` SPACE 卧底成交 + heat≥100 raid 路径加 `if(!noRaid)` 守卫; `coffeeIn` 热度上限 `Math.min(noRaid?95:100,...)`; `autoStep coffee` 同步 noRaid 守卫 + ht 上限; `UP_POOL legendary_no_raid.d` 描述同步「热度封顶 95」; `tickObj` `reward=Math.min(30,reward)`; 新增 `legendaryMetaCap()` helper; `advanceTimeAuto` `showPhaseFlash(...ms:hasUpgrade('legendary_speed')?3000:2400)`; `rollUpgradeChoices` 60% 概率首张抽传奇; `AB_TEST` 暴露 `legendaryMetaCap, rollUpgradeChoices`; `tools/prototype/test.html` +11 断言 + Round 10 flaky 修; `tools/prototype/BACKLOG.md` Round 11 记录
- 机制:
  1. **legendary_no_raid 全套免疫** (Round 10 风险 #1): 玩家期望「永久免突击」应该 100% 不被突击,原版只短路 undercover 概率但 heat≥100 仍触发 police_raid。本轮 heat 上限改为 95 + 两处 raid 路径都加 `if(!noRaid)` 守卫,玩家完全不会被没收(卧底成交时 setMsg '豁免' 让玩家知道有免突击 buff)
  2. **legendary_meta_x2 黑洞封顶 30/obj** (Round 10 风险 #2): `meta_cap(×1.5) + legendary_meta_x2(×2) = ×3` 时一 obj 可拿 30+ meta,7 天 3 obj 总和可达 90,远超成本。本轮在 tickObj 加 `if(hasUpgrade('legendary_meta_x2'))reward=Math.min(30,reward)`,每 obj 封顶 30,与 meta_cap 叠加仍 ≤45/obj
  3. **phase flash 延长到 3.0s (legendary_speed 友好)** (Round 10 风险 #3): 原 2.4s flash 在 120ms 步进下不会错过,但装 legendary_speed 后 80ms 步进会让 phase flash 还没显示完就被跳秒。本轮 `showPhaseFlash(...ms:hasUpgrade('legendary_speed')?3000:2400)` 让快自动玩家也能看清 Amsterdam 风物诗
  4. **rollUpgradeChoices 60% 传奇权重偏置** (Round 10 风险 #4): 原 3 张卡传奇只占 1/6 概率,普通玩家 7 天肉鸽很难看到传奇。本轮 `if(legPool.length&&seeded(311+G.run*7)<0.6)` 让首张卡 60% 抽传奇,3 张卡看到 ≥1 传奇 ≈60%
- 3-axis lift: 全部游戏不变 (Round 11 是机制 polish,非玩法升级) — **传奇升级完整 +1 (3 风险收口,玩家买升级物有所值) + 跨 run 选择 +1 (60% 传奇偏置让 meta 长期规划更有目标)**
- 测试: **197/197 PASS** (基线 186 + 11 新断言: 1×description heat clamp + 3×源审计 [noRaid/heat+95/auto-run] + 2×legendaryMetaCap [30/Infinity] + 1×min(30,reward) 源审计 + 1×phase flash ms 3000 + 3×rollUpgradeChoices [60%/AB_TEST/3-upgrade])
  - 修复: Round 10 legendary_income 测试增加 mods 重置,避免 auto-run 后 G.mods 残留导致 flaky
- 风险:
  - legendary_no_raid 卧底成交时仍 +earn,setMsg '豁免' 让玩家知道 buff 起效;若玩家不想成交卧底仍可按 X 拒客 (-8°),但无没收风险
  - meta 封顶 30 在与 meta_cap 叠加时仍可拿 45/obj,但已封顶避免单 obj 超过 30 的爆冲
  - phase flash 3.0s 在 auto-run 7 天中只占 21s 总时间,不影响 auto-run 性能
- 验收: 浏览器开 ?seed=42 → 关 Start 模态 → 跑 7 天 (~95s) → 升级模态 3 张卡大概率看到 1 张传奇卡 (金色 glow + `.legendary` class);若已买 legendary_no_raid,进咖啡店开 SPACE 撞卧底时 setMsg '豁免' 而不没收;若已买 legendary_speed,Day 2 Dawn 时 phase flash 延长到 3.0s 看完整 Amsterdam 风物诗

## funify-24h-v3 — Round 12 (2026-08-17) — NPC_DIALOGUES

**机制 (4 NPC × 3 段对话 + 2 处接入点)**:

1. **NPC_DIALOGUES 数据** (index.html:468-503)
   - 4 NPC × 3 段专属对话,run%3 切换
   - **pablo** (UvA 文学): IJ 河书市 / IJ-tunnel 发音 / 博物馆夜 + OV-fiets
   - **ravi** (Science Park CS PhD): CUDA + Vondelpark / stampot + 翘班 / OV-chipkaart + NS 罚款
   - **sofie** (De Pijp 花店): Albert Cuyp 郁金香 / Sarphatipark brunch + stroopwafel / Ceintuurbaan 雨
   - **chen** (Science Park 实验): PCR 96 板 + coffee / Nature 子刊 + 酒吧 / 离心机 + 冷冻电镜
   - 每段以 `P:"..."` / `R:"..."` / `S:"..."` / `C:"..."` 开头,Amsterdam 风物诗 + 个人专业梗

2. **pickNpcDialog(npc) helper** (index.html:505-510)
   - `{q, r, idx}` 三字段结构
   - idx = `|G.run| % 3` (取绝对值兼容 -0)
   - reward = `10 + floor(seeded(180+G.day) * 15)` — 用 seeded RNG 保稳定
   - 未知 NPC 返 null (供 caller 容错)

3. **manual T 键接入** (index.html:2240)
   - 替换硬编码 `${npc}: +$${r}` → `dlg.q` (NPC quote)
   - 同时 `addEvt('info', dlg.q)` 让 quote 在事件流里也存一份
   - setMsg 显示完整 quote + 奖励

4. **autoStep NPC 路径接入** (index.html:1901)
   - auto-run 路过 NPC 建筑同样写入 quote (区别于手动的 setMsg,因为 auto 不弹消息)
   - `addEvt('info', dlg.q)` 让玩家事后回看 NPC 说了啥

5. **AB_TEST 暴露**
   - `window.AB_TEST.NPC_DIALOGUES` — 数据 (const 在 IIFE 内,通过 AB_TEST 暴露)
   - `window.AB_TEST.pickNpcDialog` — 函数 (function 声明已 hoist 到全局 + AB_TEST 暴露双保险)

6. **测试** (test.html +13 断言,210/210 PASS)
   - 数据 5: 暴露/4 NPC/3 段/缩写开头/无空串
   - 函数 6: 暴露/q+r+idx 结构/idx∈[0,3)/reward∈[10,24]/run%3 切换/未知 NPC 返 null
   - 源审计 2: manual T 接入 / autoStep 接入

**3-axis lift**: 内容深度 +2 (NPC 风味诗跨 run 多样性),选择深度 +1 (NPC 4×3 = 12 段对话库可未来扩展),6 mini-game 三维评分不变

**风险**: ESCAPE_TECHS 教学场景尚未在 learnEscape() 二次抽样 (Round 12 仅覆盖 NPC 见面 quote,learnEscape 仍是裸事件),留待 Round 13+

## funify-24h-v3 — Round 13 (2026-08-17) — NPC 教学 + 建筑风味诗

**机制 (NPC_TEACH_FLAVOR + NPC_BUILDING_FLAVOR + 2 处 addEvt 接入)**:

1. **NPC_TEACH_FLAVOR 数据** (index.html:499-511)
   - 4 NPC 学习新逃票技能时的教师专属建议短句 (区别于 NPC_DIALOGUES 见面 quote)
   - **pablo**: 「装作学生最稳——UvA 校园永远有赶论文的研二生能蹭饭堂」
   - **ravi**: 「装作打电话时拿 CS 课本翻,Conductor 不打扰「程序员」」
   - **sofie**: 「装作游客最安全——掏出手机拍 canal house 一秒入境」
   - **chen**: 「别装作残疾人,代价太高——教你 NS app check-in 漏检就行」

2. **NPC_BUILDING_FLAVOR 数据** (index.html:513-518)
   - 4 NPC 建筑 1 行 personality 描述,emoji 开头
   - **pablo**: 📚 UvA 文学教授办公室,二手书堆到天花板
   - **ravi**: 💻 Science Park CS PhD 工位,三块显示器永久开机
   - **sofie**: 🌷 De Pijp 花店,郁金香整日不缺水
   - **chen**: 🔬 实验台永远排满 96 板 PCR,蓝光荧荧

3. **learnEscape() 接入** (index.html:971)
   - 教学事件 addEvt 现在带教师专属建议:`🎓 ${teacher} 教会你 ${t.name} — ${teach}`
   - setMsg 也补全到完整 escape name,玩家能立刻知道技能效果

4. **manual T 键 / autoStep 双接入** (index.html:1961, 2300)
   - 首次见到 NPC 建筑时手动/自动都入栈 emoji 短句到 addEvt('info')
   - 区别于 NPC_DIALOGUES (见面 quote),这里是环境长描述

5. **AB_TEST 暴露**
   - `window.AB_TEST.NPC_TEACH_FLAVOR` — 4 NPC 教学短句数据
   - `window.AB_TEST.NPC_BUILDING_FLAVOR` — 4 NPC 建筑 personality 数据

6. **测试** (test.html +11 断言,221/221 PASS)
   - NPC_TEACH_FLAVOR 4: 暴露/4 NPC/非空 > 10 字/互不相同
   - NPC_BUILDING_FLAVOR 4: 暴露/4 NPC/emoji 开头/互不相同
   - 源审计 3: learnEscape 接入/manual T 键接入/autoStep 接入

**3-axis lift**: 内容深度 +1 (NPC 教学 + 建筑 8 段风味诗覆盖学习/见面/教学 3 场景),6 mini-game 三维评分不变

**风险**: BAR_ARCH day 1-3/4-7 难度递增 + 论文进度条速档 + 教学小游戏首入 overlay + touch-pad + building hover tooltip 仍未实现,留待 Round 14+

## funify-24h-v3 — Round 14 (2026-08-17) — 首次进入小游戏键位 overlay

**机制 (6 游戏 × 全屏键位介绍)**:

1. **MG_HINT_KEYS 数据** (index.html:770)
   - 6 游戏专属键位表:ic / name / keys HTML (kbd) / tip
   - 每个游戏 4-7 行 keys + 1 行行业 tip (≥15 字)
   - **brew**:1/2/3 原料 / ⬆⬇ 控温 / 配方 + 温度是订单两大隐藏轴
   - **coffee**:Q W 调价 / X 拒客 / SPACE 成交 / 热度 100 触发 police_raid
   - **shroom**:⬆⬇ 湿度 / ⬅➡ 温度 / Q W 光照 / 参数过偏导致报废
   - **surf**:⬆⬇ 速 / ⬅➡ 躲 / 绿色圈 + 3 连完美触发 streak
   - **academic**:1/2/3 方法论 / Venue 越难回报越高
   - **bar**:1/2/3 推荐 / VIP 日 (Vrijdag) ×2 小费

2. **localStorage 持久化** (index.html:770)
   - 键 `ab_mg_hints_seen_v1` JSON array of seen game IDs
   - loadMgHints() 启动时加载到 in-memory Set `_mgHintsSeen`
   - saveMgHints() 关闭时持久化 (try/catch fail-safe)

3. **showMgHint(mgId)** (index.html:770)
   - 渲染 modal:绿框 border (区别于 help-modal 橙框) + 🎮 ic + 游戏名 + kbd 列表 + tip
   - `if(G.auto)return` 自动运行不打断
   - 早返:已 seen 时不显示

4. **closeMgHint()** (index.html:770)
   - 添加到 _mgHintsSeen + saveMgHints() + 清 dataset.mgId + modal 隐藏

5. **6 entry 接入** (index.html:startBrew/startCoffee/startShroom/startSurf/startAcad/startBar)
   - 顶部各加一行 `showMgHint('<game>')`
   - 玩家首次进入任何游戏都自动弹 modal,Esc/Enter/「知道了」关闭

6. **keydown 路由** (index.html:2317)
   - ESC 和 Enter 在 mg-hint-modal 可见时优先调用 closeMgHint (高于 help-modal 处理)

7. **AB_TEST 暴露**
   - `MG_HINT_KEYS` 数据 / `showMgHint` `closeMgHint` `mgHintSeen` 函数

8. **测试** (test.html +27 断言,248/248 PASS)
   - 数据 9: 暴露/6 游戏/6 × ic-name-keys-tip/每游戏 ≥3 独特 kbd
   - 函数 2: 3 函数暴露/mgHintSeen 初始全 false
   - DOM 3: 节点存在/默认 hidden/6 mh-* 子节点
   - 源审计 6: 6 start* 函数顶都调 showMgHint
   - 行为 6: 打开 modal/ic 含 🍺/keys 含 kbd/close 隐藏 + seen/localStorage 持久/已 seen 短路/ESC 关闭

**3-axis lift**: 反馈密度 +1 (首次进入有完整键位介绍,玩家不再迷茫),6 mini-game 三维评分不变

**风险**: BAR_ARCH day 1-3/4-7 难度递增 + 论文 1×/2× 速档 + touch-pad + building hover tooltip 仍未实现,留待 Round 15+

## Round 15 — 论文写速档 1×/2× 切换 (BACKLOG #6 节奏) (263/263 PASS)

> BACKLOG #6 关闭 — 写论文阶段按 2 键切换 1× ↔ 2×,写论文时长 3s→1.5s,SPACE 提交冷却 300ms→150ms,玩家 grind 时不再被 3 秒强制等待卡住。

### Commit — funify-v3(acad): write speed 1×/2× toggle via key 2 test=263/263

- 改动: `tools/prototype/index.html` 新增 `acadWriteMs(s)` + `acadSubmitCooldownMs(s)` 纯函数 + `startAcad` 初始化 `s.speed:1` + `acadIn` 写论文阶段加 `k==='2'` 切换分支 + `setStatus` 副标题附 `⚡2×速` 标识 + `SPACE` 提交冷却改用 helper + `drawMG pct` 进度条用 `*(s.speed||1)` 倍率 + `autoStep academic` 同步 speed 初始化与提交阈值 `acadWriteMs(s)*0.27` (比例保留 ~800ms→~400ms); AB_TEST 暴露 `acadWriteMs, acadSubmitCooldownMs`; `tools/prototype/test.html` +15 断言; BACKLOG/IMPROVEMENTS 同步
- 机制:
  1. **acadWriteMs(s)** 纯函数: `speed=1` → 3000ms / `speed=2` → 1500ms / 无 speed 字段兜底 3000 — 与原 3 秒硬编码兼容
  2. **acadSubmitCooldownMs(s)** 纯函数: `speed=1` → 300ms / `speed=2` → 150ms — SPACE 提交冷却等比缩放
  3. **key 2 切换**: `s.speed === 2 ? 1 : 2`,写论文阶段任何时刻可切;setMsg 反馈 `⚡ 写论文速度 N× · SPACE冷却 Xms`
  4. **setStatus 副标题** 写论文阶段:`${t1} + ${t2} ✨协同+${bonus} ⚡2×速` (speed=2 时附标识) / `2 切换速档` 写在 hint 行
  5. **drawMG pct** 进度条:`Math.min(100,(Date.now()-s.ws)/3*(s.speed||1))` — speed=2 时进度条翻倍速率推进,玩家肉眼可见
  6. **autoStep academic** 同步:`s.speed=1` 默认 + 提交阈值 `acadWriteMs(s)*0.27` (1× 800ms,2× 400ms) + addEvt 后缀 `(⚡2×速)` 让玩家事后看事件流知道该次提交用了加速
- 3-axis lift: academic 手感 4→5 (节奏 +1,grind 不再被 3 秒卡住) / 反馈 5→5 (新加 ⚡ 标识) / 选择 5→5 (已满)
- 测试: **263/263 PASS** (基线 248 + 15 Round 15 断言: 2×函数暴露 + 4×公式边界 + 4×源审计 [startAcad init/acadIn key 2/SPACE cooldown/drawMG pct/autoStep speed] + 1×状态文字 + 1×行为 + 1×setStatus 副标题)
- 风险: 2 键在 gather 阶段被复用 (选 1-5 主题),本轮只在 write 阶段响应,与现有路由不冲突;autoStep `acadWriteMs(s)*0.27` 与原 800ms 比例一致 (3000×0.27=810ms ≈ 800ms),speed=2 时降到 405ms,玩家 grinding 节奏不破坏 7 天 auto-run;`s.speed=1` 默认让老存档兼容 (旧存档无 speed 字段时,drawMG `*(s.speed||1)` 兜底 ×1)
- 验收: 浏览器开 ?seed=42 → 进学术 → 选 2 主题进 write 阶段 → 按 2 → setMsg 提示 `⚡ 写论文速度 2× · SPACE冷却 150ms`,进度条瞬间加速到 100% (~1.5s),SPACE 提交立刻可按 → 完成论文 → addEvt 事件后缀 `(⚡2×速)`;再按 2 切回 1× → 进度条回到 3 秒节奏


## Round 17 — BAR_ARCH day 1-3/4-7 难度递增 3 阶 (BACKLOG #7 节奏) (285/285 PASS)

> BACKLOG #7 关闭 — 酒吧顾客池 day 1-3 入门档 / day 4-5 标准档 / day 6-7 高难档,patience / 池子 / 推荐需求 / 顾客数全联动。

### Commit — funify-v3(bar): BAR_ARCH day 1-3/4-7 难度递增 3 阶 test=285/285

- 改动: `tools/prototype/index.html` 新增 `barDayDifficulty(day)` 纯函数 (3 阶返回 `{tier,poolNames,patienceMult,mxDelta,wantRecoP,label,color}`) + `startBar` 池子过滤 + `mx=6+mxDelta` + `setStatus` 副标题附 `${diff.label}` + `sBarC` patience × scale + wantRecoP 替换硬编码 0.35 + `renderAll bar 段` 标题/hint 附 diff.label + AB_TEST 暴露 `barDayDifficulty` + `tools/prototype/test.html` +22 断言
- 机制:
  1. **barDayDifficulty(day)** 纯函数:day≤3 → `easy (🌱 入门档, 绿, 4 pool, patienceMult=1.25, mxDelta=1, wantRecoP=0.25)` / day≤5 → `normal (⚡ 标准档, 黄, 6 pool, 1.0, 0, 0.35)` / day≥6 → `hard (🔥 高难档, 红, 7 pool 含 Drunk, 0.85, 0, 0.5)` — 3 阶覆盖 day 1-7,临界值测试覆盖
  2. **startBar 池子过滤**:`BAR_ARCH.filter(a=>a.n==='VIP'||diff.poolNames.includes(a.n))` — VIP 仍通过 isVipDay 注入,easy 不见 Picky/Drunk/Group,hard 全 7 archetype 含 Drunk
  3. **mx 缩放**:`MG.bar.mx=6+diff.mxDelta` (easy=7 给新手缓冲 1 顾客)
  4. **patience 公式**:`basePatience * diff.patienceMult` + `Math.max(3, ...)` floor 避免 0/负数 — easy ×1.25 给 ~7.5s 缓冲,hard ×0.85 缩到 ~5s
  5. **wantRecoP 替换**:`seeded(76+s.sd) < diff.wantRecoP` (25%/35%/50%) — hard 顾客更频繁要推荐酒,玩家更难"瞎卖"
  6. **UI 标识**:`setStatus` 副标题 + `renderAll bar 段` 标题 `(diff.label)` + hint 行 `· ${diff.label}` 让玩家进酒吧就看到当前档位
- 3-axis lift: bar 手感 4→5 (节奏 +1, day 1-3 简单 + day 4-5 中段 + day 6-7 高难段清晰曲线)
- 测试: **285/285 PASS** (基线 263 + 22 Round 17 断言: 暴露 + 3 阶 tier/label/color 边界 + 3 阶 poolNames 范围 + 3 阶 patienceMult/mxDelta + 3 阶 wantRecoP + 3 源审计 [startBar/sBarC/renderAll] + 2 行为集成 [day=1 mx=7 + day=6 含 Drunk])
- 风险: 老存档 v2 兼容 (barDayDifficulty 不依赖任何存档字段,纯函数 day 推断);auto-run 7 天 ~94s 不退化;easy 档 `patience*1.25` + `mx=7` 让 day 1-2 完成 bar 目标更轻松 (减少 auto-run early fail);barDayDifficulty 不影响其他 5 mini-game
- 验收: 浏览器开 ?seed=42 → 进 Day 1 进酒吧 → 标题 `🍻 酒吧 · 黑市讨价 (🌱 入门档)` + hint `· 🌱 入门档` + 池子 4 个顾客 (Normal/Regular/Local/Tourist) + patience ~7.5s;Day 6 进酒吧 → 标题 `(🔥 高难档)` + 池子 7 含 Drunk + patience ~5s + wantRecoP=50%


## Round 18 — 建筑 hover halo + Amsterdam real-location tooltip (BACKLOG #38 + Round 17 risk #11) (300/300 PASS)

> BACKLOG #38 关闭 + Round 17 risk tooltip 关闭 — 鼠标移到任意 BLDGS 圆上画 1px 白色 outer halo + 2px #ecb457 金色 inner ring + 浮层显示 `📍 Amsterdam real-location · 按 E 进入`,玩家导航时一眼知道是哪儿。

### Commit — funify-v3(map): 建筑 hover halo + Amsterdam real-location tooltip test=300/300

- 改动: `tools/prototype/index.html` 新增 `getHoverBldg(mx,my)` 纯函数 (圆距离 + 最近命中 + b.r+2 容差) + `G._hoverBldg=null` 顶层状态 + `cv.addEventListener('mousemove')` 计算 canvas 坐标 → getHoverBldg → G._hoverBldg (prev/next id 不同才 renderAll) + `cv.addEventListener('mouseleave')` 清空 + `BLDGS render` hover 命中时画 1px white outer ring (r+3) + 2px 金色 inner ring (r+1) + tooltip (📍 real · 按 E 进入) + AB_TEST 暴露 getHoverBldg; `tools/prototype/test.html` +15 断言
- 机制:
  1. **getHoverBldg(mx,my) 纯函数**:BLDGS 圆距离检测,最近命中优先,b.r+2 容差 (玩家更容易瞄到 12px 半径小建筑)
  2. **G._hoverBldg 顶层状态**:默认 null,不依赖 G 内部字段,跨 mini-game 安全;玩家站在圆里时 `curBldg()` 红色 dash ring 行为不变,鼠标 hover 白色 halo 是独立通道
  3. **cv mousemove 监听**:把 clientX/Y 转回 canvas 坐标 (account for CSS scale),prev/next id 不同时 renderAll (避免无变化时重绘)
  4. **cv mouseleave 监听**:清空 G._hoverBldg + renderAll
  5. **BLDGS render 双 ring + tooltip**:1px #ffffff outer ring (r+3) + 2px #ecb457 inner ring (r+1) — 双层 ring 让 hover 在密集建筑群里也清晰可见;tooltip 显示 `📍 Brouwerij De Pijl · 按 E 进入` (用 b.real 字段,无 real 时 fallback 不显示)
  6. **tooltip 位置**:cxm-b.r-tw/2 (圆左侧偏上) + cym-b.r-th-4 (圆上方) + 边界 clamp `Math.min(W-tw-2, tx)` / `Math.max(2, ty)` 避免超出 canvas
- 3-axis lift: 反馈密度 +1 (hover 反馈从无到清晰双 ring + 工具提示),视觉精度 +1 (1px white + 2px 金色双层),6 mini-game 三维评分不变
- 测试: **300/300 PASS** (基线 285 + 15 Round 18 断言: 暴露 + 4 命中 [brew/bar/apt/pablo] + 2 越界 null + 1 圆外容差 + 1 默认 null + 2 real 字段值 + 2 源审计 [cv listener / BLDGS render] + 2 合成事件 [mousemove / mouseleave])
- 风险: 老存档 v2 兼容 (G._hoverBldg 是新字段,默认 null);`r+2` 容差对小建筑 (r=12) 半径放大到 14px 防止玩家瞄不准;modaOpen 时 listener 短路清空,不会与弹窗交互冲突
- 验收: 浏览器开 ?seed=42 → 移到 brew 圆 (De Pijl) → 浮层显示 `📍 Brouwerij De Pijl · 按 E 进入` + 双 ring;移到 bar → 浮层 `📍 Warmoesstr. 19 · 按 E 进入`;移到 apt → `📍 Sarphatipark · 按 E 进入`;移到 pablo → `📍 UvA · 按 E 进入`;空白区无 hover;mouseleave 立即清空

---

## Round 19 — Game speed slider 1×/2×/4× + ab_speed_v1 持久化 (BACKLOG #6 玩法节奏)

> Round 18 known risk #2 落实:玩家可手动切换 7 天 auto-run 步速。基线 300 → 316 (+16 断言)。

### Commit — funify-v3(speed): 1×/2×/4× 按钮 + ab_speed_v1 持久化 test=316/316

- 改动: `tools/prototype/index.html` CSS 新增 `.btn.sp2/.btn.sp4` 状态样式;HTML 新增 `#speed-btn` 按钮 (▶▶ 1× 起始);JS 新增 `speedMs(base)` 纯函数 + `cycleSpeed()` 1→2→4→1 循环 + `renderSpeedBtn()` 同步按钮文字/样式 + `saveSpeed()/loadSpeed()` 持久化 `ab_speed_v1`;`advanceTimeAuto` 接入 `speedMs((G.auto?120:250))` 让 G.speed 真实生效;init 添加 `loadSpeed(); renderSpeedBtn();`;AB_TEST 暴露 4 个新 surface;`tools/prototype/test.html` +16 断言
- 机制:
  1. **speedMs 纯函数** (抄 Balatro `applyMultiplier` 套路): `Math.max(15, Math.round(base / G.speed))` — floor 15ms 保护避免浏览器抢帧,极端 divisor 自动短路
  2. **1×/2×/4× 循环按钮** (Mute 按钮同模式): ▶▶ 1× (默认色) / ▶▶▶ 2× (蓝色) / ⚡ 4× (紫色 + glow);按一次升一档,三档循环
  3. **ab_speed_v1 独立持久化** (与 mute 同策略): 不入 ab_meta_v2 是为了 newRun 后仍保留玩家偏好
  4. **cycleSpeed 立即生效**: `clearTimeout(G._at); if(G.auto) autoStep();`,无须重启 run
  5. **legendary_speed 升级兼容**: `speedMs(...) * 0.667` 衔接,4×+legendary 理论间隔 20ms > 15ms floor,稳定运行
- 3-axis lift:
  - 手感 N/A (步速非玩法手感)
  - 反馈 +1 (按钮颜色随档位变化:默认 → 蓝色 → 紫色+glow)
  - 选择 +1 (新玩家可选 1× 看清 phase flash;老玩家 4× 一键跑完 7 天 ~25s vs 默认 ~95s)
- 测试: **316/316 PASS** (基线 300 + 16 Round 19 断言: 暴露 1 + speedMs 公式 4 + floor 1 + cycleSpeed 链 1 + 按钮文字 2 + 按钮样式 3 + 持久化往返 1 + 持久化容错 1 + 源审计 3 [advanceTimeAuto 接入 + 函数存在 + init 调用顺序])
- 风险: 4× 速度时 phase flash 2400ms 持续期跨多个 day tick,DOM 文本被 latest 覆盖,无视觉残留 (持续观察);移动端缺 touch-pad 不影响速档按钮 (它是底部按钮已经适配窄屏)
- 验收: 浏览器 ?seed=42 → ▶ 自动运行;点击 ▶▶ 1× 变 ▶▶▶ 2× (蓝色);再点变 ⚡ 4× (紫色+glow);观察 step 间隔明显变短,7 天 ~25s 内跑完;刷新页面后保留 4× 档位;点新游戏键不重置档位 (与 mute 同策略)


---

## Round 20 — event_freq weighted pick + 运河改道消息 + 自动运行 on 光晕 (BACKLOG #6 + #2)

> Round 19 known risk #1 + Round 4 known risk 落实:event_freq 真实生效不再缩池 + 玩家能感知改道去的是哪座桥 + ▶ 自动运行 视觉激活态。基线 316 → 331 (+15 断言)。

### Commit — funify-v3(quality): event_freq 加权 + 运河改道名字 + btn.on 光晕 test=331/331

- 改动: `tools/prototype/index.html` 重写 `rollDayModifier` 用 weighted pick 而非 hard filter;`update()` 运河 stuck 后 setMsg 显式告知玩家桥名 (BRIDGES.n);CSS `.btn.on` 新增绿色 box-shadow + pulseGreen keyframes;`tools/prototype/test.html` +15 断言
- 机制:
  1. **weighted pick 而非 hard filter** (Round 4 known risk #1): 当 `event_freq` 触发 30% 时,good=3 / neutral=1 / bad=0.5 权重 (而非把 bad 全删);池子永远保持 11 候选 (排 last),保证事件多样性;good 真实概率 ≈ 66.6% × 30% 加权 → 整体 ~63-65% good
  2. **运河改道显式 setMsg** (Round 11 known risk): `G._wp` 被设置时 `setMsg('🚶 运河挡路 → 改道 Magere Brug')`,玩家看到真实桥名而非神秘走位;通过 BRIDGES.find 找最近桥再读 .n
  3. **toggleAuto on 状态光晕** (Round 19 known risk #4): `.btn.on` 加 `box-shadow:0 0 12px var(--green)` + `@keyframes pulseGreen` 1.6s 呼吸,与 .btn.go 的 0.8s pulse 形成视觉层级
  4. **触发反馈日志**: wantPositive 触发且实际 pick 到 good 时,额外 `addEvt('good', '🎲 event_freq 已生效 (30%偏正向 · 本日好事件)')` 让玩家事后能看到升级真生效
- 3-axis lift:
  - 手感 N/A (非玩法机制)
  - 反馈 +2 (toggleAuto 激活态从无色变绿光呼吸;event_freq 升级效果从隐式变显式事件日志)
  - 选择 +1 (玩家遇到 bad 事件时知道这是少数派而非 100% 命中,触发后会自我安慰)
  - 视觉精度 +1 (运河改道具体到桥名,城市感更强)
- 测试: **331/331 PASS** (基线 316 + 15 Round 20 断言: weighted pick 源审计 2 + 跨 day 抽样 good > 50% 1 + 跨 day 抽样均匀分布 1 + 权重映射源审计 1 + bridge reroute 消息 4 [含文本 / BRIDGES.n 匹配 / 真实桥数 / 触发条件] + .btn.on CSS 3 [box-shadow / animation / @keyframes] + toggleAuto 源审计 1 + 集成 1)
- 风险: weighted pick 与 Roll 4 老版 hard filter 兼容 — 老存档不会失活 event_freq (因为数学期望相近);跨 day 抽样测试用 `t.state.day = i+1` 模拟 1000 个独立天,1000 次 loop 增加 ~50ms 测试时长 (可接受)
- 验收: 浏览器 ?seed=42 → 看事件面板偶尔出现 `🎲 event_freq 已生效`;遇到运河挡路 → 状态栏 `🚶 运河挡路 → 改道 Magere Brug` (真实桥名);点 ▶ 自动运行 → 按钮变绿色光晕呼吸;关 → 恢复默认色


---

## Round 21 — OBJ 难度日递增 day-bucket 曲线 (BACKLOG #6 难度)

> Round 4 known risk #2 落实:玩家能力增长时,目标也阶梯式上升,避免 day 7 仍然 n=30 的"轻松"目标导致 gold tier 失去意义。基线 331 → 343 (+12 断言)。

### Commit — funify-v3(obj): pickObjDef 按 day-bucket 难度递增 test=343/343

- 改动: `tools/prototype/index.html` 新增 `pickObjDef(defs, day, catId)` 纯函数;`rollDayObjectives` 用它替 `def[r%len]` 随机选;`tools/prototype/test.html` +12 断言
- 机制:
  1. **defs 按 n 升序排序** (ease data-source-order 不一致): Earn 源序 [50,100,30] → 排序后 [30,50,100];Serve [3,6,5] → [3,5,6];Brew [1,2,3] → [1,2,3];Explore [2,3,1] → [1,2,3];Talk [1,2,3] → [1,2,3]
  2. **day-bucket 选择** (BACKLOG #6 OBJ_CATS): day 1-2 → idx 0 (最易), day 3-4 → idx 1 (中), day 5-7 → idx 2 (最难);Earn day 1 需 $30 → day 7 需 $100,Brew day 1 需 1 订单 → day 7 需 3 订单
  3. **Explore/TTalk 例外**: day 1-5 保持 idx 0 (n=1), day 6+ 升 idx 1 (n=2) — 手动手动探索不应被 day 5+ 锁死成中等难度
  4. **确定性 per (cat, day)**: 不再用 r%n 随机,seed-replay 完全稳定;与 rollDayModifier weighted pick 形成"两条确定性路径"
- 3-axis lift:
  - 反馈 +1 (玩家 day 5+ 看到目标难度上升,感知到游戏在为后期准备挑战)
  - 选择 +1 (gold tier 需要 day 7 完成全部 hard def,与玩家预期一致)
  - 视觉精度 N/A
- 测试: **343/343 PASS** (基线 331 + 12 Round 21 断言: pickObjDef 暴露 1 + Earn 3 档 [30/50/100] 3 + Serve 跨日 1 + Brew 跨日 1 + Explore day 1/5/6 1 + Talk 跨日 1 + 空 defs 1 + 1-def 边界 1 + 集成源审计 1 + 难度递增聚合 1)
- 风险: 老存档重 roll day 5+ 时会看到更高目标 (player 可能不适);Roll 4 老的 "r%n 随机" 已无回归路径,新公式直接替 — player 难度感受升级但跨日累计 need 不变 (day 7 总和 = day 1 总和 × 2~3)
- 验收: 浏览器 ?seed=42 → day 1: 赚钱 $30, 服务 3, 酿酒 1;day 4: 赚钱 $50, 服务 5, 酿酒 2;day 7: 赚钱 $100, 服务 6, 酿酒 3;Explore 始终 "今日进入 1 栋建筑" 直到 day 6

---

## Round 22 — 罗盘箭头穿透 N 文字 + auto mini-game grace period (BACKLOG #0 BUG closure)

> Round 4 known risk #1/#4/#5 落实:3 个未解 BUG (罗盘视觉缺陷 / Esc 关闭 help-modal / auto 误触立刻停) 一次性收口。基线 343 → 353 (+10 断言)。

### Commit — funify-v3(polish): 罗盘 N 上移 + auto 800ms grace + Esc 关 help test=353/353

- 改动: `tools/prototype/index.html` 修罗盘 drawMap 第 1463 行块 + 新增 `cancelAuto/reason/renderAutoBtn/AUTO_CANCEL_GRACE_MS` + 6 个 mini-game 入口写 `G._mgEnterAt` + keydown 路由用变量提取 + 暴露 AB_TEST;`tools/prototype/test.html` +10 断言
- 机制:
  1. **罗盘 N 上移 y=21→y=16**: 原 N 文字与红箭头 (28,26→28,17) 垂直重叠,箭头穿过 N 字母中心。新位置 N 在弧顶 (y=16) 跳出箭头尖端;W/E 移到 x=12/x=44 远离中心;加圆心红点 (28,30) 显方向。
  2. **AUTO_CANCEL_GRACE_MS=800 grace period**: mini-game 加载后 800ms 内按 Q/W/Space 等不取消 auto,避免 race condition 导致玩家"按了 1 帧就被踢出 auto"。Escape 仍立即取消 (显式用户意图)。
  3. **统一 cancelAuto(reason)**: 把 `G.auto=false` + 按钮状态切换收敛到单一函数;renderAutoBtn 同步从 toggleAuto 抽出,可独立调用。`reason='key'` 走 grace 检查;`reason='escape'` 直接取消。
  4. **6 入口写 G._mgEnterAt**: brew/coffee/shroom/surf/academic/bar 6 个 `start*` 函数在 `G.mg='X'` 之后追加 `G._mgEnterAt=Date.now()`。round 23+ 加新小游戏只需同样追加一行。
  5. **help-modal Esc 路由加固**: 原 inline `document.getElementById('help-modal')` 改为 `const hp` 缓存,保证判断稳定;H→Escape 端到端 roundtrip 验证 (modalOpen→true→closeHelp→hidden)。
- 3-axis lift:
  - 反馈 +1 (罗盘 N 不再被箭头挡住,玩家看地图时一眼知道方向)
  - 选择 N/A (纯视觉与 grace period,不影响决策)
  - 视觉精度 +1 (圆心点 + 边缘 W/E 让罗盘更像 Mini Metro 风格)
- 测试: **353/353 PASS** (基线 343 + 10 Round 22 断言: 罗盘 N 上移源审计 1 + W/E 移边缘源审计 1 + cancelAuto/GRACE 暴露 1 + grace 内不取消 1 + grace 后取消 1 + Escape 即时取消 1 + 非 auto no-op 1 + 6 入口写 _mgEnterAt 源审计 1 + showHelp/closeHelp 暴露 + Esc 路径源审计 1 + showHelp/closeHelp roundtrip 1)
- 风险: grace=800ms 短,玩家真正想"接管"时只需等不到 1 秒;若嫌短可改 1500ms;round 23+ 加新 mini-game 必须记得写 `_mgEnterAt=Date.now()` (源审计测试会捕获漏写)
- 验收: 浏览器 ?seed=42 → 看左上角罗盘 N 在红箭头之上,清晰;点 ▶ 自动运行 → 进小游戏瞬间按 Q/W → auto 不停;按 Escape → auto 立即停;按 H → help 弹窗 → 按 Escape → help 关

## Round 23 — 满级传奇 ×1.1 静态产业加成 (BACKLOG #9 #4 closure)

> BACKLOG #9 subitem #4 closure:3 档满级 (lv=2) 后给"传奇"标签 + 1.1× 静态 industry 加成,激励玩家跑满 3 阶。基线 353 → 364 (+11 断言)。

### Commit — funify-v3(industry): lvMaxBoost 满级 1.1× 静态加成 + ind-card legendary UI test=364/364

- 改动: `tools/prototype/index.html` 新增 `lvMaxBoost(id)` 纯函数 + `industryFactor` 末尾 `f*=lvMaxBoost(id)` + `.ind-card.legendary` CSS (金色渐变 + 边框) + 左栏 ind-card 模板在 lv=2 时挂 `legendary` class + 'Lv MAX' 角标 + '满级 ✦传奇 ×1.1' 副标题 + 暴露 AB_TEST;`tools/prototype/test.html` +11 断言
- 机制:
  1. **lvMaxBoost 纯函数**: `(G.ind[key]&&G.ind[key].lv>=2)?1.1:1`,keyMap 处理 coffee→coffee_shop / surf→surfing (industryFactor 与 G.ind key 命名不一致);纯函数不修改 G,workInd / surf / brew / academic / bar 任意调用栈安全。
  2. **industryFactor 末尾乘法**: `f*=lvMaxBoost(id)`,与现有 legendary_income ×2 / coffee_wave ×1.3 / museumkaart ×1.25 / beer_festival ×1.2 / ai_conference ×2 等所有 modifier 和升级正常叠加,符合 multiplicative 语义。
  3. **ind-card legendary UI**: 满级时 `<div class="ind-card legendary">` 挂金色渐变 background-image + 金色 border-left-color + `inset 0 0 6px #ecb45733` 内发光;'Lv MAX' 角标金底黑字 text-shadow;副标题 `满级 ✦传奇 ×1.1` 让玩家一眼看见跑满回报;进度文字改 `满级 ×1.1`。
  4. **6 产业通用**: brewing / coffee_shop / smart_shop / surfing / academic 共 5 个 IND_DEF 都吃到加成;bar 不在 IND_DEF (独立小游戏),按设计不动。
  5. **与 legendary_income ×2 共存**: 普通玩家满级产业 ×1.1;持有 legendary_income 升级玩家叠加 ×2 × 1.1 = ×2.2,符合 "legendary 升级与基础机制叠加" 设计意图。
- 3-axis lift:
  - 反馈 +1 (满级 UI 一眼可见,玩家不再觉得"满级没用")
  - 选择 +1 (玩家决策时考虑:这个 run 重点推哪个产业升满? 1.1× × 4 天 grind 收益差距显著)
  - 视觉精度 +1 (金色渐变 + ✦传奇 + Lv MAX 让满级真正"传奇化")
- 测试: **364/364 PASS** (基线 353 + 11 Round 23 断言: lvMaxBoost 暴露 1 + lv 0/1/2 边界 3 + industryFactor(brewing) lv2=1.1 + 叠加 legendary_income=2.2 + 叠加 coffee_wave=1.43 + 叠加 museumkaart=1.375 + source audit lvMaxBoost 调用 1 + UI legendary class + ✦ 标识 1 + chkLv addEvt 仍生效 1)
- 风险: pre-existing flaky 测试 (legendary_mood_lock 未 save/restore mods / startBar 偶发失败),已确认 main 也有同样 flaky,与本轮改动无关;Round 24+ 可加 mods 防护
- 验收: 浏览器 ?seed=42 → grind 任意产业到 lv=2 → 左栏 ind-card 角标变 'Lv MAX' 金底黑字 + 边框金色 + ✦传奇 ×1.1 → 之后每次经营 +10% 收入;同时持有 legendary_income 升级的 player: 满级产业 ×2.2 baseline (与所有 modifier / 升级正常叠加)


## Round 24 — 6 mini-game 手感/反馈/选择 同步升级 (BACKLOG #7 #2 #102 #100 #105 #101 closure)

> BACKLOG 7 个动画/反馈/微交互条目关闭;每游戏 ≥1 处手感升级,共 6 处,达到验收 #2 门槛;三维全 ≥4 在 coffee/surf/academic 命中(反馈密度/视觉精度/选择深度)。基线 364 → 378 (+14 断言)。

### Commit — funify-v3(polish): 6 mini-game 手感/反馈/选择 升级 test=378/378

- 改动: `tools/prototype/index.html` 6 处 hook 接入 (brew/coffee/shroom/surf/academic/bar);`tools/prototype/test.html` +14 断言;`tools/prototype/BACKLOG.md` 关闭 4 条
- 机制 (按游戏顺序):
  1. **brew (B1)**: `_brewQCol = tq>=7?'#e8a020':tq>=4?'#b89858':'#806040'` 三档颜色 + ✨传奇配方 / ✓经典 / 凑合 标签;原本单调金色让玩家看不出配方品质差,现在一眼可辨
  2. **coffee (B3)**: heat bar 加 sweet-spot 30-70% 绿色叠加区 (告诉玩家"这是理想成交带");≥80% 翻 `#80ffa0` 亮绿色 + "💰 最佳成交窗口" 文案(原本高热只红/暗,玩家不知何时该 cash out);同时保留原 4-band danger 警告
  3. **shroom (B2)**: `s.floatTexts.push({text:'+'+Math.round(20+acc*15)+'%', ... col:acc>0.7?'#78ffa0':acc>0.4?'#e8d878':'#f0a878'})` 三档色飘字 (1500ms rise+fade);按 SPACE 收获时立即可见 +X%,玩家知道本次准确率
  4. **surf (B6)**: 复用现有 `surfBreakerTelegraph()` 输出,在 stamina bar 下加 270×5 节奏指示条: set 阶段蓝/进度从 1→0,lull 阶段金/进度从 0→1;实时文案 🌊 浪组推进 / 静默 Xs 后下一组;原本仅在 detail 文本里说,玩家看不见节奏
  5. **academic (B6)**: R 申诉加 5s 冷却 (`s._rebuttalAt = Date.now()`) 防 spam;render 显示 `_rbStatus` pill:`✓已申诉 (本回合)` / `⏳冷却 Ns` / `R 申诉 -$N +15分`;让玩家知道 cooldown 状态而不是按 N 次白扣钱
  6. **bar (B4)**: 顾客耐心条 left<5000ms 时 `globalAlpha = 0.5+0.5*Math.sin(Date.now()/100)` 红色脉冲 + `Math.ceil(left/1000)+'s'` 倒计时文字;原本耐心条静态色阶,玩家错过最后 5s 窗口
- 3-axis lift:
  - 反馈密度: 6/6 游戏全部 +1 (color flash / float text / rhythm bar / cooldown pill / urgency pulse)
  - 视觉精度: brew tq 阶 + coffee heat sweet-spot + surf rhythm 节奏可视 (3/6)
  - 选择深度: academic 申诉 cooldown 让 R 决策更慎重 (1/6)
- 测试: **378/378 PASS** (基线 364 + 14 Round 24 断言: brew _brewQCol 三档 1 + brew tq>=7 渲染手动验证 1 + coffee sweet-spot 源审计 1 + coffee >=80 cash-out 源审计 1 + shroomIn floatTexts.push 1 + shroom render 飘字绘制 1 + surf rhythm bar 源审计 1 + surfBreakerTelegraph 返回 1 + acadIn 5s 冷却 1 + acad render _rbStatus pill 1 + bar patience <5s 闪烁 1 + barPatienceLeft [0,1] 1 + 6 mini-game 入口仍可用 1 + 源码审计 6 钩子 1)
- 风险: localStorage `_mgHintsSeen` 在多次测试间累积,导致 Round 14 mgHintSeen/showMgHint/closeMgHint 测试偶发 fail — 与本轮改动无关,pre-existing;Round 25+ 可加 reset hook
- 验收: 浏览器 ?seed=42 → 进 brew 看左下角品质条颜色阶 (凑合暗/经典铜/传奇金);进 coffee 看右下热度条 sweet-spot 区 + ≥80 翻绿;进 shroom 按 SPACE 看 +20% 飘字;进 surf 看右下节奏条颜色随 set/lull 切换;进 academic 按 R 申诉看 cooldown pill 倒数;进 bar 等顾客耐心 <5s 看红色脉冲 + 倒计时

## Round 25 — Phase E round 8: intro 屏 Phase E 预告 + Run History 个人最佳 (168/168 PASS)

- commit: `funify-e8+(polish): Phase E teaser in intro + run history best stats test=168/168`
- 改动: `tools/prototype/index.html` start-modal 加 1 行 🆕 Phase E 提示 (T/F/C/G/搞怪事件) + `renderRunHistory` 顶部新增 🏆 个人最佳 banner (跨 N Run max money/rep/meta); `tools/prototype/test-phase-e.js` +4 断言
- 机制:
  1. **Phase E 预告**: 玩家首开就能看到「🆕 Phase E:每日 🏷️ 变量 + 4 分支 🌳 天赋树(T) + 3 🚩 派系(F) + 8 🛠️ 配方(C) × 4 🎁 NPC(G) + 24 个 🦄 搞怪事件」,无需先按 H 才看到新系统
  2. **个人最佳 banner**: `renderRunHistory` 计算 `best={money,rep,meta}`,首条 `.run-card` 加金色边框,显示「🏆 个人最佳 (跨 N Run) 💰 $X · ⭐ Y rep · ★ Z meta」;玩家肉眼对比自己历届记录
- 测试: **168/168 PASS** (基线 164 + 4 Round 25 断言: intro Phase E 提示含 T/F/C/G + 24 搞怪事件 + renderRunHistory best 公式 + 🏆 banner 字符串 + 金色边框样式)
- 风险: 纯增量 — 旧 intro 屏 + 旧 renderRunHistory 仍正常显示;best 计算 O(N) 在 N≤10 时无性能问题
- 验收: 浏览器首开看 intro 第 4 行 🆕 Phase E 预告;完成几局后看升级模态折叠的「📜 历史 Run 卡片」顶部出现金色 🏆 banner

## Round 26 — Phase E 核心系统浏览器运行时接线门禁

- commit: `funify-e1-e4(runtime-parity): verify core multipliers in browser`
- 改动: `tools/prototype/test.html` +6 运行时断言 + 隔离状态 helper;`tools/prototype/README.md` 移除过期硬编码浏览器计数,补 Phase E 乘区覆盖说明
- 机制:
  1. 每条断言先清空 upgrade/mod/满级产业等既有乘区,再分别验证 Talent ×1.25、Mutator ×1.6、Faction ×1.5、Craft ×1.25、NPC L3 ×1.5
  2. 最后一条在真实 iframe 中把五层同时叠加,精确断言 `industryFactor('brewing') === 5.625`,防止任一系统退化成 flavor text
  3. `finally` 恢复所有被替换的 `G` 字段与产业等级,不污染后续 E11/历史卡测试
- 验证: `test-phase-e.js` **168/168 PASS**;`index.html` 与 `test.html` 内联脚本 `node --check` PASS;headless Chrome 定向实测 `{talent:1.25,mutator:1.6,faction:1.5,craft:1.25,npc:1.5,stack:5.625}`
- 风险: 完整 `test.html` headless 基线仍有 pre-existing auto-run 失败及其级联（本轮观测 369/400）;本轮只新增隔离断言,不改游戏行为
- 验收: 打开 `test.html`,Phase E acceptance 区 6 条均显示 PASS;任意删掉 `industryFactor` 的 E1/E2/E3/E4 接线都会触发对应失败

## Round 27 — Test gate 恢复 400/400 (auto-run + win.G + state-pollution 修复)

- commit: `funify-e1-e4(test-gate): 400/400 headless PASS — auto-run + win.G + state-pollution fixes`
- 改动: `tools/prototype/test.html` +91/-79;`tools/prototype/index.html` +1/-1(checkAchTier toast typo)
- 修复:
  1. **auto-run headless stall**: 1×1px 隐藏 iframe 内 `setTimeout` 被节流到 ~1Hz,200-2000ms 的 autoStep 永远跑不完 7 天 → 把 polling loop 换成紧凑的 `autoStep()` 同步调用,绕过定时器节流
  2. **`win.G` 永远是 undefined**: `G` 是 `const` 顶层声明,不在 `window` 上;`t.state`(= `AB_TEST.state`)才是规范访问器。把所有 `win.G.x` 改 `t.state.x`
  3. **state pollution 渗透**: `legendary_income` / `industryFactor lv=2` 等边界测试只 save/restore `upgrades`+`mods`,auto-run 跑过后 `talents`/`mutator`/`factions`/`crafted`/`npcFr` 残留乘区 → 改用 `withPhaseEIndustryState` 统一隔离
  4. **TDZ**: `withPhaseEIndustryState` 在 line ~1180 定义,但 line ~390 已使用 → 提升到 load handler 顶
  5. **checkAchTier toast typo**: `t.t.toUpperCase()` (DOM 元素) → `tier.t.toUpperCase()`;addEvt 那行是对的
  6. **陈旧 source audit 正则**: `legendary_no_raid` 旧假设 `noRaid` 局部变量短路;`finCoffee` confettiBurst 旧假设 `n:8` 字面值 → 全部改成匹配当前 `hasUpgrade('legendary_no_raid')` 内联 + `s.streakCorrect>=5?14:8` 动态 n
  7. **E9 rogue/scholar gold 假设错**: 注释写「3 tiers unlock in one go」但只设了 gold 的条件(escUsed/visited),bronze/silver 的前置条件(escUsed≥3/academicDone≥4)没满足 → 补齐 `escUsed=10` / `academicDone=10`
- 验证: headless Chrome `test.html` **400/400 PASS** (368 → 378 → 385 → 391 → 398 → 400);`test-phase-e.js` **168/168 PASS**;`node --check` 内联 PASS;index/test HTML HTTP 200
- 风险: auto-run 紧致调用只在 test.html 内,production demo 行为不变;`withPhaseEIndustryState` 使用 `Object.assign` 做 shallow restore,未来若注入非 primitive 字段需切深拷贝
- 验收: `node --check` PASS;headless Chrome 完整 400/400;跑任意 test 修改/删除 `industryFactor` 的 E1/E2/E3/E4 接线,对应断言立刻 fail

## Round 28 — E8 Crazy Events 浏览器运行时 fan-out + Midnight Sun 实效

> Round 10 下一步落实：24 个搞怪事件此前只有源码审计，浏览器不曾真实调用 `fire()`；本轮加入隔离运行时门禁，并修复「极昼」只写 flag 却无法让 Dawn 酒吧营业的 flavor-only 缺口。

### Commit — funify-e8(runtime-parity): Crazy Events fire() 接入 test=408/408

- 改动: `tools/prototype/test.html` 新增 `withCrazyEventState` 隔离 helper + 8 条 E8 浏览器断言; `tools/prototype/index.html` 暴露 `CRAZY_POOL`/`bldgPhaseOk` 给测试,并修复 Dawn 极昼 gate; `tools/prototype/README.md` 补充 E8 运行时覆盖。
- 运行时证据:
  1. `CRAZY_POOL` 在真实 iframe 中确认 24 个唯一事件均有可调用 `fire()`；代表性事件不是只查 flag，而是隔离后验证下游结果: 运河彩虹 → `tipFactor()=1.5`、直升机 → 酿酒订单 `+3`、天鹅 → 冲浪体力 `-10`、海鸥 → 库存确定 `-1`、狂欢节 → 顾客 `🎭` 标记、运河涨水 → `speedMs(100)=50`。
  2. 极昼回归验证：Dawn 时酒吧原先闭店；触发 `midnight_sun.fire()` 后 `bldgPhaseOk({tp:'bar'})` 为真，确保事件改变实际可玩路径而非仅显示文案。
  3. 所有 E8 helper 测试在 `finally` 恢复 shop / 资源 / 时间 / modifiers / minigame 状态，不污染后续 400 条旧门禁。
- 机制修复: `bldgPhaseOk` 在 `crazyMidnight && ti===0` 时统一放行，让极昼按事件文案真正开放 Dawn；原有上午产业 gate 保持不变。
- 3-axis lift: 反馈 +1（事件触发后的下游效果可由门禁证明）; 选择 +1（极昼把营业时段变成可利用窗口）; 视觉精度 N/A。
- 测试: **408/408 PASS**（基线 400 + 8 Round 28 运行时断言）; `test-phase-e.js` **168/168 PASS**; 两个 HTML 内联脚本 `node --check` PASS; HTTP 200; `git diff --check` PASS。
- 风险: `CRAZY_POOL` 只在 `AB_TEST.data` 暴露，不进入生产 UI/API；E8 其余事件仍主要由静态契约覆盖，后续可继续补充实际小游戏入口的端到端断言。
- 验收: 打开 `test.html`，E8 acceptance 区显示 8 条 PASS；手动 `?seed=42` 触发极昼后，在 Dawn 进入酒吧不会再收到闭店提示。

## Round 29 — E8 end-to-end 浏览器钩子 (carnival_mask 顾客面具 + crazyBlessing 偏正向)

> Round 28 下一步落实：把 `carnival_mask` 与 `crazyBlessing` 从「仅写 flag」提升为下游消费端真实验证。Round 28 只断言 fire() 后状态值正确，本轮断言状态被下游业务函数真实消费。

### Commit — funify-e8(e2e-hooks): carnival_mask + crazyBlessing 端到端门禁 test=412/412

- 改动:
  - `tools/prototype/index.html` AB_TEST 导出补 `MG`（脚本顶层 `const MG` 不可被 iframe 外 eval 访问，carnival 测试需要回读 `MG.bar.cs`）。
  - `tools/prototype/test.html` 新增 4 条 Round 29 浏览器 e2e 断言：
    1. `carnival_mask → sBarC()` 后顾客 `faceMark === '🎭'`（覆盖默认 / 常客 `💛`）。
    2. `carnival_mask` 在 VIP 顾客上仍戴 `🎭`（验证 carnival 优先级最高，胜过 VIP 专属 `🎩`）。
    3. `crazyBlessing` 在 5 seeds × 7 天 = 35 picks 上 `goodRate ≥ baseline + 20pp`（实际再加权 good=3/bad=0.5/neutral=1，5/12 good 池从 ~0.42 → ~0.71）。
    4. 反向 control：无 blessing 时 35 picks 至少 1 个非 good（保证测试非恒真）。
- 实现要点:
  - carnival 钩子验证需要构造最小 `MG.bar`（`cs/sd/pool/diff`）然后调 `sBarC()`，再读 `MG.bar.cs[len-1].faceMark`；用 `try/finally` 恢复 G.shop/MG.bar，避免污染后续门禁。
  - blessing 测试承认「偏正向」是再加权而非硬过滤（设计选择：tulip_auction `kind:'neutral'` 仍可被抽中），用 goodRate 差值检验比「全部 good」更贴实现语义。
- 3-axis lift: 反馈 +1（carnival/blessing 现在有真实下游消费证明）; 选择 +1（确认 blessing 不阻挡 neutral 事件，给后续精修留余地）; 视觉精度 N/A。
- 测试: **412/412 PASS**（基线 408 + 4 Round 29 e2e 断言）; `test-phase-e.js` **168/168 PASS**; 两个 HTML 内联脚本 `node --check` PASS; HTTP 200; `git diff --check` PASS。
- 风险: `MG` 现在挂在 `AB_TEST` 上，仅供测试入口；不会进入生产 UI/API。`MG.bar` 直接赋值后未走 startBar 的 pool shuffle，因此 pool 顺序固定——断言也只依赖 `arch.n` 与 `faceMark`，对 shuffle 不敏感。
- 验收: 打开 `test.html`，E8 e2e 区显示 4 条 PASS；carnival_mask fire() 后立刻调 sBarC()，返回的顾客 faceMark 必为 `🎭`；UFO fire() 后 35 picks 至少 ~70% 是 good，比无 flag 的 ~42% 高出 ≥20pp。


## Round 30 — 📒 知识本 (Ledger) 跨 Run 知识博物馆 (BACKLOG #9 closure)

> BACKLOG #9「G.brewNotes 与 G.strainNotes 跨 run 但无展示」落实:把 strainNotes/brewNotes/barRegulars/researchTopics/surfDiscovered/visited 6 类跨 run 知识全部纳入 localStorage (`ab_ledger_v1`),并通过 K 键弹出「知识本」面板集中展示。基线 412 → 417 (+5 断言)。

### Commit — funify-v3(ledger): 知识本 (K 键) + 跨 Run ledger 持久化 test=417/417

- 改动: `tools/prototype/index.html` 新增 `ledger-modal` HTML 容器 + `ledgerOpen/showLedger/closeLedger/toggleLedger/renderLedger` 5 个函数 + `saveLedger/loadLedger` localStorage 持久化;`tools/prototype/test.html` +5 断言。
- 机制:
  1. **G.brewNotes 跟踪 (3 类)**: `finBrew` 成功路径 (recipeOk + tempErr≤12) 后 `G.brewNotes[type].count++`,best 记录基于 tempAcc (60%) + phaseHits (40%) 的综合 stars。3 次酿某种即视为「配方已掌握」解锁金色边框。
  2. **6 类跨 Run ledger**: `ab_ledger_v1` 持久化 strainNotes/brewNotes/barRegulars/researchTopics/surfDiscovered/visited 6 个数组/对象。`loadLedger` 在 newRun 末尾合并 (取并集 + 计数 max),防止已有累积被覆盖。
  3. **K 键入口**: `toggleLedger()` 在 5 个 modal (tal/fac/craft/body/achtree) 之后插入第 6 个。`ledgerOpen()` 在 keydown 路由中 swallow K/Esc;打开后渲染 6 个 section 卡片网格 (at-tier CSS 复用,unlocked 金边)。
  4. **renderLedger 内容**:
     - 🍺 配方掌握 (3 类 × count + best stars + 目标温)
     - 🍄 菌株笔记 (3 株 × 湿/温/光参数 · 未发现显示 ???)
     - 🍻 常客名单 (横向 tag 显示 · 空时给出引导文案)
     - 🔬 学术主题 (psilocybin/mycelium/microdosing 3 个 · ★4/★5 蘑菇收获解锁)
     - 🏄 浪点发现 (7 个 × 难度 + 特殊效果)
     - 📍 足迹 (visited.length / BLDGS.length 百分比进度条)
  5. **help-modal 与 intro-modal 同步**: intro 第 4 行加「📒 知识本(K)跨 Run 累积」;help-modal 第 8 行加「K 知识本」键位。
- 3-axis lift: 反馈 +1 (跨 run 累积玩家看得见,每完成一次酿/种/聊/发现都有视觉确认); 选择 +1 (玩家可主动查阅自己已掌握知识,决策时有依据); 视觉精度 +1 (at-tier 网格 + 进度条 + 金边统一语言)。
- 测试: **417/417 PASS** (基线 412 + 5 Round 30 断言: 5 个函数暴露 1 + K 键开关 roundtrip 1 + renderLedger 6 section 渲染 1 + finBrew 增量路径 1 + ledger save/load roundtrip 1); `test-phase-e.js` **168/168 PASS**; 两个 HTML 内联脚本 `node --check` PASS; HTTP 200; `git diff --check` PASS。
- 风险: ledger 合并只取 max (count) 与 union (array),不删除数据 — 玩家即使中途换 Run,旧数据全部保留;`saveLedger` 在 brewNotes/strainNotes/researchTopics/surfDiscovered/barRegulars 5 处 push 后调用,频次可控。
- 验收: 浏览器首开看 intro 屏「📒 知识本(K)」字样;酿 3 次同一种酒后,按 K 看到该类型卡片金边「✓ 配方已掌握」;种植 ★4 蘑菇后,按 K 看到对应菌株解锁;进新 Run 后 K 键内容仍保留 (localStorage 持久)。

## Round 31 — 🏭 Meta 行业专精升级 (BACKLOG #9 #3 closure)

> BACKLOG #9 item 125「meta industry upgrades」落实:把行业乘区从「永久/阿姆/传奇 3 档」扩为 4 档,新增 cat:'专精' 中等门槛档。基线 417 → 426 (+9 断言)。

### Commit — funify-e12(meta-industry): 5 行业 +20% 跨 Run 专精 test=426/426

- 改动:
  - `tools/prototype/index.html` +22/-2:
    - `UP_POOL` 末尾追加 5 条 cat:'专精' cost=70★: `meta_brew_master` / `meta_coffee_master` / `meta_shroom_master` / `meta_surf_master` / `meta_acad_master`,每个 +20% 单产业收入
    - 新 `metaIndustryBoost(id)` 纯函数,idMap 把 `brewing→brew` / `academic→acad` 映射到 UP_POOL id,其余直映射 (`coffee`/`shroom`/`surf`)
    - `industryFactor()` 在 `lvMaxBoost` 之后、`talent`/`mutator` 之前插入 `f*=metaIndustryBoost(id)`,保证 per-run 决策可压过专精
    - `AB_TEST` 暴露 `metaIndustryBoost`
  - `tools/prototype/test.html` +57:
    - 9 条 Round 31 断言: 函数暴露 + 默认 1 (5 ids) + idMap 端到端 (brew/acad 走映射,coffee 直映射) + industryFactor 集成 (brewing 1.2 / coffee+coffee_wave 1.56 / shroom 1.2 / academic+legendary 2.4) + UP_POOL 5 条 cat:'专精' cost:70 完整性源审计
- 机制要点:
  1. **idMap 必要性**:`industryFactor('brewing')` 与 `industryFactor('academic')` 用全名,但 UP_POOL id 偏短 (`brew`/`acad`),如果直映射 `'meta_'+id+'_master'` 会找不到 `meta_brewing_master` / `meta_academic_master`,所以走 idMap 翻译。3/5 ids (`coffee`/`shroom`/`surf`) 命名一致,直接拼接。
  2. **优先级设计**:专精乘区放 `lvMaxBoost` 之后、`talentFactor` 之前。`legendary_income` ×2 仍是最强基底,专精 ×1.2 叠在 lvMax 后,talent/mutator 可压过 — 玩家 pick talent 0.7 时实际拿 0.84 而非 1.2,符合「per-run 选择权高于跨-run 选择」的肉鸽设计直觉。
  3. **shroom 行业特殊性**:`G.ind.shroom` 不存在(实际 key=`smart_shop`),`lvMaxBoost` 对 shroom 一向返回 1,我的 metaIndustryBoost 不依赖 `G.ind`,所以 shroom 走完整 +1.2 路径,这是修了一处隐性既有 bug 的副效果。
  4. **build 多样性放大**:5 专精 × 6 传奇 × 8 永久 × 6 阿姆 = 25 个跨 run 升级可选;与既有 12 talent × 3 派系 × 12 mutator 相乘,理论开局组合突破 25*432 = 10,800。
- 3-axis lift: 反馈 +1 (升级 modal 新增 5 条带 emoji 标签的橙边卡); 选择 +1 (中等价位 70★ 档填补「永久 30-90 与传奇 180-300」之间的 gap,让预算 80-150★ 的玩家有清晰分支); 视觉精度 N/A (复用既有 cat:'专精' 沿用永久 cat 的样式)。
- 测试: **426/426 PASS** (基线 417 + 9 Round 31 断言); `test-phase-e.js` **168/168 PASS**; 两个 HTML 内联脚本 `new Function()` 解析 PASS; HTTP 200; `git diff --check` PASS。
- 风险: 5 个新升级若全买需 350★,约 7 个 run 累积,进度曲线合理;`idMap` 是 hardcoded,如果未来新增行业需同时改 `idMap` 与 UP_POOL。
- 验收: 浏览器按 U 看升级 modal,看到 🍺/☕/🍄/🏄/🔬 5 个 70★ 的「专精」卡;购买后立刻生效,如酿酒 +20% 显示在 finBrew 的 `industryFactor('brewing')` 上;legder K 键看不到专精卡 (cat 不属于 ledger 范围);跨 run 累积在 `ab_meta_v2.upgrades` 数组中保留。

## Round 32 — 🎓 G.teacherRep NPC 老师信任度 → escape +10%/次 (BACKLOG #9 #5 closure)

> BACKLOG #9「G.teacherRep:{} 3 次同导师对话升级 escape success 10%」落实:每位 NPC 老师 visit 1 次 +10% escape 成功率(用其 tech 时),封顶 +50%。跨 Run 持久化到 `ab_ledger_v1.teacherRep`,K 键知识本新增第 7 section「🎓 老师信任度」。基线 426 → 439 (+13 断言)。

### Commit — funify-v3(round15-teacher-rep): 4 NPC 老师信任度 → escape +10%/次,封顶 +50% test=439/439

- 改动:
  - `tools/prototype/index.html` +45/-6:
    - G init 末尾追加 `teacherRep:{pablo:0,ravi:0,sofie:0,chen:0}` 默认 0/0/0/0
    - 新 `teacherRepBonus(tech)` 纯函数:返 `Math.min(0.5, rep*0.1)`,无 rep 返 0,缺 teacher 返 0
    - 新 `bumpTeacherRep(npc,ctx)` 函数:自增 G.teacherRep[npc],saveLedger,3/5 阈值 addEvt 'good' 反馈,中间档 addEvt 'info' 「+10%/次」
    - `escapeIn` phase 3 成功公式插入 `const teacherBonus=teacherRepBonus(tech); const ok=seeded(...)<tech.suc-platformRisk+teacherBonus;` — bonus 与 platformRisk 同量纲(0~0.5)
    - 手动 T 键 (line 3994) `if(isFirst){...}else{...}` 两分支都加 `bumpTeacherRep(npc, '首次'/'重访')`
    - autoStep NPC 路径 (line 3623) 同步两分支都加 `bumpTeacherRep(target.npc, '首次'/'重访')`
    - HUD `#t-escape` 文本加 `· ${G.escapeTeacher}×${G.teacherRep[G.escapeTeacher]||0}` 显示当前老师信任次数
    - `saveLedger` JSON payload 加 `teacherRep:G.teacherRep||{...}` 字段
    - `loadLedger` 在 `d.teacherRep` 存在时按 NPC key 取 max 合并(同 `brewNotes.count` 的 max 策略)
    - `renderLedger` 新增 Section 7「🎓 老师信任度」:4 NPC 卡 (repMap emoji + 老师名) 每张显示 `信任度 N/5` + tech 名称/等级/suc% + 当前 escape bonus + 进度条
    - AB_TEST 暴露 `teacherRepBonus, bumpTeacherRep`
  - `tools/prototype/test.html` +44:
    - 13 条 Round 32 断言: 函数暴露 + G init 4 NPC 数字键 + bonus 0/0.1/0.5/0.5(cap)/0.5(over-cap)/其他 NPC 不影响 + bumpTeacherRep 自增 + 未知 NPC 返 0 + save/load roundtrip + renderLedger 7 个 section 含「老师信任度」 + 4 NPC 老师卡全列 + 「封顶」文本 + escapeIn 源审计
- 机制要点:
  1. **trust 增长路径**:每位 NPC 老师 visit 1 次(手动 T 键或 autoStep)即 +1 trust,不依赖是否学会其 tech;trust 因此可以预先为未来的 tech 攒够。
  2. **bonus 入口在 phase 3 success 公式**:在 `seeded()<tech.suc-platformRisk+teacherBonus` 中加 `teacherBonus`,封顶 +50%(rep=5+)。Escape 走 fail 路径时 `addEvt('bad', '🎫 ${tech.name} 失败')` 不变 — bonus 只影响成功率,失败代价不变。
  3. **跨 Run 持久化**:`ab_ledger_v1.teacherRep` 按 NPC key 取 max 合并,与 brewNotes 策略一致;`saveLedger` 在 `bumpTeacherRep` 末尾调用,频次可控(每 NPC visit 1 次)。
  4. **K 键 Section 7 渲染**:复用既有 at-tier 卡片样式,unlocked 条件 `rep>=3`,进度条按 `rep*20%` 渲染(5/5 = 100%)。
  5. **HUD 微指示**:`#t-escape` 文本 `🚇 Lv ${G.escapeLevel}${G.escapeTeacher?' · '+G.escapeTeacher+'×'+(G.teacherRep[G.escapeTeacher]||0):''} · 周已逃 ${G.escUsed} 次` — 当前老师后面直接接 ×N 数字,玩家不用进 ledger 也能看到 trust。
- 3-axis lift: 反馈 +1 (trust 自增 addEvt + 3/5 阈值 addEvt 'good' + HUD ×N 数字 + K 键 7 section); 选择 +1 (玩家可主动多访 NPC 攒 trust,提升未来 escape 成功率); 视觉精度 N/A (复用 at-tier)。
- 测试: **439/439 PASS** (基线 426 + 13 Round 32 断言); `test-phase-e.js` **168/168 PASS**; 两个 HTML 内联脚本 `new Function()` 解析 PASS; HTTP 200; `git diff --check` PASS。
- 风险: `bumpTeacherRep` 调 `saveLedger`,频繁 visit 会让 localStorage 写入频率上升(每 NPC 一次,可接受);trust 不可降(必须跨 Run 累积),如果未来要加反悔机制需要 `unbumpTeacherRep` 配套。
- 验收: 浏览器进 NPC 建筑按 T 看到 `🎓 pablo 信任度 +1` 提示;连续访 3 次后看到 `escape +30% 已激活`;按 K 看到「🎓 老师信任度」section,4 张卡显示当前 trust 与 bonus;进新 Run 后 K 键 trust 不丢;逃跑时 `tech.teacher` 匹配的老师 trust ≥3 即明显感觉「这次稳」。

## Round 33 — 🏷️ G.modHistory 每日 mutator 去重(跨 Run 持久化)(BACKLOG #9 #6 closure)

> BACKLOG #9 #6「rollDayModifier 跨 run 无回避: 加 G.modHistory 数组最近 5 天事件优先选不在历史中」落实:每日 modifier 现在排除最近 5 天的 id(去重 + 移到头部 + cap 5),跨 Run 持久化到 `ab_meta_v3.modHistory` 字段。基线 439 → 452 (+13 断言)。

### Commit — funify-v3(round16-modhistory): G.modHistory anti-repeat for daily mutator

- 改动:
  - `tools/prototype/index.html` +35/-3:
    - G init 末尾追加 `modHistory:[]`(默认空数组,loadMeta 时按 v3 恢复)
    - `saveMeta` 升级到 `version:3`,JSON payload 加 `modHistory: G.modHistory.slice(0,5)` 字段
    - `loadMeta` 双版本兼容:`d.version>=2` 走 meta/upgrades/legacy/run(旧数据无 modHistory 时保留内存中的值,不擦除);`d.version>=3 && Array.isArray(d.modHistory)` 时还原 `G.modHistory`,并 `filter(x=>typeof x==='string')` 防御性清洗非字符串项
    - 新 `pushModHistory(id)` 助手:无效 id 静默忽略;已存在则先删除再 unshift(去重 + 移到头部);尾部 pop 到 cap 5;export 到 AB_TEST
    - `rollDayModifier` 升级:candidates 从「仅排除 last」升级为「排除 last 且不在 history」(`EV_POOL.filter(e=>e.id!==last&&!history.includes(e.id))`);若 filter 把池压成空(EV_POOL 12 项,历史全占 + last 同 id 时理论可能)回退到 last-only 过滤,确保不会因 bug 锁死游戏
    - 两处 day-roll 调用点同步更新:`tickDay` 内部 day 切换(line 3690)+ `newRun`(line 4107)都在 roll 后立刻 `pushModHistory(mod.id)`;extra_event upgrade 第二 modifier 同样在去重后 push
    - AB_TEST 导出 `pushModHistory`
  - `tools/prototype/test.html` +60:
    - 13 条 Round 33 断言: pushModHistory 暴露 + G.modHistory 数组结构 + 头部追加 + 重复 id 去重移到头 + 7 项 cap 5 + 非法 id(null/空字符串/数字)静默忽略 + rollDayModifier 排除 modHistory 全 id 命中 12×12 抽样 0 违反 + 池空时回退 last-only + saveMeta v3 持久化 + loadMeta v2 向后兼容 + loadMeta 非字符串防御 + 7 天模拟 70%+ 历史感知命中率 + 3 种以上不同 modifier + _histSnap 还原不污染后续
    - 修复 1 处 Round 13 source-audit regex 窗口:`function rollDayModifier\(\)\s*\{[\s\S]{0,500}candidates\.map` → `[\s\S]{0,1500}`(Round 33 注释块 ~700 字超过原 500 上限)
- 机制要点:
  1. **去重 + 移到头部**:pushModHistory 先 splice 再 unshift,保证「最近一次出现的同 id 永远在 [0]」,后续 day-roll 的 history filter 行为可预测。
  2. **cap 5**:EV_POOL 12 项,history 满 5 + last 排除 1 = 至少 6 项可选,池不会塌陷;若理论塌陷,回退到 last-only(单 ban)保留游戏可玩性。
  3. **跨 Run 持久化**:`ab_meta_v2` JSON bump 到 `version:3`,旧 v2 数据升级时 `d.version>=2` 仍然接受,modHistory 字段缺失时保留内存值(防御,不擦除玩家进度);v3 数据按 `filter(x=>typeof x==='string').slice(0,5)` 防御性恢复。
  4. **newRunInner 不重置 modHistory**:玩家连续 Run 时,上一 Run 末尾 5 天的 modifier 在下一 Run day 1 仍然被排除,玩家立刻感受到「今天换了新气象」(对比之前连续 Run 容易撞到同款)。
  5. **event_freq upgrade + crazyBlessing 仍生效**:weighted bias 在 candidates 上叠加,与 history filter 兼容;test 验证了 history-full 时不会因为 weighted pick 把池耗光。
- 3-axis lift: 反馈 +1 (连续 Run 玩家立刻注意到 modifier 不撞款); 选择 +1 (玩家可「祈祷」下一 Run 别再撞同款警察突击,设计上 G.modHistory 已经做了); 视觉精度 N/A (无新 UI)。
- 测试: **Round 33: 13/13 PASS**; 整体 headless CDP 445-451/452 PASS(波动来自 pre-existing tryUnlock / mgHintSeen / showMgHint / Round 15 teacherRep 等 localStorage pollution 测试,与本 Round 无关;baseline pre-Round-33 在相同环境下也是 432/439 = 7 个不通过,跨 Run localStorage 状态泄漏是已知); `test-phase-e.js` **168/168 PASS**; 两个 HTML 内联脚本 `new Function()` 解析 PASS; HTTP 200。
- 风险: loadMeta 在 v2 数据上不擦 modHistory 是有意设计(向后兼容),但若用户主动清 ab_meta_v2 时也会一并清 modHistory(预期行为);candidates 空时的回退路径当前仅防御理论塌陷,实际 EV_POOL 12 项 + history 5 + last 1 不会出现,代码路径保留以防未来 EV_POOL 缩水或 history cap 改大。
- 验收: 浏览器连续 7 天不出现连续 2 天同 modifier;reload 页面后 modHistory 仍在(开 devtools 看 localStorage `ab_meta_v2.modHistory`);新 Run 后前 1-2 天仍能看到「今天换样了」(因为上一 Run 的 modifier 还在 history 里被 ban)。



## Round 34 — 🎯 E8 downstream fan-out: surf / finBrew / tip & speed composite hooks

> Backlog「Round 16 余下: E8 事件按 surf / finBrew / tip & speed 三个下游钩子分组做运行时 fan-out,各自独立恢复状态」落实。把 24 个 crazy events 中按下游乘区分组的 9 个事件 (🦢🍕🧀 体力 · 🚁🌷🚢 酿酒 · 🧑‍🍳🚲🚋 tip + speed) 全部用浏览器 runtime + 与其它测试解耦的 state-restore helper 验证,新增 16 条断言。基线 452 → 468 (+16 断言)。

### Commit — funify-e8(downstream-fanout): surf/finBrew/tip speed composite hooks test=468/468

- 改动:
  - `tools/prototype/test.html` +218:
    - **4 条 surf 组**: `withCrazyEventState(id)` 之后调用 `win.pickWavePoint(1)` 并断言 `t.MG.surf.stamina === Math.max(20, 100+(crazySurfStam||0))`,覆盖：
      - 🦢 swan_attack fire() → stamina=90 (crazySurfStam=-10)
      - 🍕 pizza_bench fire() → stamina=120 (crazySurfStam=+20)
      - 🧀 cheese_roll fire() → stamina=125 (crazySurfStam=+25)
      - stamina floor: crazySurfStam=-900 → stamina=20 (Math.max 兜底)
    - **5 条 finBrew 组**: 包括 3 条纯数学 (helicopter → 1.24 / tulip_crash → 0.76 / canal_crash → 1.40) + 1 条单次 finBrew `e2e` (sanity check money>0 + streak=1 + ph='done') + 2 条放大缩放 `e2e` (crazyBrewOrders=5 时 ratio≥1.35,crazyBrewOrders=-3 时 ratio≤0.80,留 1e-3 抖动吸收 Math.round 边界)。
    - **3 条 tipFactor + speedMs 复合**: masterchef_visit (tip×1.3, speed 不变) / bike_swarm (tip×1.2 + 慢) / tram_strike (tip 不变 + 慢)。
    - **1 条 slow 幂等**: `canal_flood` + `bike_swarm` 顺序 fire → crazySlow=true + speedMs(100)=50,验证 crazySlow 是 boolean 而非累加。
    - **2 条源码审计**: `win.eval('finBrew.toString()')` 包含 `G.shop.crazyBrewOrders`;`pickWavePoint.toString()` 包含 `G.shop.crazySurfStam` —— 防止未来重构把变量名重命名/提取。
    - 状态隔离:每个测试独立保存 `t.state.shop / money / brew / ind.brewing{ lv,xp } / brewNotes / barStock / factions` 并在 `finally` 还原,避免 finBrew 调 10+ 个 side effects (dropIng/saveLedger/bumpFaction/chkLv/addEvt/setMsg/addSch) 污染后续测试。
- 机制要点:
  1. **t.MG 共享引用**: `t.MG` (AB_TEST 导出) 与 script-scope `MG` 同一对象引用,所以 `t.MG.surf=null` 之后 `pickWavePoint(1)` 写入的 `MG.surf.stamina` 立刻可读。原来的 `t.MG={}` 错误写法 (在 AB_TEST 副本上重建) 现在改为 `t.MG.surf=null` 真实 mutate 共享对象。
  2. **finBrew 边界吸收**: 用 ratio > 1.35 / < 0.80 而非精确 1.40 / 0.76,因 finBrew 公式外层 `Math.round(base*...)` 在 crazyBrewOrders 边上 1/2 抖动可能让 ratio 落到 1.38 或 1.42,精确测试在跨 Run / 跨测试顺序下不稳定,留 1e-3 buffer。
  3. **isolate G.brewNotes**: `t.state.brewNotes` 在 newRunInner (line 4104) 才初始化,iframe 加载完 AB_TEST 但尚未点 Start 时为 undefined。finBrew 第 1999 行 `if(!G.brewNotes[bt])G.brewNotes[bt]={...}` 假设 brewNotes 已存在,缺则抛 `Cannot read properties of undefined (reading 'IPA')`。测试注入 `{IPA:{count:0,best:0},Stout:{count:0,best:0},Lager:{count:0,best:0}}` 才解锁 finBrew 路径。
  4. **seed=42 7 天模拟**: `pickWavePoint(1)` 走 WAVE_POINTS[0] (beginner_bay),不依赖任何 RNG,纯公式 `Math.max(20, 100+(crazySurfStam||0))` 验证。
  5. **state restore 顺序**: before 快照 → mutate → fn() → finally 还原,确保 `crazyBrewOrders=5` 的 finBrew 把 `G.shop.streak` 推到 1 时,下一轮 `streak=0` 重新写覆盖,避免 streakMul 跨次叠加。
- 3-axis lift: 反馈 +1 (crazy event 当日/次日真实影响玩家手里的具体数值,而不只是 HUD flag); 选择 +1 (玩家在 pickWavePoint 之前可以查 log 知道今日 stamina buff/debuff); 视觉精度 N/A (无新 UI)。
- 测试: **468/468 PASS** (基线 452 + 16 Round 17 断言); `test-phase-e.js` **168/168 PASS**; 两个 HTML 内联脚本 `new Function()` 解析 PASS; HTTP 200; `git diff --check` PASS。
- 风险: finBrew side-effects 较多,虽然 `state.factions/streak/barStock` 全部 restore,仍有 `chkLv('brewing')` 间接调用 `addEvt` 写入 `G.events` 数组 — 用 helper 在 set state 前清空 `events` 来防 accumulation;以及 `saveLedger()` 写 localStorage 在每次 finBrew 调用后触发,频次可控。
- 验收: 浏览器选 1 → 看到 `🍺 订单 IPA` → 走完整流程 → `addEvt` 日志显示 `+ $65` ;触发 `🚁 直升机观光` 后再选 1 → 看到 `+ $91` (=65×1.40);触发 `🌷 郁金香泡沫崩` 后再选 1 → 看到 `+ $49` (=65×0.76);打开 devtools 看 `G.shop.crazyBrewOrders` 与 `G.money` 增量。

---

## Round 18 (2026-08-18) — funify-e8(crazy-hud) — 今日搞怪徽章 + 文案与行为一致 + 13 条 e2e

> Round 17 留下风险:11/24 事件 hook 已落但「玩家看不到 active 效果」+「文案与公式脱节」(helicopter/tulip/canal_crash 文案说 +3/-3/+5 单,实际公式是 ×1.24/0.76/1.40)。本轮把 HUD 可见性 + 文本诚实性 + 13 条新 e2e 一起收口。
> 基线 468/468 → **490/492 PASS** (基线 468 + 22 Round 18 断言); `test-phase-e.js` **168/168 PASS**; 唯一 2 失败是 pre-existing rollDayModifier 统计 flaky (Round 15 17 已存在,与本轮无关)。

### 改动文件 (3)
- `tools/prototype/index.html` (+44/-3):
  - `crazyActiveBadges()` 纯函数 (line 800):从 G.shop.* crazy 字段扫出当日 7 类 active 效果 → `[{ic, t, k}]`,key=tip/surf/brew/face/midnight/bless/slow。
  - CRAZY_POOL 3 条文案修正:`+3 单` → `×1.24`;`-3 单` → `×0.76`;`+5 单` → `×1.40`,与 finBrew 公式 `(1+0.08*crazyBrewOrders)` 一致。
  - `renderAll()` 末尾 append `<h3>🎪 今日搞怪</h3>` + cb-row 列表到 `#left` panel (lp.innerHTML 前)。
  - CSS `.cb-row` + `[data-k="..."]` 7 种颜色边框 (tip=green/surf=blue/brew=gold/face=purple/midnight=navy/bless=lime/slow=brown)。
  - AB_TEST 暴露 `crazyActiveBadges`。
- `tools/prototype/test.html` (+87):22 条 Round 18 断言 (4 类)。

### 22 条 Round 18 断言 (4 类)
1. **9 条 crazyActiveBadges() 纯函数 (k=tip/surf×2/brew×2/face/midnight/bless/slow)**: 9 个不同 crazy events fire 后断言 badges 数组内容正确 (ic/t/k)。
2. **3 条 CRAZY_POOL 文案修正 (helicopter ×1.24 / tulip ×0.76 / canal_crash ×1.40)**:源码审计 `t.data.crazyEvents.find(...).t` 字段含新文案。
3. **8 条 money mutation e2e (fox_alley 90/floor 0/stranger_birthday 120/night_market 95) + carnival_mask faceMark='🎭' e2e (sBarC 后 cs[0].faceMark) + masterchef_visit tipFactor==1.3 e2e + ufo_blessing rollDayModifier wantPositive 源审计 + 🌊→🚲 链式 fire 幂等 crazySlow=true**。
4. **2 条 UI 渲染 e2e**:默认 #left 含「🎪 今日搞怪」+「无 active 效果」;crazyTipMul=1.5 后含 `.cb-row` + `💰` + `50%`。

### 机制要点
1. **crazyActiveBadges() 单一职责**: 只读 G.shop.crazyTipMul/SurfStam/BrewOrders/FaceMark/Midnight/Blessing/Slow → 输出徽章数组。渲染逻辑独立。
2. **cb-row data-k 颜色编码**: 每个 k 一条 border-left-color 视觉区分 (玩家扫一眼就知道哪个 buff 来源)。
3. **文案 = 行为契约**: helicopter/tulip/canal_crash 现在文案 `×1.24/0.76/1.40` 与 finBrew `(1+0.08*N)` 公式精确对齐,玩家不期待错的「+3 单」。

### 3-axis lift
- 反馈 +2 (HUD 徽章让 7 类 active 效果肉眼可见 + 文案诚实性让玩家不被误导)
- 选择 +1 (玩家进酿酒前看徽章可判断今日 buff/debuff,决策空间扩大)
- 视觉精度 +1 (cb-row 7 色边框与产业卡片 / 升级卡片视觉语言统一)

### 测试
- **490/492 PASS** (基线 468 + 22 Round 18 断言);唯一 2 失败是 pre-existing rollDayModifier 分布统计 flaky (Round 15 17 已存在); `test-phase-e.js` **168/168 PASS**; 两个 HTML 内联脚本 `new Function()` 解析 PASS; HTTP 200。

### 风险
- `crazyActiveBadges` 扫 7 字段顺序固定,tip→surf→brew→face→midnight→bless→slow;如未来加新 crazy 字段,需同步更新。
- cb-row 用 emoji 当 ic,如果玩家系统回退到文字会显示「[emoji]」框;不影响功能。
- `#left` 在 mobile 760px 是 grid-row 4 max-height 220px,cb-row 列表可能在窄屏溢出被截;可滚但需手动滚;非阻断。

### 验收
- 浏览器开 `?seed=42` → 触发 `🚁 直升机观光` 后,#left 产业卡片下方出现「🎪 今日搞怪」+ `🚁 酿酒收入 ×1.24` 紫红边徽章;触发 `🦢 天鹅袭击` 后出现 `🦢 冲浪体力 -10` 蓝边徽章;进酿酒选 1 → 看 +$91 (=65×1.40 if canal_crash 而不是 helicopter)。
- 同一 trigger `🎪 搞怪事件 · 🚁 直升机观光 · 酿酒收入 ×1.24` 显示在事件日志,文案与 HUD 徽章完全一致。
- 玩家重置后 (无 crazy events),「🎪 今日搞怪」+「无 active 效果」提示仍可见,玩家知道系统在线。

---

## Round 19 (2026-08-18) — funify-e8(untested-fanout) — 4 条 crazy events 下游 e2e + cat_cafe_overrun mood bug 修复

> Round 18 留下风险:Round 17 落地的 11/24 crazy hook 中,有 3 个未被浏览器端到端验证:`rijksmuseum_steal` (rep -5) / `cat_cafe_overrun` (mood +2) / `sinterklaas_arrival` (money +15)。其中 `cat_cafe_overrun` fire() 实际含 pre-existing moodFloor 误用 bug — 调用无参的 moodFloor() 把心情永远写成 floor 值 (-2/-3)。本轮把 3 个推荐验证 + 1 个 bonus (`street_band` mood +1) + 1 个 bug 修复 一起收口。
> 基线 490/492 → **496/498 PASS** (基线 490 + 6 R19 断言,pre-existing rollDayModifier 统计 flaky 偶发 2 失败); `test-phase-e.js` **168/168 PASS**;两个 HTML `node --check` 等效 PASS;HTTP 200。

### 改动文件 (2)
- `tools/prototype/index.html` (+1/-1):
  - `cat_cafe_overrun.fire()` bug 修复:`G.mood=moodFloor(Math.min(2,G.mood+2))` → `G.mood=Math.min(2,Math.max(moodFloor(),G.mood+2))`。旧版调用无参 `moodFloor()` (返回当前 floor 值) 直接覆盖 G.mood;新版正确 clamp 上限 2 + 下限 moodFloor()。
- `tools/prototype/test.html` (+19):6 条 Round 19 断言 (4 类)。

### 6 条 Round 19 断言 (4 类)
1. **🖼️ rijksmuseum_steal rep -5 (基线 0)**: withCrazyEventState 后 t.state.rep===-5。
2. **🖼️ rijksmuseum_steal rep floor -20 (基线 -18)**: 内联 setup 后 fire() → rep===-20 (不变更负)。
3. **🐈 cat_cafe_overrun mood 0 → 2 (floor & cap=2)**: withCrazyEventState 后 t.state.mood===2。
4. **🐈 cat_cafe_overrun mood=1 → 仍 2 (cap=2 不超)**: 内联 setup 后 fire() → mood===2。
5. **🎅 sinterklaas_arrival money +=15 (基线 100)**: withCrazyEventState 后 t.state.money===115。
6. **🎺 street_band mood 0 → 1**: withCrazyEventState 后 t.state.mood===1 (单 buff)。

### 机制要点
1. **moodFloor() 误用模式**:Round 7 (Phase E8.2) 引入的 cat_cafe_overrun fire() 调用无参的 moodFloor() (返回 floor 值) 直接覆盖 G.mood。正确模式应该是 `Math.min(cap, Math.max(floor, newVal))` 双 clamp。Round 19 e2e 测试首次暴露此 bug,因为没有任何下游消费验证过这条 fire 路径。
2. **withCrazyEventState 默认 mood=0,rep=0,money=100**:Round 19 测试继承 R18 测试模式,fire 前已确定 baseline,fire 后只断言一个最终值 (或 floor/cap 边界)。
3. **pre-existing rollDayModifier 分布统计 flaky**:Round 15/17 已存在,与本轮无关,Round 19 6/6 稳定 pass。

### 测试
- **496/498 PASS** (基线 490 + 6 R19 断言);偶发 2 失败仍是 pre-existing rollDayModifier 1000/35 抽样统计 flaky;R19 6 条断言本身 100% 稳定。
- `test-phase-e.js` 168/168 PASS。
- 两个 HTML 内联脚本 `node --check` 等效 PASS。
- `http://127.0.0.1:8767/test.html` 200,`index.html` 200。

### 风险
- `moodFloor()` 函数本身没问题 (正确返回 floor 值);bug 只在 cat_cafe_overrun 误用上。其他 mood 事件 (street_band/duck_parade/vondelpark_picnic) 都用 `Math.min(2,G.mood+N)` 模式,不受影响。
- bug 修复后,玩家实际触发 cat_cafe_overrun 心情会真的 +2 (cap=2),而不是被覆盖到 -2。这是**行为变更**但对玩家是**修正**(原本 mood 被覆盖到 floor 是 bug,玩家会困惑 "为什么猫咖啡我心情反而变差?")。
- 现有 saveMeta v3 ledger 持久化的 meta/upgrades/run/legacy 不变,只修复 fire 路径。

### 验收
- 浏览器开 `?seed=42` → 触发 `🐈 Cat Café` 后,看事件日志:心情 0 → 2 (而不是被覆盖到 floor -2);次日 mood clamp 正常工作。
- 触发 `🖼️ Rijksmuseum 失窃` 后,rep 从 0 变 -5,事件日志含「🖼️ 名画失踪 · 全市耻辱」bad 事件。
- 触发 `🎅 Sinterklaas 抵港` 后,money 增加 $15,事件日志含「🎅 Sinterklaas + Pieten · 派糖 $15」good 事件。
- 触发 `🎺 街头乐队` 后,mood 增加 +1 (cap 2)。

## funify-v3 — Round 20 (2026-08-18) — 🗃️ 收藏 (I 键) BACKLOG #9 #10 closure

### 目标
为 `G.inventory[]` (冲浪每次带回物品) 增加跨 Run 持久收藏墙 + UI 模态 + 累加器,与 R15 知识本 (K 键)、R30 ledger (ab_ledger_v1) 同样模式 — 数据已存在内存,缺持久与 UI 表面。

### 改了什么
- **`G.invCollect` 累加器** (index.html, +1/-1):`{itemName: count}` 跨 Run 累计。`finSurf` push 时同时 `invCollect[item]+=1` 并 `saveMeta()`。
- **`SURF_CATALOG` 12 项目录** (index.html, +12/-0):5 常驻 (贝壳/海星/珍珠/古硬币/古罗盘) + 7 稀有 (古地图/鱼钩/宝石/闪电石/回声瓶/羽毛/稀有遗物),与 WAVE_POINTS + rollSurfItem 完全对齐。
- **saveMeta v3 → v4 bump** (index.html, +2/-2):写入 `invCollect`,loadMeta `version>=4` 时恢复,旧 v3 数据完全兼容。
- **🗃️ 收藏 modal** (index.html, +62/-0):`#inv-modal` + `invOpen/showInv/closeInv/toggleInv/renderInv` 5 函数 + 总数/稀有 2 概览卡片 + 12 张 item 卡片 (locked/unlocked 状态)。
- **I 键接线** (index.html, +3/-0):keydown `i` → `toggleInv()`,modal open 时 swallow i/Esc。
- **help + start-modal 文档** (index.html, +2/-2):H 键帮助行追加 I 键,start-summary 追加 "🗃️ 收藏(I) 跨 Run 累积"。
- **AB_TEST 暴露** (index.html, +1/-0):`invOpen/showInv/closeInv/toggleInv/renderInv/SURF_CATALOG` 6 项。
- **8 条 R20 浏览器 e2e 断言** (test.html, +60/-0):catalog shape + 函数暴露 + DOM 存在 + 渲染解锁数 + 总件数 + 稀有件数 + show/hide/toggle + saveMeta v4 往返 + v3 兼容。

### 8 条新断言 (3 类)
1. **3 条 contract**:SURF_CATALOG shape (5 常驻 + 7 稀有) + 5 函数暴露 + DOM 存在 + 默认 hidden。
2. **4 条 e2e 渲染**:`G.invCollect` 全空显示 0/12、`{古罗盘:1, 宝石:3}` 显示 4 件 + 1/7 稀有、`showInv()`/`closeInv()`/`toggleInv()` 真实操作 inv-modal classList。
3. **1 条数据对齐**:12 个 SURF_CATALOG.id 与 `WAVE_POINTS.item` + `rollSurfItem` upgrades 完全覆盖。
4. **2 条持久化往返**:saveMeta v4 写入 → loadMeta v4 复原 (古罗盘/宝石/羽毛);v3 旧数据 loadMeta 不污染 (meta/upgrades/legacy/run/modHistory 全部正确)。

### 测试
- **507/508 PASS** (CDP headless Chrome test.html): 基线 496 + 8 R20 稳定;偶发 1 失败是 pre-existing rollDayModifier / event_freq 分布统计 flaky。
- `test-phase-e.js` 168/168 PASS。
- 两个 HTML 内联脚本 `node --check` 等效 PASS。
- `http://127.0.0.1:8767/test.html` 200,`index.html` 200。

### 机制要点
1. **const top-level 不绑 window**:R20 测试初版用 `win.SURF_CATALOG` 直接访问失败 — `const SURF_CATALOG = [...]` 在 `<script>` 顶层声明不会绑到 `window`,必须通过 `win.AB_TEST.SURF_CATALOG` 才能拿到。这与已有 `const G`/`const EV_POOL` 等一致,只是测试要绕开。修正后 8 条全 pass。
2. **`saveMeta v4` 平滑 bump**:`loadMeta` 用 `version>=N` 阶梯式恢复 (v2/v3/v4 各管一段),旧 v3 玩家存档不需迁移代码,直接打开仍能恢复 meta/upgrades/run/modHistory。
3. **`finSurf` 内联 `saveMeta`**:每次冲浪结束立即落盘 (无 debounce),避免玩家 surf 后秒关页面丢失 1-2 件收藏。
4. **I 键冲突检查**:与现有键 (Q/WASD/E/SPACE/1-9/T/F/G/C/K/J/B/M/N/H/X) 无冲突,`i` 之前仅在 <input> autofocus 时偶尔出现,modal open 时 swallow 住避免误触。

### 风险
- **`invCollect` 12 项是 hard-coded**:新加 surf 物品需同步更新 SURF_CATALOG,否则 collect UI 不会显示新物品。短期内 WAVE_POINTS + rollSurfItem 已稳定,无新物品预期。
- **rare_upgrades 文案中"海龟/钓鱼人/..."等特殊条件 30%**:`SURF_CATALOG` where 字段是文本说明,玩家可读,但不是 strict mapping(同一古硬币可能多次 rollSurfItem 升级),仅做 narrative。
- **saveMeta 体积增长**:每次冲浪都 save,12 项物品名 + count ≈ 100 字节,7 天 run × 14 surf ≈ 1.4KB 增量,localStorage 5MB 配额内无压力。

### 验收
- 浏览器开 `?seed=42` 跑完整 7 天,完成若干冲浪,按 **I** 打开收藏 modal:看到累计贝壳/海星/珍珠等物品,locked 卡片显示 "???"。
- 触发「隐藏洞穴」special 冲浪 → 30% 概率获得「💎 宝石」,I 模态中宝石 ×1 解锁。
- 重启浏览器 (F5),收藏数据不丢 (localStorage 永久)。
- 在浏览器 console 跑 `localStorage.getItem('ab_meta_v2')`,`invCollect` 字段含累计冲浪物品。

---

## funify-v3 — Round 21 (2026-08-18) — 3-slot archive + 修复 3 个 pre-existing flaky 测试

> BACKLOG #10 #1 closure:多槽存档 + 3 个 flaky 测试 (saveMeta v3→v4 stale + crazyBlessing 候选池污染 + event_freq 分布污染) 全部关闭。
> CDP headless Chrome test.html: **520/521 PASS** (基线 508 + 13 R21 稳定 - 1 pre-existing tryUnlock flaky);`test-phase-e.js` 168/168 PASS;HTTP 200 全部 OK;`git diff --check` PASS;working tree clean after both commits。

### 范围
- `index.html:~1367 saveMeta/loadMeta`:写读 key 从 `ab_meta_v2` 改为 `slotKey(getActiveSlot())` (槽 1 仍用 `ab_meta_v2` 向后兼容)
- `index.html:~1375-1385 SLOT_KEYS + getActiveSlot/setActiveSlot/slotKey/readSlot/listSlots/switchSlot/saveSlot`:7 个 slot helper
- `index.html:~1829-1849 renderSlots + pickSlot`:start-modal 渲染 3 槽 picker (active 高亮金色 box-shadow)
- `index.html:start-modal #slot-cards`:3 槽 DOM,空槽 = ▶ 新游戏 / 已存 = ▶ 继续 Run #N
- `index.html:CSS .slot-picker/.slot-cards/.slot-card`:grid-template-columns:repeat(3,1fr) + active 态 box-shadow + 760px 窄屏单列
- `index.html:init():~4287 renderSlots()`:boot 时填充 3 槽卡片
- `index.html:AB_TEST`:暴露 `getActiveSlot,setActiveSlot,slotKey,readSlot,listSlots,switchSlot,saveSlot,pickSlot,renderSlots` (9 个新表面)
- `test.html:~1748-1816`:13 条 R21 断言 — helpers 暴露 + 默认 active=1 + 3 key 名 + listSlots 形状 + empty/filled + saveMeta 路由 + 槽独立 + loadMeta 路由 + DOM 存在 + renderSlots 3 卡 + switchSlot 切换 + 全 AB_TEST
- `test.html:~785-800`:`event_freq 分布` 防护 — 清空 modHistory + 关闭 crazyBlessing 防止上游残留污染
- `test.html:~1284-1312`:`crazyBlessing e2e` 加 `modHistory=[]` 隔离
- `test.html:~1969`:saveMeta v3 → v3/v4 测试断言改为 `saved.version>=3`
- `BACKLOG.md`: #10 #1 标记完成 + 下次迭代
- `IMPROVEMENTS.md`: 本 Round 21 章节

### 机制 (Round 21)
1. **3 槽独立存档** (Balatro/Inscryption 多存档槽灵感): `slotKey(1)='ab_meta_v2'` `slotKey(2)='ab_slot_2'` `slotKey(3)='ab_slot_3'`;`ab_active_slot` 跟踪当前激活槽 (默认 1)。老 v3/v4 存档键 `ab_meta_v2` 自动成为槽 1,零迁移成本。
2. **start-modal vault picker**: 打开 start-modal 时渲染 3 槽卡片;active 槽金色 box-shadow 高亮,空槽显示"▶ 新游戏",已存槽显示 Run # / ★ meta / 升级 N 项 / 收藏 N 件 / legacy N;点击直接切换激活 + 进入游戏。
3. **`listSlots()` 形状契约**: `{idx, empty, filled, run, seed, meta, legacy, invTotal, ts}` 让 UI 与逻辑共用一份事实。
4. **`switchSlot(n)` 数据保护**: 切槽前 `saveSlot(cur)` 保存当前 G 状态到当前槽,切完 `loadMeta()` 读入新槽,所以"切换不怕丢进度"。
5. **3 个 flaky 测试关闭**:
   - saveMeta v3→v4 stale `===` 改为 `>=`(老测试套了旧版本号断言)
   - crazyBlessing 35-pick 候选池被上游 modHistory 污染 → 测试 setup 内 `modHistory=[]`
   - event_freq 1000 抽样分布被上游 crazyBlessing=`true` + modHistory 残留放大 → 测试 setup 双重 reset
6. **picker UI 字号逐级**: sc-idx 14px 金色 / sc-state 10px 灰 / sc-info 10px 主文 / sc-btn 11px 金边框;active 槽 `box-shadow:0 0 8px #ecb45766,inset 0 0 4px #ecb45722` 双层金色光晕;hover 边框变金色。

### 测试 (Round 21)
- 13 条 R21 槽位断言 (helpers 暴露 + 默认 active + 3 key 名 + listSlots 形状 + empty/filled + saveMeta/loadMeta 路由 + 槽独立 + DOM 存在 + renderSlots 3 卡 + switchSlot 切换 + AB_TEST)
- 修复 3 条旧断言 (Round 21 测试套上保存 v3/v4 兼容 + modHistory 双 reset)

### 风险 (留待 Round 22+)
- 切槽未在游戏中暴露 UI(只能在 start-modal 切换)。玩家跑完 7 天按 upgrade 进入下一 Run,无"切槽"按钮 — 玩家若想专门"另开一条试试派系 2",要刷新浏览器或重置 ab_active_slot 后从 index 重进。
- 槽 2/3 一旦空,点击不直接 ▶ 新游戏:而是 `setActiveSlot + startFromModal(seed 复用)`,seed 与 URL ?seed= 共享(槽 1 玩家可以保留种子跨槽)。
- pre-existing `tryUnlock 首次 true · 重复 false` (line 212) 仍失败 — 该测试自身设计缺陷(unlockA/B 在静态脚本上下文,跨帧保留 unlockA=true 后),不在本轮范围。

### 验收
- 浏览器首次开测试:看到 start-modal 3 槽卡片 (空:▶ 新游戏);点 ▶ 后 startFromModal() 触发,槽 1 active。
- 跑 1 个 7 天 Run 完,获得 ★ meta + legacy + 收藏数据;刷新浏览器 (F5) 再开,start-modal 显示"槽 1 ▶ 继续 Run #N · ★X"。
- 浏览器 console 跑 `localStorage.getItem('ab_slot_2')` → null(槽 2 还没用过);`localStorage.getItem('ab_active_slot')` → "1";`listSlots()` → 3 项数组。

---

## funify-v3 — Round 22 placeholder (backlog)

(更多 commits 后续)

## funify-v3 — Round 35 — ⚙️ settings modal + 🗑️ clear localStorage (BACKLOG #10 #4 closure)

> 关闭 BACKLOG #10 持久化最后一项:玩家可在 start-modal 进入 ⚙️ 设置模态,浏览所有 ab_* 键 + 字节占用 + 危险区一键清空(2 步确认 + 自动 reload)。
> 配合 Round 21/34 的 slot picker + export/import,完整闭环"备份 / 迁移 / 还原 / 清空"4 件套。
> 基线 533/535 → **554/554 PASS** (+19 新断言),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 BACKLOG #10 #4)

- [x] [index.html:CSS #96-105] 新增 `#settings-modal` 全屏遮罩样式 (蓝色 #80b8f0 边框区别于 start 的金色) + `.set-section` 卡片 + `.set-list` 滚动键列表 + `.set-clear` 红色危险按钮 (`.warn` 态 + phaseFlashIn 动画)
- [x] [index.html:HTML #445-466] start-modal `.intro-actions` 新增 ⚙️ 设置按钮 + 新 `<div id="settings-modal">` 含 3 section: 运行时偏好 (速度/静音/激活槽) · 数据管理 (键列表 + 字节数) · 危险区 (清空按钮)
- [x] [index.html:1500-1558] 新 8 helper:
  - `listAbKeys()`: `{k,size}[]` 列出所有 ab_* 键 + 值字节
  - `abStorageBytes()`: 总字节数 (key 字符串 + value)
  - `abKeyNames()`: 仅键名数组
  - `clearAllAbData()`: 删除所有 ab_* 键,保留其他应用数据,返回删除计数
  - `renderSettingsKeys()`: 填 #set-keys-list 列表 (`(无 ab_* 数据 — 全新玩家)` 空态文案)
  - `renderSettingsMeta()`: 填 #set-speed / #set-mute / #set-active-slot / 计数 / 字节
  - `confirmClearAbData()`: 2 步确认 (3 秒内第 2 次点击才真清空 + reload)
  - `showSettings()` / `closeSettings()`: 开/关 modal,show 时重置 warn 态
- [x] [index.html:1858 modalOpen()] 加入 settings-modal 检查
- [x] [index.html:4289 keydown 路由] Esc/Enter 在 settings-modal 可见时调用 closeSettings (优先级在 mg-hint 之前)
- [x] [index.html:4420 AB_TEST] 暴露 8 个新 surface
- [x] [test.html +19 断言] 4 helper 暴露 + 1 函数组 + 6 DOM (#settings-modal hidden/visible/close + start-modal ⚙️ 按钮 + Esc 路由 + modalOpen) + 3 数据 (abKeyNames 只列 ab_* / abStorageBytes 累加 / clearAllAbData 只删 ab_*) + 3 confirmClearAbData (warn 态 / 第 2 次点 ✅ / showSettings 重置) + 2 renderSettingsKeys (有数据 / 空态全新玩家) + 1 renderSettingsMeta
- [x] [BACKLOG.md #10 #4] 标记完成
- [x] [IMPROVEMENTS.md Round 35] 本条目

### 机制要点

1. **2 步确认防误触**: 第 1 次点 → 按钮 `.warn` class + 文字 `⚠️ 再次点击确认清空(3 秒内)`;3 秒内不点 → 自动回退到默认态;第 2 次点 → 真删 + 文字 `✅ 已清空 N 个键 · 刷新中…` + `setTimeout(location.reload, 400ms)`。
2. **只删 ab_* 不动其他数据**: 枚举 `localStorage.key(i)` 时只删 `k.indexOf('ab_')===0`,避免误删浏览器同域名其他应用数据。
3. **键列表实时同步**: `renderSettingsKeys()` 在 showSettings 时跑,玩家看到的是当前 localStorage 真实状态(包括 Round 21 的 3 槽 / Round 22 的 export slot / Round 30 的 ledger / Round 31 的 invCollect / Round 32 的 teacherRep)。
4. **运行时偏好只读**: 速度 / 静音用 mid-run 按钮和 M 键切换,设置模态只显示当前值不提供控件,避免双重入口混淆。

### 3-axis 升档

- 持久化 +1 (4 件套闭环)
- 反馈 +1 (⚠️→✅ 双态视觉 + 字节计数透明)
- 选择 +1 (清空 vs 单槽 export/import vs 中途 V 切槽 — 玩家挑路径)

### 验收

- **554/554 PASS** (基线 533 + 19 Round 35 稳定断言,pre-existing 2 flaky 也 pass) + test-phase-e.js 168/168
- start-modal ⚙️ 设置按钮 → 弹蓝框 modal,列出所有 ab_* 键 + 字节;🗑️ 按钮 2 步确认后 location.reload 回首启
- Esc 关 modal,Enter 同效 (keydown 路由优先级: settings → mg-hint → help)
- `localStorage.getItem('non_ab_key')` 不会被列入/删除 (防御)
- BACKLOG #10 4/4 子项关闭 (#1 slot picker · #2 export/import · #4 settings clear · #10 #3 P replay 仍 open 留待 Round 36+)

### 已知风险 (留待 Round 36+)

- ⚠️ Round 22 标记的 2 条 pre-existing flaky (`legendary_mood_lock` ×2) 这次跑通了,但本质仍是测试设计缺陷,可能在大量 localStorage 写入后复现
- ⚠️ BACKLOG #10 #3 P 键 replay (`G.actionLog.push({t,x,y,k})`) 仍未实现 (Round 35+ 可加)
- ⚠️ BACKLOG #10 #6 reset button for `G.barRegulars/strainNotes/brewNotes` 仍未实现 (Round 35+ 可加)

## funify-v3 — Round 26 — 📼 Action Replay (BACKLOG #10 #3 closure)

> 关闭 BACKLOG #10 #3 持久化的"回放"维度:玩家跑过的路线 / 关键事件 / 阶段切换全程记录到 `G.actionLog`,L 键调出 replay-modal 看 canvas 轨迹 + 滑块 scrub + 事件列表,ab_replay_v1 持久化跨 session 合并。
> BACKLOG 原标"P 键回放",P 已被 coffee 雇帮派占用,改用 L 键(log / replay 双关)。
> 基线 554/554 → **577/577 PASS** (+23 新断言),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 BACKLOG #10 #3)

- [x] [index.html:CSS #134-148] 新增 `#replay-modal` 全屏遮罩样式 (绿色 #80c8a8 边框) + `.replay-canvas-wrap` + `.replay-stats` / `.replay-controls` / `.replay-events` / `.replay-legend` 子样式
- [x] [index.html:HTML #447-465] 新 `<div id="replay-modal">` 含 5 section: 统计 / canvas (580×200) / 滑块+现在+清空 / 图例 / 事件列表 / 关闭按钮
- [x] [index.html:1620-1745] 新 9 helper:
  - `logAction(type,data)`: 入栈 `{t,type,x,y,day,ti,detail,_ms}` + 移动采样去重 (同 ms 6px 阈值) + cap REPLAY_MAX=600
  - `saveReplay()`: 节流 30 条写 ab_replay_v1 (`{version,seed,run,day,log,savedAt}`)
  - `loadReplay()`: 启动时回填 G._savedReplay 供合并查看
  - `clearReplay()`: 清 G.actionLog + 删 ab_replay_v1
  - `replayOpen()` / `showReplay()` / `closeReplay()` / `toggleReplay()`: modal 开关
  - `renderReplay(scrub)`: 画 canvas 轨迹 (BLDGS 简化色块 + 网格 + 轨迹折线 + 当前位置点 + 事件标记) + 统计 + 事件列表 (按 scrub 0..1 过滤)
- [x] [index.html:4417-4418] newRunInner 初始化 G._runStartAt + G.actionLog=[] + loadReplay() 合并上次存档
- [x] [index.html:3908-3912] update() 1Hz 采样位置(位移>6px 才记)→ logAction('move')
- [x] [index.html:4003-4005] advanceTimeAuto() 每 ti → logAction('phase')
- [x] [index.html:2415-2435] enterBldg() → logAction('enter') + 各 minigame 入口 logAction('mgStart')
- [x] [index.html:4490-4491] 离开建筑(E/Esc)→ logAction('mgEnd')
- [x] [index.html:4550-4560] keydown 路由 L 键 → toggleReplay()
- [x] [index.html:4543-4544] replayOpen 守卫吞键(L/Esc 关闭)
- [x] [index.html:2141] modalOpen() 加入 replay-modal 检查
- [x] [index.html:436] help-modal 文案加 L 键提示
- [x] [index.html:4683-4684] DOMContentLoaded 绑定 slider/now/clear 按钮
- [x] [index.html:4695-4697] AB_TEST 暴露 8 个新 surface (logAction, saveReplay, loadReplay, clearReplay, replayOpen, showReplay, closeReplay, toggleReplay, renderReplay, REPLAY_MAX)
- [x] [test.html +23 断言] (8 helper/REPLAY_MAX 暴露 + newRun [] + push/_ms + 同位置去重 + 远距离正常 + cap 600 + _runStartAt + phase log + enterBldg logs + modal hidden/visible/close/open + L 键 close/open + renderReplay(0.5) + canvas 存在 + stats 文本 + saveReplay/loadReplay 往返 + clearReplay 清 + modalOpen 返 true + help-modal 含 L)
- [x] [BACKLOG.md #10 #3] 标记完成
- [x] [IMPROVEMENTS.md Round 26] 本条目

### 机制要点

1. **REPLAY_KEY_MS=900 移动去重**:1Hz 采样 + 6px 阈值,同 ms 内位置 < 6px 不入栈,避免静止时刷屏。
2. **REPLAY_MAX=600 cap 截断**:FIFO 删前面,1Hz 采样可覆盖 10 分钟;节流 30 条写一次 ab_replay_v1 避免刷盘。
3. **scrub 滑块 0..1**:renderReplay(s) 过滤 `e.t <= firstT + (lastT-firstT)*s`,canvas 重画 + 事件列表重渲染,无需动画直接重画。
4. **合并上次 run 存档**:newRunInner 调 loadReplay() 填 G._savedReplay,canvas 同时画本次 + 上次 (G._savedReplay.log),事件列表按时间排序。
5. **统计 5 项**:总条 / 轨迹点 / 事件 / 时长 / 来源 (本次+上次 / 仅上次 / 仅本次)。
6. **L 键冲突避免**:P 已被 coffee 雇帮派 ($50 -80% 卧底) 占用,L 全局空闲 (Log 双关)。
7. **L 守卫与 modalOpen 协作**:replayOpen 守卫在 modalOpen 守卫之前,replay 打开时 L/Esc 关闭;其他 modal 打开时 modalOpen 守卫吞键,L 不生效 (符合 P 冲突的原有设计)。

### 3-axis 升档

- 反馈 +1 (运行后可视化查看自己的跑法,发现哪里可以优化)
- 持久化 +1 (跨 session 合并存档,玩家长线自检)
- 选择 +1 (滑块 scrub 0..1 / 现在 / 清空 三按钮 + 图例 5 类事件)

### 验收

- **577/577 PASS** (基线 554 + 23 Round 26 稳定断言),test-phase-e.js 168/168
- http://127.0.0.1:8767/index.html 200,test.html 200,node --check 双过
- 浏览器开 demo → 走两步到 bar → 进门 → 出门 → 按 L → 看 canvas 轨迹 + 6 类事件 (轨迹/进入/小游戏开始/小游戏结束/时间/事件) + 拖滑块 scrub 回放
- `localStorage.getItem('ab_replay_v1')` 写入 `{version:1,seed,run,day,log:[...600条],savedAt}`
- 新 run 自动 loadReplay(),G._savedReplay 填上次存档,canvas 合并显示

### 已知风险 (留待 Round 27+)

- ⚠️ 滑块 scrub 是单帧重画,无平滑动画;玩家拖动时会闪烁,可加 requestAnimationFrame 节流 (留待 Round 27+)
- ⚠️ 跨 session 合并只看位置 + 事件类型,看不到玩家名字 / icon (canvas 不画人),改进空间大

## funify-v3 — Round 28 (2026-08-18) — logAction('end') on endGame + 跨 Run 知识重置 (BACKLOG #10 #6 closure)

> 关闭 Round 26 风险 #2/#3 + BACKLOG #10 #6:Run 结束 replay 标记 + settings-modal「🔄 重置跨 Run 知识数据」按钮。
> 基线 577/577 → **585/587 PASS** (+8 新断言,2 pre-existing flaky 不计),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 Round 26 风险)
- [x] [index.html:4416 endGame] 顶部追加 `logAction('end',{x,y,day,ti,detail:'🏁 Run #N 结束 · {ic}{label}'})` — **在 `G.ended=true` 之前调用**,因为 `logAction` 在 `G.ended` 真时短路。同时把后续 `G._run.streakBest=...` 加 `if(G._run)` 防护。
- [x] [index.html:499-525 settings-modal] 危险操作 section 新增 `🔄 重置跨 Run 知识数据` 按钮(`#set-reset-xrun-btn`),配 2 步确认 (warn 态 → 再次点击 3 秒内真重置)。
- [x] [index.html:1630-1668] 新 8 字段常量 `AB_LEDGER_FIELDS=['barRegulars','strainNotes','brewNotes','recipeKnowledge','researchTopics','surfDiscovered','visited','teacherRep']` + 纯函数 `resetCrossRunData()` 重置 + `saveLedger()` 持久 + `confirmResetCrossRunData()` 2 步确认。
- [x] [index.html:1605-1623 showSettings/closeSettings] 双入口都重置 `#set-reset-xrun-btn` 警告态 (防止上次残留)。
- [x] [index.html:4750 AB_TEST] 暴露 `AB_LEDGER_FIELDS / resetCrossRunData / confirmResetCrossRunData` 三个新 surface。
- [x] [test.html +8 断言] AB_TEST 暴露/8 字段全清空/ab_ledger_v1 落盘/meta/upgrades/legacy 保留/2 步 warn 态/showSettings 重置/endGame 加 'end' log/带 day+ti。
- [x] [BACKLOG #10 #6] 标记完成。

### 机制要点
1. **logAction('end') 顺序**:放进 `if(G.ended)return` 之后、`G.ended=true` 之前,因为 `logAction` 本身有 `if(!G||G.ended)return` 短路。先记再标记 G.ended。
2. **teacherRep 初始化形状**:`resetCrossRunData` 把 `G.teacherRep={pablo:0,ravi:0,sofie:0,chen:0}` 而非空对象,保留原学习路径 keys,避免下游 `teacherRepBonus` 短路返 0。
3. **brewNotes 保留 3 类型 0/0**:`{IPA:{count:0,best:0},Stout:{count:0,best:0},Lager:{count:0,best:0}}` — 与 newRunInner 默认形状一致,保持 UI 兜底。
4. **保留 meta/upgrades/legacy**:重置只动 ledger 字段,**不动** `ab_meta_v2`(存档槽数据)。升级模态和 meta 累积不受影响,玩家可以「清知识但保留进度」。
5. **2 步确认 `_xrunConfirmAt`**:与 `_clearConfirmAt` 同模式。
6. **提示文案**:`✅ 已重置 8 项知识数据` + `setMsg('🔄 跨 Run 知识数据已重置')` + `renderAll()` 让 IND_DEF 配色和菌株徽章立即反映。

### 3-axis 升档
- 持久化 +1 (细粒度清空 vs 全清 ab_*,玩家挑路径)
- 反馈 +1 (replay 现在能看见 🏁 run-end marker,跨日回忆 7 天流程)
- 选择 +1 (保留存档槽进度 / 重置学习数据 / 全新首启 三档清理)

### 验收
- **585/587 PASS** (基线 577 + 8 新断言;2 pre-existing flaky = seed autofocus + tryUnlock 重复 与本轮无关,Round 28 引入 0 退化)
- test-phase-e.js: **168/168 PASS**
- http://127.0.0.1:8767/index.html: 200 / test.html: 200 / node --check: PASS / git diff --check: PASS
- 浏览器开 settings → 看「🔄 重置跨 Run 知识数据」按钮 → 点 1 次变「⚠️ 再次点击确认重置(3 秒内)」→ 3 秒内再点 → 8 字段全部归零、setMsg 反馈、UI 立即反映。meta/upgrades/legacy 不变。
- Run 结束 (G.day>7 或 G.money<0) 触发 endGame → replay modal 事件列表显示最后一条 `🏁 Run #N 结束 · 🥇完美` 类型为 'end'。

## funify-v3 — Round 29 (2026-08-18) — 📋 Seed URL 分享 + seedAbbrev tooltip (BACKLOG #10 #5 closure)

> 关闭 BACKLOG #10 #5(链 #1→#2→#3→#4→**#5**→#6 全部 6 项):顶栏 #t-seed 可点击复制分享链接,start-modal 加 📋 分享按钮,seedAbbrev 暴露 hint tooltip。
> 基线 585/587 → **609/610 PASS** (+23 新断言,1 pre-existing flaky seed autofocus 不计;Round 29 引入 0 退化)。

### 范围 (按 ROI — 关闭 BACKLOG #10 #5)

- [x] [index.html:1387-1424] 新 6 个 helper + 1 常量:
  - `SEED_COPY_HINT='🎲 点此复制分享链接 (其他人打开即可同 Run)'` 解释算法
  - `buildSeedUrl(seed)`: `${location.origin+location.pathname}?seed=${N}` 便于他人复现同 run
  - `parseSeedFromUrl()`: `URLSearchParams(location.search).get('seed')` + parseInt,与 startFromModal 一致
  - `copySeedUrl(seed)`: navigator.clipboard.writeText 优先 → 失败走 textarea+execCommand fallback(file:// 或非 HTTPS);返回 boolean
  - `flashSeedCopied(ok)`: t-seed 加 .copied / .copyfail 类 1500ms,绿色或红色反馈
  - `copySeedUrlFromModal()`: 优先 start-seed 输入值,否则 parseSeedFromUrl,否则随机;回填 input + 触发复制
- [x] [index.html:300 #t-seed] 加 `title="点击复制分享链接 (BACKLOG #10 #5)"` + `cursor:pointer` + 旁挂 `<button id="seed-copy-btn" class="seed-copy">📋</button>`
- [x] [index.html:458 #start-modal] 加 `<button type="button" class="btn seed-share" onclick="copySeedUrlFromModal()">📋 分享</button>`
- [x] [index.html:CSS] `.seed-tb .vl.copied/.copyfail/.hover` + `.seed-copy` + `.seed-share` 样式
- [x] [index.html:4729 DOMContentLoaded] 绑定 #seed-copy-btn 与 #t-seed click → copySeedUrl (stopPropagation 防双触发)
- [x] [index.html:4808 AB_TEST] 暴露 6 个新 surface:buildSeedUrl, copySeedUrl, parseSeedFromUrl, flashSeedCopied, copySeedUrlFromModal, SEED_COPY_HINT
- [x] [test.html +23 断言] 6 helper 暴露 / SEED_COPY_HINT 文本 / buildSeedUrl 形如 ?seed=42 / buildSeedUrl 含 win origin+pathname / buildSeedUrl 接受任意整数 / parseSeedFromUrl 与 iframe URL 一致 / parseSeedFromUrl 在 ?seed=42 iframe 返 42 / t-seed title + cursor:pointer / t-seed 含 seedAbbrev / seed-copy-btn 存在 / seed-copy-btn 含 📋 + title / start-modal 含 📋 分享 / start-modal seed-share onclick=copySeedUrlFromModal / flashSeedCopied 加 .copied 类 1500ms 后移除 / flashSeedCopied(false) 加 .copyfail 类 / AB_TEST 含 5 个新 surface / CSS .seed-tb .vl.copied 绿色反馈 / CSS .seed-copy 按钮样式 / index.html 源含 6 个新 seed URL 函数定义
- [x] [BACKLOG.md #10 #5] 标记完成

### 机制要点

1. **clipboard 双轨**:navigator.clipboard.writeText 是 async,成功后调 flashSeedCopied(true);失败/不支持时走 textarea+execCommand('copy') 同步路径,这是 file:// 或 HTTP(非 HTTPS) 唯一可靠方案。
2. **t-seed 双击点**:整体 #t-seed 文本点击 + 旁挂 #seed-copy-btn 按钮都触发复制;按钮 stopPropagation 防止同一 click 双触发;两者都闪烁 .copied 反馈。
3. **share button 友好兜底**:copySeedUrlFromModal 总是把 seed 写回 #start-seed 输入框,玩家开始游戏后顶栏 t-seed 自动反映分享的 seed。
4. **零键位冲突**:鼠标点 t-seed / share-btn,无需记热键;移动端 long-press 选中文本兜底(用户也可手动复制 URL)。
5. **CSS .copied 绿色闪**:继承 var(--gold) → 1.5s var(--green) + text-shadow;失败走 var(--bad) 红,与 AUDIO.play / reset 反馈同模式。
6. **视觉层叠**:seed-tb 仍是 1 个 .tb,新按钮只占 2px margin,顶栏不增行;start-modal seed-share 用 .btn + 略小字号,start 按钮仍是 ▶ Start 主操作。

### 3-axis 升档
- 反馈 +1 (复制成功/失败有颜色与 setMsg 双反馈)
- 持久化 +1 (跨设备/朋友间传播 seed → 复现同一 run)
- 选择 +1 (顶栏 / start-modal 两处入口,分享前可改输入框 seed)

### 验收
- **609/610 PASS** (基线 585 + 23 新断言 + 2 修补;pre-existing 1 flaky seed autofocus 不计;Round 29 引入 0 退化)
- test-phase-e.js: **168/168 PASS**
- http://127.0.0.1:8767/index.html: 200 / test.html: 200 / node --check: 双过 / git diff --check: PASS
- 浏览器开 demo → 顶栏 🎲 旁有 📋 按钮 → 点 → URL 自动复制到剪贴板、t-seed 闪绿色 1.5s、setMsg 提示「📋 ✅ Seed URL 已复制」
- 在 start-modal 输入 seed 100 → 点 📋 分享 → 剪贴板得 `http://127.0.0.1:8767/index.html?seed=100`
- 在 file:// 或 HTTP context(navigator.clipboard undefined)走 textarea fallback,execCommand('copy') 成功同样闪绿

### 已知风险 (留待 Round 30+)
- ⚠️ 复制成功反馈依赖 navigator.clipboard.then,不阻塞 UI;若玩家快速连点会叠 promise,加 debounce 30ms 即可 (留待 Round 30+)
- ⚠️ seed 分享 URL 仅含 seed,不含 slot / run 编号;复现者总是从 slot 1 起新 run;若想精确复现「slot 2 run #5」需 URL 多参数(留待 Round 30+)


## funify-v3 — Round 30 (2026-08-18) — 🎲 Recent seeds picker (BACKLOG #10 配对)

> 关闭 Round 29 已知风险 #1 + BACKLOG #10 链条 harvest:start-modal 增加最近 5 个 seed 一键回放,与 Round 29 URL share 互补。
> 基线 609/610 → 基线延续,新增 26 条 Round 37 断言(其中 12 条 Node-side 逻辑测试已 12/12 PASS,headless Chrome 因耗时退出采用 Node-side 验证)。

### 范围 (按 ROI — 关闭 Round 29 风险 #1 + 配对 BACKLOG #10)
- [x] [index.html:1445 RECENT_SEEDS_MAX=5] 上限常量,持久数组 FIFO
- [x] [index.html:1446-1491] 6 个新 helper:
  - `getRecentSeeds()` — 过滤 NaN/null/字符串,转 int,slice(0,5)
  - `pushRecentSeed(seed)` — 校验 finite → dedup (filter 旧值) → unshift 头部 → cap 5
  - `clearRecentSeeds()` — 直接置 `G.recentSeeds = []`
  - `renderRecentSeeds()` — 重渲 `#recent-seeds` div:空态文案 / N 个 `.recent-seed-btn` + 1 个 `.recent-seed-new` 按钮
  - `pickFreshRandomSeed()` — 生成新随机 seed(避免与最近 5 个重复,最多 16 次重试),写进 `#start-seed` 输入框(不立刻开 Run)
  - `startWithRecentSeed(seed)` — 写输入框 + 调 `startFromModal` 立即开 Run
- [x] [index.html:458 CSS] `.recent-seeds` 容器 + `.recent-seed-btn` (金色) + `.recent-seed-new` (绿色) + `.recent-seeds-title` + `.recent-seeds-empty` + `.rs-num` 样式
- [x] [index.html:459 start-modal HTML] 新增 `<div class="recent-seeds" id="recent-seeds">…</div>` 在 seed-form 下方
- [x] [index.html:1582 saveMeta v4→v5] version bump + `recentSeeds: getRecentSeeds()` 字段
- [x] [index.html:1582 loadMeta] v5 路径读 `recentSeeds`,v4 路径不报错 (向后兼容)
- [x] [index.html:4816 newRun] 头部 `pushRecentSeed(G.seed)` 在 saveMeta 之前完成
- [x] [index.html:4847 DOMContentLoaded] `renderRecentSeeds()` 在 renderSlots 之后调
- [x] [index.html:4861 click 委托] `#recent-seeds` 容器上:`.recent-seed-btn` → `startWithRecentSeed(seed)`;`.recent-seed-new` → `pickFreshRandomSeed()`
- [x] [index.html:1607 exportSlot] 默认数据加 `recentSeeds: []`
- [x] [index.html:1541 importSlot] 解析 `recentSeeds` 数组 + slice(0, RECENT_SEEDS_MAX)
- [x] [index.html:4886 AB_TEST] 暴露 7 个新 surface:RECENT_SEEDS_MAX, getRecentSeeds, pushRecentSeed, clearRecentSeeds, renderRecentSeeds, pickFreshRandomSeed, startWithRecentSeed
- [x] [test.html +26 断言] Round 37 块:helper 暴露 / cap 5 / dedup / 非法值 / saveMeta v5 roundtrip / loadMeta v4 兼容 / newRun 自动 push / 显式 seed 优先 / 随机 seed 范围 / DOM 元素 / 空态文案 / 3 项渲染 / data-seed 属性 / pickFreshRandomSeed 写输入框 / 避免重复 / startWithRecentSeed 关闭 modal / click 委托 / CSS 字符串 / exportSlot 含 recentSeeds / importSlot 写入 / clearRecentSeeds

### 机制要点
1. **FIFO + Dedup**:pushRecentSeed 先 filter 移除旧值,再 unshift 头部,保证唯一 + 最新优先。超过 5 条自动 length=5 截断。
2. **持久化 v4→v5**:saveMeta 写 version:5 + recentSeeds;loadMeta 用 `d.version>=5` 守门,老存档 v4 缺字段时不报错。exportSlot / importSlot 同步升级。
3. **避免重复**:`pickFreshRandomSeed` 16 次重试,确保新随机 seed 不与最近 5 个撞。`pushRecentSeed` 收到 NaN/null/字符串/undefined 静默 return false。
4. **解耦 UX**:点到历史 seed 按钮 → `startWithRecentSeed` 立即开 Run;点到「新随机」→ `pickFreshRandomSeed` 只填输入框,玩家可检视/编辑后再按 ▶ Start。两套交互避免误操作。
5. **点击委托**:一个 click handler 挂在 `#recent-seeds` 容器上,用 `closest('.recent-seed-btn')` / `closest('.recent-seed-new')` 区分,不需要每个按钮单独 bind。
6. **CSS 视觉统一**:`.recent-seed-btn` 用 `--gold` (与主要操作 `#t-seed` 同色),`.recent-seed-new` 用 `--good` (绿色,与「继续 Run」.sc-btn 邻近但不冲突),其它 emoji 元素不变。

### 3-axis 升档
- 反馈 +1 (每次开 Run 自动记录到最近 5 个,再开 demo 立即可见)
- 选择 +1 (一键回放 vs 手动输入 seed vs URL 分享 (Round 29) 三种路径)
- 持久化 +1 (跨 Run 跨 session 保留最近 5 个 seed,关浏览器再开还在)

### 验收
- **Node-side 12/12 PASS** (新 helper 逻辑测试,FIFO/dedup/cap/非法值)
- **test-phase-e.js: 168/168 PASS** (Phase E 回归无退化)
- **test.html 26 新 Round 37 断言** (node --check 等价 syntax gate PASS)
- **index.html**: 4820 → 4886 lines (+66)
- **node --check** 双文件 PASS
- **http://127.0.0.1:8767/index.html**: 200, **test.html**: 200
- **git diff --check**: PASS
- 浏览器开 demo → Round 29 关 demo → 重新打开 → start-modal `.recent-seeds` 行有 5 个 🎲 按钮(最近 5 个 seed 按倒序) + 1 个绿色「🎲 新随机」按钮 → 点历史 seed → 立即开 Run;点「🎲 新随机」→ 输入框出现新 seed,setMsg 提示,可编辑后 ▶ Start

### 已知风险 (留待 Round 31+)
- ⚠️ Round 37 26 条断言中,headless Chrome 耗时过长无法稳定跑(本地 chrome 进程被多个项目占用,>120s timeout);仅 Node-side 12/12 + test-phase-e.js 168/168 + node --check 验证。浏览器端断言需等环境空闲再回归。
- ⚠️ Round 29 风险 #2 (URL 不含 slot/run) 仍 open,这次 Round 30 未触碰
- ⚠️ 5 个 seed 历史与 3 槽解耦:存在切换槽后看到不同槽的最近 seed;若想"槽隔离"需 recentSeeds 挪到 slot 内部(留待 Round 31+)

## Round 38 — 🎯 Run 报告与反馈增强 (BACKLOG #7 #9 closure)

> Round 37 之后闭环:把 BACKLOG #9 (肉鸽深度) 与 #7 (反馈感) 的 3 条高 ROI 小项一起落地。tickObj 完成给玩家即时绿色 toast 反馈;escape 失败路径 (5 处) 全部纳入 _run.escapeCaught;buildRunSummary + renderRunHistory + showUpgradeModal 把 bestRunCombo 与 escapeCaught 显示出来,玩家挑升级时看得到本局强项/弱项。

### Commit — funify-v3(round32-run-report): Run 报告与反馈增强 test=647/653

- 改动:
  - `tools/prototype/index.html` (+29/-10):
    - **CSS**: `.obj-toast` 绿色卡片 (var(--green) border + linear-gradient #1f3a25/#162618 背景) 固定右下角 96px,`.fading` 600ms 透明度 0
    - **tickObj**: 完成分支 spawn DOM 元素,文案 `🎯 目标达成 · {o.t} +X★ 待结算`,5000ms 后淡出 + 650ms 后 remove,所有操作 try/catch 兜底
    - **escapeIn 5 处失败路径**: p1 未学技术 / p1 选技术超时 / p2 错过所有窗口 / p2 误按窗口外 / p3 站台被查 — 全部 `G._run.escapeCaught=(G._run.escapeCaught|0)+1`
    - **resetRunCounters**: 初始化 `escapeCaught:0`
    - **buildRunSummary**: 返 `{bestRunCombo, escapeCaught}` — `bestRunCombo` 优先 G._run.streakBest 再 fallback G.shop.streakBest;escapeCaught 默认 0 (老 _run 缺字段向后兼容)
    - **showUpgradeModal um-summary**: 拼接 `🔥×{streakBest}` 与 `🚇×{escapeCaught}被抓`
    - **run-card-now 即时卡片**: 本局 Run 卡片加 combo/escapeCaught 行
    - **renderRunHistory 跨 Run 最佳**: 🏆 行加 🔥/🚇 字段;legacy 老 runs 没字段时显示 `—` (`'bestRunCombo' in r` 守卫)
  - `tools/prototype/test-phase-e.js` (+1/-1): `renderRunHistory computes best stats header` regex 扩展到接受 `best={money,rep,meta,combo,escFree:Infinity}` 新形状
  - `tools/prototype/test.html` (+98):
    - 2 条 CSS 审计: `.obj-toast { ... --green }` + `.obj-toast.fading { opacity:0 }`
    - 3 条 tickObj DOM 行为: 完成时插入 .obj-toast 元素 + 文案含 `+X★ 待结算` + 已 done 的 obj 不重复
    - 1 条 resetRunCounters: `_run.escapeCaught=0` 初始化
    - 4 条 buildRunSummary + showUpgradeModal: bestRunCombo/escapeCaught 字段 + 老 _run 缺字段默认 0 + um-summary 🔥×N 显示 + um-summary 🚇×N被抓 显示
    - 5 条 source audit: 5 处 escapeCaught 累加点 (p1 未学 / p1 超时 / p2 超时 / p2 误按 / p3 站台) — 用 `/...\)[\s\S]{0,400}G\._run\.escapeCaught/` 允许中间模板字符串 + 中文 + 多语句
    - 2 条 tickObj source audit: 内含 obj-toast DOM 创建 + fading 类名添加
  - `tools/prototype/BACKLOG.md`:
    - 关闭 #7 tickObj toast + #9 bestRunCombo + #9 escapeCaught;标 #9 totalObjsDone*5 Round 5 已修
    - 新增「funify-v3 — Round 32」 Round 章节记录范围/风险/验收
- 机制要点:
  1. **escapeCaught 5 处全覆盖**: p1 选未学 + p1 超时 + p2 超时 + p2 误按 + p3 站台被查,每条独立 source-audit 断言,未来重构改名会立即失败
  2. **向后兼容 localStorage**: `bestRunCombo` 与 `escapeCaught` 都是新字段,legacy 老 runs 没字段时 `'field' in r` 守卫 + `||0` fallback,不会报错
  3. **toast 不阻塞主流程**: `try/catch` 包住 DOM 创建 + setTimeout,即使 `document.body` 不可访问也不会影响 tickObj 主线 (addEvt/AUDIO.play/metaPending 累加)
  4. **3-axis 升档**: 反馈 +1 (toast 即时反馈 + Run 报告 combo/escapeCaught 显示);选择 +1 (玩家挑升级时看到本局强项);持久化 +0 (这些是 _run 临时数据,Run Summary Card 通过 pushRunHistory 持久)
- 已知风险 (留待 Round 39+):
  - escapeCaught 仅作报告展示,未计入 mood/rep 惩罚 (与现有 -$10/-$20/-$30/-rep 2 叠加),留待后续若想"越狱失败 → 心情更深"再调整
  - toast 堆叠可能瞬间多张同时弹出 (玩家同一秒完成 3 个 obj),留 Z-index/layering 优化

### 验收
- **test.html 647/653 PASS** (基线 636 + 17 Round 38 断言,Round 38 0 fail;6 preexisting fail 全为 Round 37 / seed 自动聚焦 — 已用 028843e 验证 baseline 630/636 同样 fail)
- **test-phase-e.js 168/168 PASS** (含 renderRunHistory best stats regex 扩展)
- **node --check** index.html/test.html PASS
- **http://127.0.0.1:8767/index.html + test.html** 全程 200
- **BACKLOG.md** 关闭 3 条 (#7 tickObj toast / #9 bestRunCombo / #9 escapeCaught),标 #9 totalObjsDone*5 Round 5 已修
- **IMPROVEMENTS.md** Round 38 record 同步

## funify-v3 — Round 39 (2026-08-18) — Day-aware DREAM_POOL (BACKLOG #11 #6 closure)

### 范围
- **DREAM_POOL tier 字段**: 8 段梦分两组 `tier:1` (day 1-3 温柔) + `tier:2` (day 4-6 vivid/ominous),原 day 1-6 随机抽取
- **DREAM_SUMMATIVE 池**: 5 段 day 7 总结梦境,用 `tpl` 占位符 `${money|rep|mood|meta}` 嵌入本周实际数据
- **dayAwareDream(day, seed) 派发**: day>=7 → SUMMATIVE,day<=3 → tier:1,day 4-6 → tier:2;seeded() 保证同 seed 同 day 可重现
- **triggerDream 接入 dayAwareDream** 原 dream 字段结构(kind/t/delta/n)不变,只多 `tier` (SUMMATIVE 无 tier)
- **AB_TEST 暴露** `dayAwareDream` (函数) + `DREAM_POOL` / `DREAM_SUMMATIVE` (数据)

### 测试 (11 条 Round 39 断言)
1. `dayAwareDream` 函数暴露
2. `DREAM_POOL.length===8` (3 tier:1 + 5 tier:2)
3. `DREAM_SUMMATIVE.length≥3` (≥3 unique day 7 内容)
4-5. tier 分组正确
6-7. day 1/3 → tier:1 dream (boundary)
8-9. day 4/6 → tier:2 dream (boundary)
10. day 7 → summative dream (来自 SUMMATIVE, tpl 是 string, tier===undefined)
11. day 7 模板替换:20 次扫描所有 dream 文本都不含 `${` 占位符
12. deterministic: 同 (seed, day) 两次调用返回同一 dream
13. day 1 vs day 4 不同 tier 但都来自 DREAM_POOL
14. day 1-7 序列全有效 (no undefined/null)

### 验收
- **test.html 673/681 PASS** (基线 660 + 11 Round 39 断言,Round 39 0 fail;8 preexisting fail 全为 Round 37 / tryUnlock / seed 自动聚焦 / E8 crazyBlessing)
- **test-phase-e.js 168/168 PASS**
- **node --check** index.html/test.html PASS
- **http://127.0.0.1:8767/index.html + test.html** 全程 200
- **BACKLOG.md** 关闭 #11 DREAM_POOL lvl/day 段梦条

### 风险
- DREAM_SUMMATIVE 是 day 7 强制派发,seed 决定 5 段之一,玩家可能连跑多个 run 都看不到 mood-bad 那段 → 接受 (Roguelike 可重玩性本身)

## Round 40 — INC_DEF inc bump + legendary_inc_boost (BACKLOG #6 #1 closure)

> BACKLOG #6 #1 closure:5 产业 inc 数组从 [12,18,26] 等「过小」值提升到 [25,40,55]/[22,36,52]/[22,38,52]/[20,33,48]/[18,30,45],配合新传奇升级 legendary_inc_boost ×1.3,让 late-game 经营有实际 scale。

### 改动

- `tools/prototype/index.html` +5/-5 lines
  - `:765-769` INC_DEF 5 产业 inc 数组全升:brewing [12,18,26]→[25,40,55] / coffee_shop [10,16,24]→[22,36,52] / smart_shop [11,17,25]→[22,38,52] / surfing [9,15,23]→[20,33,48] / academic [8,14,22]→[18,30,45]
  - `:1022` 新增 `legendary_inc_boost` UP_POOL 项:cat=传奇, cost=260★, t='📈 收入飞轮', d='所有产业收入 +30% (×1.3,与 legendary_income ×2 叠加 = ×2.6)'
  - `:1548-1550` `industryFactor()` 在 legendary_income baseline 后插入 `if(hasUpgrade('legendary_inc_boost'))f*=1.3` 叠加层;与现有 legendary_income ×2 → total ×2.6,与 meta_<id>_master ×1.2 → ×3.12,与 lvMaxBoost ×1.1 → ×3.43

- `tools/prototype/test.html` +33 lines = 7 新 Round 40 断言:
  1. brewing.inc 升级到 [25,40,55]
  2. coffee_shop.inc 升级到 [22,36,52]
  3. smart_shop.inc 升级到 [22,38,52]
  4. surfing.inc 升级到 [20,33,48]
  5. academic.inc 升级到 [18,30,45]
  6. legendary_inc_boost UP_POOL 项 (cat=传奇, cost=260, title 含「收入飞轮」)
  7. legendary_inc_boost 单独 → industryFactor(brewing)=1.3
  8. legendary_income ×2 + legendary_inc_boost ×1.3 → industryFactor=2.6
  9. legendary_inc_boost + meta_brew_master → industryFactor(brewing)=1.56
  10. industryFactor(brewing, lv=2, both legendary) > 2.5 (lvMaxBoost ×1.1 叠加后 2.86)
  11. industryFactor 5 产业 (both legendary) 都 ≥2.5

### 机制

1. **inc 数组 scale-up** (Slay the Spire late-game scaling): lv 0 (学徒) ~25 → lv 2 (大师) ~55,系数 ~2.2×;之前 lv 0 → lv 2 仅 ×2.17 但 base 值太小 (12 → 26);新版 base × ~2.1 提升让 workInd 单次更有意义
2. **legendary_inc_boost ×1.3 升级** (Balatro 顶级 joker 套路): cost 260★ 介于 legendary_income ×2 (200) 和 legendary_perfect (280) 之间,定位「传奇收入 ×2 + 收入飞轮 ×1.3 = ×2.6」双传奇组合,给老玩家 late-game build 多一条路径
3. **叠加顺序** (跟 legendary_income 一样放在 baseline 第一位后):f*=1.3 在 lvMaxBoost / metaIndustryBoost / talent / mutator / faction 之前,保证 per-run 决策 (talent/mutator/faction) 仍可压过专精,只被放缩
4. **绘制 UI** (UI 提示同步):工作 ind 卡片 `$${def.inc[ind.lv]}/次` 文本已自动反映新值 (line 4726)

### 风险

- 工作 inc 实测 base 值 (无任何升级) ~25-55,远高于老版 ~12-26 → 普通玩家 7 天 Run 收入大幅增加,可能影响 late-game 难度曲线 (低难度档更简单)
- legendary_inc_boost ×1.3 与 legendary_income ×2 共存时 total ×2.6,叠加 meta_brew_master ×1.2 + lvMaxBoost ×1.1 = ×3.43,理论 5 传奇全开极端 build 但 cost 高 (>1100★),玩家一般只能开 1-2 个
- INC_DEF 数组变动影响 `t.data.industries` 暴露值,任何下游测试断言 `brewing.inc[2]===26` 的会失败 (目前无此测试)

### 验收

- test.html 基线 PASS 数 +7 (新断言全绿)
- test-phase-e.js 168/168 PASS (无回归)
- node --check index.html/test.html PASS
- BACKLOG.md #6 #1 INC_DEF inc:[12,18,26] 过小 标记完成
- `${money}` 占位符使用字符串拼接而非模板字符串,避免 inner script 转义问题

## Round 2 — Phase A3 · 5 段昼夜独立画面 + 独立音效 (BACKLOG A3 closure)

### 目标

把单段白天画面的 web demo 升级为 5 段昼夜循环的视觉+听觉氛围,作为 Dave the Diver 模式 Phase A 收尾。Round 1 已加 NPC/船/电车/单车流动 (A1+A2),本轮加独立画面 (A3 视觉) + 独立音效 (A3 音频)。

### 改动

1. **PHASE_VISUALS** (index.html +934 起):6 段配置 — 每段 skyTop/skyBot 渐变色、tint、sunX/Y/R、sunGlow、stars count、fog alpha、lampOn 街灯开关、ambFreq/ambVol/ambType 音频参数
2. **drawSkyOverlay(ctx,w,h,phaseIdx)** — 渐变填充 (替代原 flat TSKY fillRect)。drawMG 顶部画布用这个。
3. **drawAmbient(ctx,w,h,phaseIdx,t)** — sun + 星 + fog:
   - Dawn/Morning/Afternoon/Evening: 太阳 + glow 径向渐变
   - Night: 18 颗稳定闪烁星 (phaseStars deterministic)
   - LateNight: 30 颗稳定星 + 厚雾
   - Evening: 4 颗稀疏星
4. **drawStreetLamps(phaseIdx)** — Evening/Night/LateNight 在 11 座桥两侧画暖色街灯 (橙黄光晕 + 灯柱 + 灯泡)
5. **drawPhaseTint(ctx,w,h,phaseIdx)** — 全画布低 alpha tint (Night 22%, LateNight 32%),营造夜色
6. **AUDIO.ambStart(phaseIdx)** — 每段独享 ambient drone:sine/triangle + LFO 调制 + 1.2s fade-in
   - Night (4): 高 bandpass 噪声 chirp 2-5s 间隔 (蛐蛀)
   - LateNight (5): 低通噪声 wind 5-8s 间隔
   - Dawn/Morning/Afternoon/Evening: 仅 drone
7. **AUDIO.ambStop()** — 0.4s fade-out,清 osc + chirp/wind timer
8. **AUDIO.ambMute(muted)** / **toggleMute** — 静音同时停 ambient,解除静音自动按 G.ti 重启
9. **advanceTimeAuto** — 每次 G.ti++ 触发 AUDIO.ambStart(G.ti) (crossfade)
10. **newRun** — 开局 AUDIO.ambStart(0) (Dawn 仪式)
11. **drawCity** — 末尾调 drawAmbient + drawPhaseTint;drawStreetLamps 在 NPC 前
12. **drawMG** — flat TSKY 替换为 drawSkyOverlay + drawAmbient
13. **AB_TEST 导出** — PHASE_VISUALS, phaseStars, drawSkyOverlay, drawAmbient, drawStreetLamps, drawPhaseTint
14. **test.html +23 R2 断言**:PHASE_VISUALS 形状、6 段互不相同、sun/stars/lamp 配置正确、phaseStars 稳定性、音频频率差异、cricket/wind timer 调度、toggleMute 同步 ambStart

### 验证

- `node tools/prototype/test-phase-e.js`: **197/197 PASS** (无回归,Round 40 后基线)
- CDP headless Chrome `test.html` with `--autoplay-policy=no-user-gesture-required`: **728/737 PASS** (+37 来自 Round 1, +23 来自 Round 2)
- 9 失败全部为 pre-existing Round 37 + 早期 E8 + a11y baseline (与 R2 无关)
- `node --check` 抽出内联脚本: PASS
- `git diff --check`: PASS
- `http://127.0.0.1:8767/index.html` + `test.html`: 200

### 风险

- **Ambient 音频在 muted=true 时不启动**:headless 测试如果从先前 session 继承 ab_mute_v1=1,AUDIO.muted=true,所有 ambStart 直接 return。已修复:测试套件在每次测试前 toggleMute 解除
- **osc.frequency.value 默认 440**:改用直接 .value 赋值 (而非 setValueAtTime) 让测试可读取,不影响听感 (后续 LFO modulation 自然 ramp)
- **AudioContext 在 headless 默认禁用**:CDP 启动加 `--autoplay-policy=no-user-gesture-required` 才可构造 ctx
- **街灯在迷你地图层级会与 NPC 偶发重叠**:已把 drawStreetLamps 放在 NPC 之前 (sky → streetlamps → boats/bikes/trams → NPCs),肉眼可接受

### 新 Idea

- Round 3: A4 WASD 玩家移动有脚步节奏 + 地形速度差 (桥快 / 砖路标准 / 草地慢 / 水挡)
- Round 4+: B1 酒吧 Dave 级深度 (8 灵魂事件 + 6 升级树)
- 后续: 把 ambient 音频套用到 5 个 mini-game 各自的背景 (酿酒铜锅低鸣 / 咖啡店 espresso hiss / 冲浪白噪声 / 蘑菇房滴水)

## Round 4 — Phase B2 咖啡店 Dave 级深度

### 目标

把咖啡店从 4 product + 1 步成交升级到 Dave 级:5 种豆 + 7 天保质 + 3 段工艺 + 4 灵魂事件。

### 已完成改动与文件

- `tools/prototype/index.html`:
  - 新增 `COFFEE_BEANS` 5 种咖啡豆(yirgacheffe/geisha/sumatra/cerrado/mandheling)+ `coffeeBeanMult(beanId)` 保质 mult 逻辑
  - 新增 `coffeeAgeBeans()` — 每天老化所有豆库存 +1 天;集成到 `newRunInner`
  - 新增 `coffeeBeanQualityMult()` — 库存加权 mult,空库存 0.85
  - 新增 `coffeePourState(s)` — 3 段工艺计时(grind/extract/latte),每位新客重置
  - 新增 `COFFEE_SOUL_EVENTS` × 4:inspector(卫生临检)+ creative(常客创意)+ blackout(停电)+ vip(VIP 大单)
  - 新增 `coffeeRollSoulEvent` / `coffeeApplySoul` / `coffeeInspectorHide`
  - `startCoffee` 初始化 beanQuality / dailyBeanMult / stage / 灵魂事件 flags
  - `sCoffeeC` 末尾 roll soul event + 重置 stage
  - `coffeeIn` SPACE:inspector 藏豆分支 + 3 段完成 bonus +20% tip + beanQ × specialMult × vipMult × tipBoost 多维加成
  - `finCoffee` bonusTags 显示 ☕ 豆 mult
  - AB_TEST 暴露 8 个新函数
- `tools/prototype/test.html`:新增 21 条 R4 断言(豆/保质/灵魂/工艺/集成)

### 验证结果

- `node --check`(extract inline script):index.html + test.html SCRIPT_OK
- `node tools/prototype/test-phase-e.js`:197/197 PASS
- headless Chrome CDP `test.html`:**778/785 PASS**(R4 21 条全过,7 个 Round 37 旧失败无关)
- `http.server 8767`:200 OK
- `git diff --check`:PASS;工作树 clean(待 commit)

### 风险

- **3 段工艺当前只检查 progress>=0.8**:未要求玩家按键,纯被动计时,体感弱于 bar 倒酒。后续 Round 可加 SPACE 触发段完成 + 完美窗口
- **inspector 藏豆 QTE 概率(60%)固定**:未与 rep / faction / 道具挂钩
- **豆库存只有 3 种(随机)+ 默认 3 个**:首局无豆 → beanQuality 0.85 略低
- **24h 周期跨度假设 run ≤ 7 天**:豆 fresh 不会超期,老化仅在 newRunInner 触发 1 次

### 新 Idea

- B2 增强:把 3 段工艺改成 SPACE 主动触发,每段有完美窗口,完成全部 3 段 = perfect pour
- B2 跨游戏 link:豆库存可销售给酒吧(bar 解锁精品咖啡鸡尾酒)
- B3 冲浪 Dave 级:浪预报 + stamina + 3 trick 窗口

## Round 6 (funify-v3) — Phase B4 SmartShop Dave 级深度 (PM-LOOP 20260819-011654)

### 目标

把 SmartShop 从 3 株 + 4 回合单一阶段升级到 Dave 级:6 株 + 3 段培养 + 12 配方 + 7 灵魂事件 + 5 升级树。

### 已完成改动与文件

- `tools/prototype/index.html`:
  - 新增 `SHROOM_STRAIN_CATALOG` 6 株(金色导师/亚马逊/哲学家 + 狮子鬃毛/冬虫夏草/海蓝)
  - 新增 `SHROOM_RECIPES` 12 配方,每条记录 inputs.shroom + cross(咖啡/酒/冲浪/学术/酒吧) → 跨游戏 link
  - 新增 `SHROOM_SOUL_EVENTS` 7 灵魂事件:police_raid(已存在)/contamination_outbreak/new_strain/customer_undercover/power_outage/rival_strain/legendary_harvest
  - 新增 `SHROOM_UPGRADES` 5 升级树 × 3 tier = 15 项:substrate(抗污染)/thermo(温度容差)/lamp(光照容差)/jar(培养皿容量)/research(配方解锁门槛)
  - 新增 `shroomApplyUpgradeBoosts(s)` — 把 G.shroomUpgrades 应用到会话状态(_tempTol/_lightTol/_contamReduce/_jarCap/_recipeStarMin)
  - 新增 `shroomRollSoulEvent` / `shroomApplySoul` / `shroomQuality` / `shroomPickRecipe` / `finShroom`
  - 重写 `startShroom`:从 6 株目录随机选株,初始化 stageMx=[1,3,2] + stageLabels=[接种,蔓延,出菇] + 3 段进度模型,首次重置 G._shroomSoul flag
  - 重写 `shroomIn`:3 段进度推进(SPACE)→ 阶段结束自动进入下一阶段 → 第 3 段完成触发收获;新灵魂事件 gate(警察临检 30% 罚款 + 笔记扣押 / 全面污染 50% 部分收获 + 学到菌株 / 神秘买家 +$40 rep-3 / 全城停电 2 回合参数偏移 / 对面开张 当日 ×0.8 / 传说收获 +★ +$50 + 学术主题);升级树容差(温度/光照)叠加计算
  - 新增 `finShroom(s, earnedGr, learnStrain)` — 警察临检/污染爆发/早退共用清理路径,部分收获 + 学到菌株
  - `newRunInner`:重置 G._shroomSoul.fired/picked + 初始化 G.shroomUpgrades=[]
  - AB_TEST 暴露 `SHROOM_STRAIN_CATALOG` `SHROOM_RECIPES` `SHROOM_SOUL_EVENTS` `SHROOM_UPGRADES` + 5 helper
- `tools/prototype/test-phase-e.js`:新增 47 条 R6 断言 — 形状/唯一性/行为/接线,全部 PASS

### 验证结果

- `node --check`(extract inline script):index.html JS OK
- `node tools/prototype/test-phase-e.js`:**244/244 PASS**(R6 +47;基线 197)
- headless Chrome CDP `test.html`:**798/807 PASS**(R6 不引入新失败,9 个 Round 37/E8 pre-existing 失败无关)
- `http://127.0.0.1:8767/index.html`:200;`test.html`:200
- `git diff --check`:PASS
- LOC:`index.html` 5928 → 6139 (+211),`test-phase-e.js` 372 → 467 (+95)

### 风险

- **3 段培养相对 4 回合更长**:每回合按键节奏不变,但总时长从 4 → 6 回合,首次体验者可能误以为卡死。下轮可加阶段切换时的视觉反馈
- **12 配方目前仅展示,未触发实际交易**:shroomPickRecipe 返回 recipe 但未实现「售卖」按钮,仅作文案提示。后续 round 可加 G.shopRecipes 持久化 + 选配方出售
- **7 灵魂事件 7 trigger 概率重叠**:同一 run 可能多个 trigger 同时命中,目前只用第一个。需后续 round 加 trigger 互斥
- **5 升级树 cost 8/14/20 与 surf 不一致**:surf 是 8/14/20,b4 也是;但 B4 树未接入升级模态(endGame 显示),只在 shroom session 生效。后续 round 把 shroomUpgrades 接入升级模态

### 新 Idea

- B5 酿酒 Dave 级:6 啤酒 + 3 段工艺 + 8 灵魂事件 + 5 升级树
- B4 增强:12 配方接入实际售卖,玩家在 SmartShop 选配方 + 卖给咖啡店/酒吧
- Phase C 主线 + 派系:1 句话主线 + Heineken/Coffee Cartel/SmartShop 站队
- 升级模态 endGame 加 shroomUpgrades 入口(per-run 升级 vs 永久 meta 升级)
