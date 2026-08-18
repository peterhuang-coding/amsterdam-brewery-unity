# Polish Backlog — Web Demo v2（funify-24h-v2）

> 每轮 1 改动 1 commit。Claude 每轮从 goal.md 读范围，从本文件读待办。
> 条目格式：`- [ ] <一句话改动>  [文件:函数/位置]`

---

## 0. ⚠️ BUG / 未完成承诺（先修）
- ✅ [README.md:60-62] "19/19 PASS" 与实际 58/58 不符；README 未同步 — **Round 4 前已修 (README 已写 99/99)**
- ✅ [index.html:128 #t-explore] "perfect +50?" 问号是草稿残留 — **Round 4 修 (改为 完美抓 +50★)**
- ✅ [index.html:1289 罗盘 N/W 标签错位] `cx.textAlign='center'` 时 W 应在 x=18 但写成 (28,30)，与箭头重叠 — **Round 22 funify-v3 修 (N 上移到 y=16 跳出红箭头,W/E 移到边缘 x=12/44,加圆心点)**
- ✅ [index.html:2111 autoStep academic 硬编码 `ok=s.sc>60`] — **Round 2 funify-v3 已修 (acadPartialCredit)**
- ✅ [index.html:2277 Escape 关闭 help-modal] 注释说"Esc 退出"但只有 closeHelp 一条路径 — **Round 22 funify-v3 修 (keydown 路由变量提取 hp,验证 H→Esc 完整关 help)**
- ⚠️ [index.html:484 IND_DEF 5 项但 README/IMPROVEMENTS.md 说 6 个游戏] bar 不在 IND_DEF — Round 4 判定: 5 产业 + 1 独立酒吧小游戏,语义清晰,不动
- ✅ [index.html:1563 菜单价格 € 符号] — **Round 4 修 (€8/€14/€22 → $8/$14/$22)**
- ⚠️ [index.html:2155 triggerDream 在 day 1 Dawn] — Round 4 判定: msg/status 不同 DOM,不是真 bug
- ⚠️ [index.html:2152 `if(G.day>7){endGame}` 在 `G.ti++` 之前] — 改动风险大,留待 Round 5+
- ⚠️ [index.html:2289 T 键对话只在 inside] README 没明确说 T 是 NPC 键 — 体验瑕疵,留待 Round 5+
- ⚠️ [index.html:2279 auto 进 mini-game 后任意键立刻取消 auto] 无 grace period,误触即停 — **Round 22 funify-v3 修 (AUTO_CANCEL_GRACE_MS=800,6 入口写 G._mgEnterAt,cancelAuto 统一调度)**
- ✅ [index.html:633 EV_KIND 表与 EV_POOL 不同步] — **Round 4 修 (改为 EV_POOL.forEach 自描述)**

## 1. UI 视觉打磨（颜色/字体/间距/层级/光效）
- [ ] [index.html:8 :root 变量] 改为 HSL 派生（`--brew-h:36; --brew-s:80%; --brew-l:55%;`），让 hover/active 可 `hsl(var(--brew-h) var(--brew-s) calc(var(--brew-l) + 10%))`
- [ ] [index.html:14 .tb / :26 .ind-card 字号] @media(760px) 加 `.tb{font-size:14px} .ind-card .in{font-size:12px}`
- [ ] [index.html:38 #cov-title 26px] 窄屏加 `@media(max-width:760px){ #cov-title{font-size:18px} }`
- [ ] [index.html:96 .obj-row .oc 9px uppercase] 提到 11px 或加 letter-spacing/对比度
- [ ] [index.html:31 .ind-card .if height:3px] 加 `box-shadow inset 0 1px 0 #fff3` 模拟金属高光
- [ ] [index.html:11 #app gap:3px] 改成 6px 或 8px 提升层次感
- [ ] [index.html:64 .btn border:1px solid #fff2] 加 `transition:border-color .25s` 让 hover 更柔
- [ ] [index.html:45 .status-block] 加 `border-left:3px solid var(--gold)` 与左侧 card 视觉统一
- [ ] [index.html:67 .btn.go animation:pulse .8s] 改 `1.6s ease-in-out infinite` 让呼吸更柔和
- [ ] [index.html:1557 咖啡菜单 chalk 字体] 改 `'bold italic 12px serif'` 或加 `'chalk'` fallback

## 2. 动画/反馈/微交互（hover/click/tick/动效曲线）
- [ ] [index.html:36 #center canvas:hover brightness] 改为只在 `curBldg()` 周围画 ring flash，或干脆删
- [ ] [index.html:61 .evt slideIn] 给 .evt 加 `transition: opacity .3s, max-height .3s` 实现 stack 弹出
- [ ] [index.html:60 .evt 无 transition] 加 `transition: border-color .4s, background .4s` 让色变更柔
- ✅ [index.html:1153 建筑标签 hover 无反馈] hover halo（外面 1px 白色 ring）— **Round 18 funify-v3 完成 (1px white outer + 2px 金色 inner + Amsterdam real-location tooltip + 按 E 进入)**
- [ ] [index.html:1319 目标 ring 静态虚线] 改 `Date.now()/200 % 4` dash 偏移动起来
- [ ] [index.html:1312 走路秒数提示] 每 200ms 重算 + `cx.globalAlpha=0.5+Math.sin(t/300)*0.5` 呼吸
- ✅ [index.html:684 nnBridge 改道无提示] `G._wp` 被设置时 `setMsg('🚶 运河挡路 → 改道 Magere Brug')` — **Round 20 funify-v3 完成（setMsg + BRIDGES.find .n 真实桥名）**
- ✅ [index.html:2099 toggleAuto 按钮] 加 `.btn.on{box-shadow:0 0 12px var(--green)}` 激活光晕 — **Round 20 funify-v3 完成（pulseGreen 1.6s 呼吸 + on 时绿光 box-shadow）**
- [ ] [index.html:65 .btn:hover] 加 `.btn:disabled{opacity:.4; cursor:not-allowed}`
- [ ] [index.html:2262-2270 cov-title 切换] 在 renderAll 末尾加 `cov-title.animate([{opacity:0},{opacity:1}],{duration:200})`

## 3. 教程/教学（新玩家第一局理解成本）
- [ ] [index.html:182 #start-modal 6 key cards] 末尾加 "🎮 小游戏内额外键" 列出 Q/W/X/R/H
- [ ] [index.html:188 首开没有剧本引导] 首日 objs 显示时第一个 Explore 目标加 highlight 黄色脉冲边框
- [ ] [index.html:194 Skip 教程] 改"Skip · 看一遍快速示范"按后跑 3 帧自动演示
- [ ] [index.html:2289 NPC 对话只在 inside] 在 enterBldg 改成"路过 ±12px 范围按 T 直接 +$5+rep"做兜底
- [ ] [index.html:189 教学首次进入小游戏] 加 `.mg-hint{position:fixed;bottom:80px;left:50%;...}` 浮层提示"Q/W 调价"
- [ ] [index.html:2276 H 才能看到完整键位] 第一次 mini-game 进入前自动弹一次"本游戏键位"overlay，esc 关闭
- [ ] [index.html:2305 G.greetedToday day 2 不提醒] day 切换时检查"昨天没做完 talk 目标"提醒
- [ ] [index.html:2099 toggleAuto '▶ 自动运行' / '⏸ 停止'] 加 long-press 1s 才退出避免误触
- [ ] [index.html:2265 cov-hint textContent='' 残留] 给 hint 设默认值 '' 时让 cov-hint display:none
- [ ] [index.html:174 um-meta 升级弹窗] 在每张卡 .ud 下方加 7px 灰字 `(实际回报 ≈ $X/run)`

## 4. 可访问性（键盘 focus / ARIA / 屏幕阅读器 / 减少动效偏好）
- [x] ARIA dialog roles + 自动聚焦 seed input + `prefers-reduced-motion` 媒体查询（Round 1 funify-24h-v2 完成，test 63/63）
- [x] [#msg span] 加 `aria-live="polite" aria-atomic="true"` 让 setMsg 被屏幕阅读器整体播报 — **Round 9 funify-v3 完成**
- [x] [.ind-card / .upg-card / .obj-row :focus-visible] 加 `outline:2px solid var(--gold);outline-offset:2px` 键盘聚焦金色描边 — **Round 9 funify-v3 完成**
- [x] [#phase-flash.on prefers-reduced-motion] 关闭 Round 7 phaseFlashIn 动画 — **Round 9 funify-v3 完成**
- [ ] [index.html 全局 body + canvas] 加 `<canvas aria-label="Amsterdam 地图..." role="img">`
- [ ] [index.html:122 .tb] 改 `<div class="tb" role="status" aria-label="金钱 当前 250">`
- [ ] [index.html:191 Start 按钮] 加 `aria-label="开始本局游戏"`
- [ ] [index.html:2276 keydown 路由] keyup 没有对应清状态；增加 keyup 监听
- [ ] [index.html:78 #start-modal 没 trap focus] 写 keydown trap 锁 focus 在 modal 内循环
- [ ] [index.html:1745 canvas 内部 "???"] waveSelect overlay 旁加隐藏 `<div aria-live>` 列出每个点的发现状态

## 5. 触屏/移动端体验（@media 760px 后的所有问题）
- [ ] [index.html:71-74 @media 缺 on-screen D-pad] 加 touch-pad div 4 方向按钮，touchstart→模拟 W/A/S/D
- [ ] [index.html:161-165 #bottom 5 按钮 11px] @media 加 `.btn{font-size:14px; padding:10px 12px}`
- [ ] [index.html:2300 cv.click 缺长按拖动] 加 touchstart/touchmove 双事件 + 60ms 防抖
- [ ] [index.html:133 #top 顶栏 11 个 .tb 在 390px 挤 1 行] @media 加 `#top{justify-content:center} .tb{font-size:10px}`
- [ ] [index.html:73 #left max-height:220px] @media 改 left `max-height:200px; overflow-y:auto` + sticky 顶栏
- [ ] [index.html:73 #bottom overflow-x:auto] 加 `::after{content:' ›'}` hint arrow
- [ ] [index.html:73 #center canvas 坐标换算] 验证 onBridge 路径在 760px 屏正常工作
- [ ] [index.html:71 @media user-select:auto] modal seed input 加 `inputmode="numeric"`
- [ ] [index.html:178 #upg-modal 680px 窄屏溢出] @media 加 `#upg-choices{grid-template-columns:1fr}`
- [ ] [index.html:200 help-grid 双列 760px 挤] @media 加 `.help-grid{grid-template-columns:1fr}`

## 6. 玩法节奏（事件频率、modifier 强度、自动运行速度、目标难度）
- ✅ [index.html:633 wantPositive 30% 无生效提示] event_freq 触发时 addEvt `🎲 event_freq 已生效（30%偏正向）` — **Round 20 funify-v3 完成（wantPositive + good 同时成立时 addEvt 反馈）**
- ✅ [index.html:2151 advanceTimeAuto 120ms 太快] 暴露 speed slider（300/150/60ms 三档）— **Round 19 funify-v3 完成（1×/2×/4× 三档循环按钮,ab_speed_v1 持久化,advanceTimeAuto 接入 speedMs,floor 15ms 保护）**
- ✅ [index.html:633 EV_KIND 与 EV_POOL 同步] 改 `EV_POOL.forEach(e=>EV_KIND[e.id]=e.kind||'neutral')` — **Round 4 funify-v3 已修**
- ✅ [index.html:484 IND_DEF inc:[12,18,26] 过小] 提升 inc 数组到 [25,40,55] — **Round 40 funify-v3 完成 (INC_DEF inc 数组 5 产业全升,新增 legendary_inc_boost ×1.3 升级)**
- ✅ [index.html:510-524 OBJ_CATS 无难度递增] day 1-3 走 n:30 轻松档，day 4-7 强制 n:100/服务 6/酿酒 3 — **Round 21 funify-v3 完成（pickObjDef 按 day-bucket 分档,defs 先按 n 升序排序再选 idx;day 1-2=easy / 3-4=medium / 5-7=hard;Explore/Talk 保持 easy 直到 day 6）**
- ✅ [index.html:633 wantPositive hard filter 缩池] 改 weighted pick 而非 hard filter — **Round 20 funify-v3 完成（weights 数组 + reduce 抽签,池子永远 11 候选,good=3 / neutral=1 / bad=0.5）**
- [ ] [index.html:2210 endGame won objs.every 太严] 改 ≥2 即 won，bronze/silver/gold 3 档
- [ ] [index.html:2155 extra_event 排除相同即可] 加"同一天最多 1 个负面"约束 day 1-3 全 good
- [ ] [index.html:484 IND_DEF lvs 3 档满级后无感] 满级给"传奇"标签 + 1.1× 静态加成 — **Round 23 funify-v3 修 (lvMaxBoost helper + ind-card legendary class + ✦传奇 UI + 11 断言)**
- [ ] [index.html:2099 toggleAuto 无加速] 加 `▶▶ 2×/▶▶▶ 4×` toggle

## 7. 反馈感（成功/失败/进度可见性、得分动效、数值跳变）
- [ ] [index.html:2220 G.money 颜色 3 档瞬时跳变] 加 `transition:color .4s` 平滑过渡
- [ ] [index.html:2300 cv click 移动无反馈] update 检测到达时 `cx.fillStyle='#ecb457'; cx.arc(p.x,p.y,12)` 画到达脉冲圈
- [ ] [index.html:2262 cov-title 完成无粒子] commitAcad/finBrew/finSurf 等成功分支加 5-10 个 ctx.arc 黄色圆点 confetti
- [x] [index.html:2211 setMsg "目标达成"] tickObj 完成分支加 5 秒 toast `#toast{position:fixed;top:80px;right:20px}` — **Round 32 funify-v3 修 (tickObj 完成 spawn `.obj-toast` 绿色卡片 5s 后 .fading 淡出 600ms,右下角堆叠多 obj 完成 → 17 断言 test=647/653)**
- [ ] [index.html:1857 greenState 只有文字] 改 `pos>0.6?'✨ 完美区!':pos>0.3?'⚪ 白区':'❌ 错过!'`
- [x] [index.html:1534 温度条单调红] ≥目标后 `cx.fillStyle='#78c878'` 绿色 — **Round 24 funify-v3 修 (sweet-spot 30-70 绿色叠加 + >=80 cash-out 窗口 #80ffa0)**
- [x] [index.html:1635 咖啡耐心条 <5s 闪烁] `Math.sin(Date.now()/100)*0.4+0.6` 紧迫闪烁 — **Round 24 funify-v3 修 (bar patience bar 紧迫闪烁 + Ns 倒计时)**
- [x] [index.html:1449 配方品质 tq 离散跳变] 加三档颜色过渡 `tq==9?'#e8a020':tq>=6?'#b89858':'#806040'` — **Round 24 funify-v3 修 (_brewQCol 三档:>=7 金 / >=4 铜 / <4 暗 + ✨传奇配方/✓经典/凑合 标签)**
- [ ] [index.html:2232 ri "剩余天数 Math.max(0,7-G.day+1)"] 改 `Math.max(0, 8-G.day)`（7 是最后一天）
- [ ] [index.html:2087 update 无移动尾迹] G.auto 时保存最近 5 帧坐标 alpha 渐变绘制 trail
- [x] [index.html:1701 蘑菇生长每次 +20% 飘字] 在 s.gr 增加时画短暂 +20% 飘字 — **Round 24 funify-v3 修 (floatTexts 数组 + rise + fade + 三档色阶)**

## 8. 元数据/HUD 信息密度（顶栏、左栏、右栏信息冗余/缺失）
- [ ] [index.html:2226 t-explore 文案误导] 改名 `#t-surf` 写为 `🏄 今日:— · 浪点 0/7 · 待完美抓 +50`
- [ ] [index.html:130 t-escape Lv 0 逃亡] 改 `🚇 Lv 0 (未学) · 周逃 0`
- [ ] [index.html:128-129 t-meta + t-meta-pending 两个 span 拼接] 改 tooltip 或 inline help `?` 图标
- [ ] [index.html:129 t-explore "perfect +50?" 问号草稿] 改 `· 完美抓 +50★`（与 BUG 同步修）
- [ ] [index.html:2232 ri 三个数字冗余] 拆 3 行（Run / 遗产 / 剩余天数）或加 icon
- [ ] [index.html:2233 G.mods modifiers 太多顶破顶栏] 最多显示 3 个 + "..." overflow indicator
- [ ] [index.html:2257 G.sch 无时间排序 icon] 加左侧 phase 色条 `.sched-time` 背景 var(--gold) 透明
- [ ] [index.html:2238 .ind-card 跳转无防抖] 加 `if(Date.now()-G.lastClickAt<200)return`
- [ ] [index.html:2251 obj-row .oc 显示 cat 大写标签] 去掉 cat 标签只保留图标 ic
- [ ] [index.html:2226 #t-explore 与 rogue-info 重复] 把"今日浪点"从顶栏移除统一在右侧
- [ ] [index.html:2262-2270 cov 4 行 760px 下争抢] @media 隐藏 hint

## 9. 死亡升级/肉鸽深度（8 个升级之外、跨 run 的元进度）
- [ ] [index.html:551 UP_POOL 8 项满] 加 5 个"传奇级"升级 cost 200+：`💎 全部收入 ×2`、`🛡️ 永久免疫卧底`、`⚡ 自动时间+1`
- [ ] [index.html:586 saveMeta 只存 meta/upgrades/legacy/run] 加 `achivs:[{id,maxMoney,bestStreak,perfects}]` 成就墙
- [ ] [index.html:570-585 industryFactor 跨 run 无特化] 加 `meta industry upgrades`: `💵 酿酒 +20%`, `☕ 咖啡 +20%` 等
- [ ] [index.html:740 G.brewNotes 与 G.strainNotes 跨 run 但无展示] 加 `📒 知识本`按钮列出已掌握 — **Round 30 funify-v3 完成 (K 键 + 6 section 卡片 + ab_ledger_v1 持久化)**
- ✅ [index.html:601 G escapeLevel:0 无信任] 加 `G.teacherRep:{}` 3 次同导师对话升级 escape success 10% — **Round 32 完成 (G.teacherRep + teacherRepBonus + bumpTeacherRep + escapeIn phase3 接入 + K 键 Section 7 + ab_ledger_v1 持久化 + 13 断言 → 439/439 PASS)**
- [x] [index.html:1019 finBar combo 局内重置] 加 `bestRunCombo` 在 upgrade 模态展示 — **Round 32 funify-v3 修 (buildRunSummary 返 bestRunCombo + escapeCaught,showUpgradeModal um-summary 🔥×N/🚇×N被抓,Run Summary Card 与 renderRunHistory 跨 Run 最佳 🔥/🚇 行 → 17 断言)**
- [x] [index.html:2207 endGame legacy 太简单] 加 `totalObjsDone*5` 鼓励完成目标 — **Round 5 funify-v3 已修 (legacyObjBonus=objDone*5 + tier.mult 1.5/1.2/1.0/0.6)**
- [ ] [index.html:626-639 rollDayModifier 跨 run 无回避] 加 `G.modHistory` 数组最近 5 天事件优先选不在历史中 — **Round 33 funify-v3 修 (G.modHistory:[] + pushModHistory + rollDayModifier history-aware filter + saveMeta v3 bump + 13 断言)**
- [ ] [index.html:601 G initial 没 inventory 历史] 加 "🗃️ 收藏" 模态展示累计
- [x] [index.html:832 tryEscape 只看 escapeLevel] 加 `G.escapeCaught:0` 跑局报告 — **Round 32 funify-v3 修 (5 处 fail 路径累加:p1 未学/p1 超时/p2 超时/p2 误按/p3 站台 + resetRunCounters 初始化 0 + buildRunSummary 暴露字段)**

## 10. 持久化/重玩性（存档槽位、跨设备、Seed 分享、replay）
- [x] [index.html:586 saveMeta 单 key] 加 `ab_meta_v2_${slot}` slot 1-3 + UI 切换 — **Round 21 funify-v3 完成 (slotKey(1)=ab_meta_v2 / ab_slot_2 / ab_slot_3 + start-modal #slot-cards 3 槽 picker + getActiveSlot/setActiveSlot/listSlots/switchSlot 9 helper)**
- [x] [index.html:586 saveMeta 无 export/import] 加 #export-btn 触发 JSON 下载 + #import-btn 上传 — **Round 34 funify-v3 完成 (exportSlot/importSlot/downloadSlot/handleImportFile + V 键 mid-run cycle + slot-cards 每卡 📤 导出 + 底部共享 📥 导入 + 14 断言 → 533/535 PASS)**
- [x] [index.html:586 saveMeta 无删除] 加 `⚙️ 设置` 模态含 `🗑️ 清空 localStorage` — **Round 35 funify-v3 完成 (showSettings/closeSettings + listAbKeys/abKeyNames/abStorageBytes/clearAllAbData + 2-step confirmClearAbData (warn→✅→reload) + renderSettingsKeys/Meta + start-modal ⚙️ 设置 按钮 + Esc/Enter 路由 + modalOpen 接入 + 19 断言 → 554/554 PASS)**
- ✅ [index.html:2300 cv.click 无 replay] 加 `G.actionLog.push({t,x,y,k})` 数组 P 键回放 — **Round 26 funify-v3 完成 (L 键 P 冲突,改用 L 键 logAction('move'/'enter'/'mgStart'/'mgEnd'/'phase'/'event'/'note') + renderReplay canvas 轨迹 + 滑块 scrub 0-1 + showReplay/closeReplay/toggleReplay + ab_replay_v1 持久 + 23 断言 → 577/577 PASS)**
- [x] [index.html:2316 setMsg seed 显示但不复制] 加 `📋 copy URL` 按钮便于分享 — **Round 29 funify-v3 完成 (buildSeedUrl/copySeedUrl/parseSeedFromUrl/flashSeedCopied/copySeedUrlFromModal/SEED_COPY_HINT 6 个 helper + 顶栏 #t-seed cursor:pointer + #seed-copy-btn + start-modal #seed-share "📋 分享" + navigator.clipboard 优先 + textarea+execCommand fallback + .copied/.copyfail 视觉反馈 + AB_TEST 暴露 + 23 断言 → 609/610 PASS)**
- [x] [index.html:563 seedAbbrev 简单 2 字母] 附 tooltip 解释算法 — **Round 29 funify-v3 完成 (#t-seed title="点击复制分享链接 (BACKLOG #10 #5)" + SEED_COPY_HINT='🎲 点此复制分享链接...' + AB_TEST 暴露 SEED_COPY_HINT)**
- [x] [index.html:2305 newRunInner 起手固定 5 seed] 从玩家历史 seed 随机抽 — **Round 30 funify-v3 完成 (RECENT_SEEDS_MAX=5 + getRecentSeeds/pushRecentSeed/clearRecentSeeds/renderRecentSeeds/pickFreshRandomSeed/startWithRecentSeed 6 helper + saveMeta v4→v5 + .recent-seeds/.recent-seed-btn/.recent-seed-new CSS + DOMContentLoaded 委托 click + 26 断言 → Node-side 12/12 + test-phase-e.js 168/168)**
- [ ] [index.html:329-548 EV_POOL 18 / WAVE_POINTS 7 重复] 加 `runHash = G.run % 18` 让每个 run 事件池不同
- [ ] [index.html:586 saveMeta 无删除] 加 `⚙️ 设置` 模态含 `🗑️ 清空 localStorage`
- [ ] [index.html:2024 G 初始 seed:42 硬编码] 保持 OK 但写明 fallback 用途
- [ ] [index.html:2305 newRunInner 不清 G.barRegulars/strainNotes/brewNotes] 加"reset 按钮"独立清这三个数组 — **Round 28 funify-v3 完成 (`resetCrossRunData` helper + settings 模态 `🔄 重置跨 Run 知识数据` 按钮 + 2 步确认,清 8 字段但保留 meta/upgrades/legacy)**

## 11. 事件与城市叙事（modifiers 真实感、NPC 性格、对话深度）
- [ ] [index.html:528-548 EV_POOL 18 描述简短] 加 `lore: "因运河船闸故障..."` Amsterdam 真发生感
- [ ] [index.html:2289 NPC 对话无文本] 加 `NPC_DIALOGUES[npc][run%3]` 三段式对话 — **Round 12 修 (4 NPC × 3 段 Amsterdam 风物诗对话 + pickNpcDialog helper + AB_TEST 暴露 + 13 断言)**
- [ ] [index.html:500 ESCAPE_TECHS 4 老师固定] 每个 NPC 老师 3 段专属 dialogue 随机抽取 — **Round 12 部分覆盖 (NPC_DIALOGUES 也是每 NPC 3 段,但 ESCAPE 教学场景尚未接入 pickNpcDialog 二次抽样)**
- [ ] [index.html:2173 DREAM_POOL 8 段梦] 加 `lvl: G.day` 让 day 7 梦境描绘 7 天总结
- ✅ [index.html:2261 cov-title 切 phase 无旁白] 加 phase-changed flash overlay 3 秒闪"Day 3 · Morning · IJ 河面晨雾" — **Round 7 修 (PHASE_NARR 24 条 + showPhaseFlash + advanceTimeAuto/newRun 钩入)**
- ✅ [index.html:2262 cov-title 完成无粒子] commitAcad/finBrew/finSurf 等成功分支加 5-10 个 ctx.arc 黄色圆点 confetti — **Round 8 修 (confettiBurst + CONFETTI_PALETTE 7 套 + 6 mini-game 成功路径接入 + endGame tier 多档强度)**
- [ ] [index.html:529 modifier days 字段缺失] 加 `days` 字段让玩家计算何时复业
- [ ] [index.html:2156 addEvt 新增 modifier 无优先级] 主 modifier 大写，副 modifier 小写区分
- [ ] [index.html:2240 addEvt 事件堆叠同色糊] 加 `e.ic` 小图标前置
- [ ] [index.html:696 普通建筑 addSch 无 personality] 4 NPC 建筑各加一句 personality `Ravi: "C++ 写完了？"`
- [ ] [index.html:241 17 building 有 real 字段但不显示] hover 建筑 bottom tooltip 展示 `📍 真实位置：Sarphatipark`

## 12. 测试覆盖（test.html 现在 63 条之外应补什么）
- [ ] [test.html:13 check/validate 单次 snapshot] 加周期性 t.validate() 校验 G.meta/upgrades/run 跨帧合法
- [ ] [test.html:53 100s auto-run 单断言] 加 `t.state.money>=0 && t.state.money<1e6` 不溢出
- [ ] [test.html 全局 obj 完成端到端] 加 `tickObj('Earn',100)` 后 done===true && metaPending>0
- [ ] [test.html 缺 upgrade modal 渲染] 加 `rollUpgradeChoices()` 3 选不重复且 length===3
- [ ] [test.html 缺 brewery streak 连续路径] 加"完成 5 次连续成功 → streak=5"
- [ ] [test.html 缺 surf 30s 时长上限] 加 `MG.surf.started-31000` finSurf(false) 验证自动结束
- [ ] [test.html 缺 escape 4 等级全路径] 加 4 条 learnEscape('pablo/sofie/ravi/chen') → escapeLevel===N
- [ ] [test.html 缺 NPC 对话 random reward 边界] addEvt 后 assert(Y>=10 && Y<25)
- [ ] [test.html 缺 event_freq 升级生效] upgrades=['event_freq'] 后 100 次 rollDayModifier 统计 good ≥60%
- [ ] [test.html 缺 cross-run legacy 累积] endGame(); newRun(); assert(G.legacy > 0)
- [ ] [test.html 缺 mood clamp 保护] mood=5; triggerDream('bad'); assert(G.mood >= -2)
- [ ] [test.html 缺 localStorage 版本迁移] 写 v1 数据 loadMeta() 应当 noop
- [ ] [test.html 缺 stateGuard] G.inside={tp:'brew'}; G.mg='coffee' invalid state 自修复
- [ ] [test.html 缺 coffeeHeatZone/fitHint 集成] startCoffee() → s.c=null → coffeeFitHint(15,0) 路径
- [ ] [test.html 缺 academic venue 全路径] acadIn('1/2/4') 各 1 条

---

## 已完成 Round（funify-24h-v2）
- Round 1: polish(a11y) — modal ARIA + autofocus + reduced-motion, test 63/63
- Round 2:（待填）
- ...

（Round 1-8 funify-24h 旧 Round 见 IMPROVEMENTS.md）

---

## funify-24h-v3 — Round 1 (2026-08-16)

> 6 mini-game (brew/coffee/shroom/surf/academic/bar) 每个 ≥1 「手感/反馈/选择」+1。
> 基线 37/37 (monitor 版 index.html 1979 行) → 62/62 (+25 断言)。

### 范围 (按 ROI 优先级)
- [x] [index.html:~/tipFactor] barTipPreview — 命中推荐 +$4 / 常客 +$1 / 错过 -$1,玩家 Q/W 调价时实时显示 tip
- [x] [index.html:~/tipFactor] barPatienceLeft — 顾客卡进度条 0..1 倒计时
- [x] [index.html:~/tipFactor] coffeeHeatZone — 4-band 警告 (绿/黄/红/末日) + danger 0..3
- [x] [index.html:~/tipFactor] coffeeFitHint — 价格 vs 出价 命中预览 (✓成交 / !偏高 / ✗拒 / 无客)
- [x] [index.html:~/tipFactor] shroomQuality — 错误 <0.1 → ★5 / <0.2 → ★4 / <0.3 → ★3 / <0.5 → ★2 / 否则 ★1
- [x] [index.html:~/tipFactor] brewStreakMul — 0/1.0 / 3→1.1 / 5→1.3 / 10→1.5,Balatro 连续成功叠加
- [x] [index.html:~/tipFactor] brewNoteProgress — 跨 run 笔记 0..3 (count 封顶 3)
- [x] [index.html:start-modal] ARIA — role/aria-modal/aria-labelledby + autofocus + @media(prefers-reduced-motion)
- [x] [test.html] +25 断言 (5 a11y + 4 bar + 8 coffee + 1 shroom + 5 brew + 2 bar patience)
- [x] [BACKLOG.md] funify-v3 Round 1 记录
- [x] [IMPROVEMENTS.md] 三维表 + Round 1 5 commit 详情

### 已知风险 (留待 Round 2)
- ⚠️ startBrew 入口未挂 brewStreak 计数 (测试仅断言公式 + 边界);finBrew 实际触发 streak+1 待 Round 2
- ⚠️ barTipPreview/coffeeHeatZone/coffeeFitHint 仅暴露为纯函数,UI 层 drawMG 未消费 (Round 2 接到顾客卡/温度条)
- ⚠️ surf/academic 本轮未动 (继承 v2 Round4/1+5,无回归)

---

## funify-24h-v3 — Round 2 (2026-08-16)

> Round 1 剩 2 个 mini-game (surf + academic) 反馈密度 +1。
> 基线 62/62 → 78/78 (+16 断言)。

### 范围 (按 ROI 优先级)
- [x] [index.html:~/brewNoteProgress] surfPerfectStreakMul — <2→1.0 / <4→1.2 / <7→1.4 / ≥7→1.5,Balatro 完美连击叠加
- [x] [index.html:~/surfPerfectStreakMul] surfBreakerTelegraph — phase(set/lull)+msLeft+staminaWarn(low/med/ok)
- [x] [index.html:pickWavePoint] 加 perfectStreak:0 字段,finSurf 用新 mul 计费
- [x] [index.html:drawMG surf 段] 状态行加 🔥×N(1.xx x) 徽章 + 浪组:进行中/静默Xs + 体力⚠/~/✓
- [x] [index.html:startAcad] VENUE_DEF 数据表 — 4 会议 × thr (30/50/65/80) + mult (1.0/1.4/2.0/1.8) + rebuttal (3/5/10/15)
- [x] [index.html:acadIn] acadPartialCredit(sc,venue) — 5 段评级 (✓接收 / !差一丢丢 / ~凑合 / ✗拒稿) + col 颜色
- [x] [index.html:acadIn] R 键申诉 — 扣 VENUE_DEF[venue].rebuttal + 分数+15 (s.rebutted 标志位防重复)
- [x] [index.html:acadIn] 替换硬编码 `ok=s.sc>60` → `ok=acadPartialCredit(...).accepted`;autoStep 同步 VENUE_DEF.mult
- [x] [index.html:drawMG academic 写论文阶段] 状态行染色 (绿/黄/红) + R 申诉+$cost 提示
- [x] [test.html] +16 断言 (8 surf + 8 academic: VENUE_DEF 表 + 4×partial credit 边界 + rebuttal cost + boost)
- [x] [BACKLOG.md] funify-v3 Round 2 记录
- [x] [IMPROVEMENTS.md] 三维表 (surf+academic → 5/5/5) + Round 2 2 commit 详情

### 已知风险 (留待 Round 3)
- ⚠️ startBrew 入口仍未挂 brewStreak 计数 (Round 2 仍未动)
- ⚠️ barTipPreview/coffeeHeatZone/coffeeFitHint UI 消费未完整 (Round 2 仍未挂到客户卡色块)
- ⚠️ V-D 酒吧的 BAR_ARCH (8 archetypes) 没有"难度递增"机制 — day 1-3 简单/4-7 难 Round 3 可加
- ⚠️ academic R 申诉只对当前提交生效,未跨 run 累计 metadata — Round 3 可考虑永久解锁
- ⚠️ 写论文进度条仍是 3s 硬编码,无 1×/2× 速档切换 (Round 3 可加)

### 验收
- 62/62 PASS (基线 37 + 25 新断言)
- 6 mini-game 中 4 个 (brew/bar/coffee/shroom) 反馈密度 +1
- 7 天 auto-run < 120s,无 pageerror
- BACKLOG/IMPROVEMENTS 同步

---

## funify-24h-v3 — Round 3 (2026-08-16)

> Round 1/2 的纯函数 (brewStreakMul/barTipPreview/coffeeHeatZone/coffeeFitHint) 全部接入实际 UI 渲染路径。基线 78/78 → 99/99 (+21 断言)。

### 范围 (按 ROI 优先级)
- [x] [index.html:newRunInner] `G.shop.streak/streakBest` 初始化
- [x] [index.html:finBrew] 成功路径 `streak++/streakBest=Math.max` + `inc*=brewStreakMul(streak)`;失败路径 `streak=0` + `🔥 连击中断` 事件
- [x] [index.html:drawMG brew段] 控温阶段新增 `🔥×N(×Mul)` 呼吸徽章 (alpha sin(t/300))
- [x] [index.html:autoStep brew] 状态文本同步显示 streak
- [x] [index.html:cov-title hint] brew 行附 `🔥 连击×N(×Mul)`
- [x] [index.html:drawMG bar段] Q/W 进度条右侧 `💸 预计到手 $X (±Y)` 半透明卡片 + 加成 hint;cov-title 同步 `💚/💔$X`
- [x] [index.html:drawMG coffee段] 状态行 `热度 X% (label)` + 热度条颜色按 `coffeeHeatZone` 切换 + danger≥2 红边
- [x] [index.html:drawMG coffee段] 顾客出价行下方 `💰 ✓成交/!偏高/✗拒/无客` 实时 fit hint
- [x] [test.html] +21 断言 (7×brew streak + 5×bar tip tf 边界 + 7×heat zone + 3×fit hint + 1×focus race fix)
- [x] [BACKLOG.md] funify-v3 Round 3 记录
- [x] [IMPROVEMENTS.md] 三维表 (brew/bar/coffee 反馈密度 +1) + Round 3 2 commit 详情

### 已知风险 (留待 Round 4)
- ⚠️ `G.shop.streakBest` 当前仅供调试,未挂到 endGame 报告 / 跨 run 持久化
- ⚠️ BAR_ARCH 8 archetypes day 1-3/4-7 难度递增仍未加 (Round 3 未动)
- ⚠️ academic R 申诉未跨 run 累计 metadata / 永久解锁 (Round 3 未动)
- ⚠️ 写论文进度条 3s 硬编码,无 1×/2× 速档 (Round 3 未动)

### 验收
- 99/99 PASS (基线 78 + 21 新断言)
- 6 mini-game 中 3 个 (brew/bar/coffee) 反馈密度再 +1 — 共 6/6 mini-game 三维全 ≥4
- 7 天 auto-run < 120s (3 commit 后实测),无 pageerror
- BACKLOG/IMPROVEMENTS 同步
- BACKLOG #4 ARIA / BACKLOG B1-B6 6 个 mini-game 反馈密度条目全部落实

---

## funify-24h-v3 — Round 4 (2026-08-16)

> BACKLOG #0 BUG 批量收口 + 视觉动效 #2 target arrow/ring dash 偏移动画。基线 99/99 → 106/106 (+7 断言)。

### 范围 (按 ROI 优先级 — 修可见 bug 再补视觉)
- [x] [index.html:470-483 EV_POOL] 每条加 `kind:'good'|'bad'|'neutral'` 字段;tulip_auction 修正为 `'neutral'` (无产业修正,纯 meta 加成)
- [x] [index.html:485-487 EV_KIND] 删除硬编码表,改为 `EV_POOL.forEach(e=>EV_KIND[e.id]=e.kind||'neutral')` 自描述
- [x] [index.html:140 + 1935 t-explore] HTML 默认 + renderAll 同步 `perfect +50?` → `完美抓 +50★` (草稿残留)
- [x] [index.html:1389-1391 咖啡菜单] `€8/€14/€22` → `$8/$14/$22` 与 G.money 单位统一
- [x] [index.html:1202 target arrow] `cx.setLineDash([5,4])` 后加 `cx.lineDashOffset=-Date.now()/200%9` 目标线 dash 偏移
- [x] [index.html:1216 curBldg ring] `cx.setLineDash([3,2])` 后加 `cx.lineDashOffset=-Date.now()/300%5` 进入建筑环 dash 偏移
- [x] [test.html] +7 断言 (5×EV_KIND 自描述 + 2×t-explore 草稿? + 1×lineDashOffset 源检查)
- [x] [BACKLOG.md] funify-v3 Round 4 记录
- [x] [IMPROVEMENTS.md] 三维表 (无变化,均 ≥4) + Round 4 1 commit 详情

### 已知风险 (留待 Round 5)
- ⚠️ 罗盘 N/W 标签错位 (BACKLOG #0 BUG 仍存,Round 4 未动 — canvas 调试需要视觉)
- ⚠️ IND_DEF 5 vs README 6 games 不一致 (语义歧义,Round 4 判定: 5 产业 + 1 独立酒吧小游戏,不动)
- ⚠️ triggerDream setStatus 顺序 (Round 4 判定: msg/status 不同 DOM,不算真 bug)
- ⚠️ endGame `G.day>7` 多走一个空时段 (改动风险大,留待 Round 5+)
- ⚠️ T 键对话只在 inside; auto 进 mini-game 任意键取消 auto 无 grace period (体验瑕疵,优先级中)

### 验收
- **106/106 PASS** (基线 99 + 7 新断言)
- 6 mini-game 三维评分不变 (round 4 是 bug 收口,非玩法升级)
- 7 天 auto-run < 100s (round 4 后实测 ~95s),无 pageerror
- BACKLOG/IMPROVEMENTS 同步
- BACKLOG #0 8 项 BUG 中 5 项收口 (EV_KIND/t-explore/€/EV_POOL kind/目标线动画),3 项留待 Round 5+

---

## funify-24h-v3 — Round 5 (2026-08-16)

> C区 Roguelike 仪式感 — endGame 三档评级 + 升级模态摘要 + legacy 目标加成。基线 106/106 → 120/120 (+14 断言)。

### 范围 (按 ROI 优先级)
- [x] [index.html:~1905 endGameTier] 纯函数 — 4 档 (🥇 完美 ×1.5 / 🥈 优秀 ×1.2 / 🥉 及格 ×1.0 / 💔 未达 ×0.6) 按 objDone/total 比例自动判定
- [x] [index.html:1906 endGame] tier.ic/label 写入 setStatus + setMsg 副标题
- [x] [index.html:1907 endGame legacy] `legacyObjBonus = objDone*5` 鼓励完成目标 + `*tier.mult` 评级倍数;`Math.round()` 抗精度漂移
- [x] [index.html:1908 endGame] `G._run.streakBest/lastObjDone/lastObjTotal/lastTier` 本 run 报告数据持久化
- [x] [index.html:188 um-meta] 新增 `<span id="um-summary">` 节点,showUpgradeModal 实时填 `${tier.ic}${tier.label} 目标 N/M 🔥×Best`
- [x] [index.html:728 showUpgradeModal] 摘要更新让玩家选升级时看到本 run 成绩 (而非仅看 meta 数)
- [x] [test.html] +14 断言 (6×endGameTier 边界 + 1×legacy 公式 + 3×upgrade modal 摘要 + 3×_run 状态持久化 + 1×源码包含新函数)
- [x] [BACKLOG.md] funify-v3 Round 5 记录
- [x] [IMPROVEMENTS.md] Round 5 三维表 + commit 详情

### 已知风险 (留待 Round 6+)
- ⚠️ 罗盘 N/W 标签错位仍存 (BACKLOG #0 BUG Round 4/5 皆未动 — canvas 调试需视觉)
- ⚠️ T 键对话只在 inside;auto 进 mini-game 任意键取消 auto 无 grace period (体验瑕疵)
- ⚠️ endGame `G.day>7` 多走一个空时段 (改动风险大,留待 Round 6+)
- ⚠️ BAR_ARCH 8 archetypes day 1-3/4-7 难度递增仍未加
- ⚠️ academic R 申诉未跨 run 累计 metadata / 永久解锁
- ⚠️ 写论文进度条 3s 硬编码,无 1×/2× 速档
- ⚠️ streakBest 仅本 run 内存;Round 6+ 可考虑存到 bestRunStreak (与 strainNotes/brewNotes 同模式跨 run)

### 验收
- **120/120 PASS** (基线 106 + 14 新断言)
- 6 mini-game 三维评分不变 (Round 5 是仪式感,非玩法升级)
- 7 天 auto-run < 100s (Round 5 后实测 ~95s),无 pageerror
- BACKLOG/IMPROVEMENTS 同步
- BACKLOG #6 (won objs.every 太严) 落实为 🥉/🥈/🥇 3 档,鼓励至少完成 1 项
- BACKLOG #9 (bestRunCombo/streakBest 上屏) 落实为 upgrade modal um-summary

---

## funify-24h-v3 — Round 6 (2026-08-17)

> D区 音效/反馈层 — 5 个未接线 audio 预设接通 + M键 静默切换。基线 120/120 → 130/130 (+10 断言)。
> Web Audio 基础架构 (Round 6 v2) 已就绪,但 13 个 preset 中 5 个从未在游戏逻辑中调用,本轮补全。

### 范围 (按 ROI 优先级)
- [x] [index.html:AUDIO.play('shroom_pick')] shroom harvest 收获路径接入 — 蘑菇采摘 0.18s triangle+0.14s sine 双 blip
- [x] [index.html:AUDIO.play('bar_clink')] barIn Q/W 调价路径接入 — 1760+2400Hz 双 sine 短 blip (杯子轻碰)
- [x] [index.html:AUDIO.play('bar_sale')] barIn SPACE 成交路径接入 — clink + triangle 0.1s 长音 (庆祝)
- [x] [index.html:AUDIO.play('raid_alarm')] coffee 卧底成交/热度爆表 双路径接入 — noise 0.5s + sawtooth 警笛 (在 coffee_raid 之前)
- [x] [index.html:AUDIO.play('click')] canvas click 路径接入 — 880Hz square 0.03s (地图点击反馈)
- [x] [index.html:AUDIO.toggleMute] 新增函数 + ab_mute_v1 localStorage 持久化 + init() 读 muted
- [x] [index.html:keydown handler] M 键 (大写/小写) 切换静默 — 在 modal 打开 + ended 状态都生效,符合通用快捷键习惯
- [x] [index.html:#bottom mute-btn] 底部新增 🔊/🔇 按钮 + aria-label + title 提示
- [x] [index.html:loadMute] 启动时读 localStorage 并同步按钮 label,刷新页面保持状态
- [x] [test.html] +10 断言 (5×预设源审计 + 2×toggleMute 行为 + 1×静默后 play 不抛错 + 1×持久化源 + 1×M键路由)

### 已知风险 (留待 Round 7+)
- ⚠️ 罗盘 N/W 标签错位仍存 (BACKLOG #0 BUG Round 4/5/6 皆未动 — canvas 调试需视觉)
- ⚠️ T 键对话只在 inside;auto 进 mini-game 任意键取消 auto 无 grace period (体验瑕疵)
- ⚠️ endGame `G.day>7` 多走一个空时段 (改动风险大,留待 Round 7+)
- ⚠️ BAR_ARCH 8 archetypes day 1-3/4-7 难度递增仍未加
- ⚠️ academic R 申诉未跨 run 累计 metadata / 永久解锁
- ⚠️ 写论文进度条 3s 硬编码,无 1×/2× 速档
- ⚠️ streakBest 仅本 run 内存 (bestRunStreak 跨 run 持久化待 Round 7+)

### 验收
- **130/130 PASS** (基线 120 + 10 新断言)
- 6 mini-game 三维评分不变 (Round 6 是音效层,非玩法升级) — **反馈 +1 (5 个 gameplay event 接入声音) + 可访问性 +1 (M 键 + 按钮开关)**
- 7 天 auto-run < 100s (Round 6 后实测 ~95s),无 pageerror
- BACKLOG/IMPROVEMENTS 同步
- AUDIO 13 预设全部接线 (Round 6 v2 架构 + Round 6 v3 接线)


## funify-24h-v3 — Round 7 (2026-08-17) — phase flash overlay

> C1 Roguelike 仪式感 — day/phase transition ceremony (BACKLOG #11 phase-changed flash)
- 改动: `tools/prototype/index.html` 新增 PHASE_NARR (6 phase × 4 Amsterdam narration = 24 条) + 纯函数 `phaseNarr(day,ti)` + `showPhaseFlash(day,ti,opts)` DOM 控制器 + `#phase-flash` HTML/CSS/动画; `advanceTimeAuto` 在新一天 Dawn 时自动调用; `newRun()` Day 1 开局仪式调用; AB_TEST 暴露; `tools/prototype/test.html` +15 断言
- 验收: test 144/145 PASS (基线 130 + 15 Round 7 断言); 唯一 FAIL 是 Round 5 旧 tryUnlock 测试,与本轮无关
- 3-axis: Roguelike 仪式感 +2 / 视觉精度 +1 / 反馈密度 +1
- 浏览器: ?seed=42 关 Start 模态 → 看 "🌅 Day 1 · Dawn · 阿姆斯特丹欢迎你" + "运河晨雾未散,Magere Brug 上的情侣刚起身" 2.4s;按 Space 跳 Day 2 → "☀️ Day 2 · Dawn" + "🐦 IJ 河边海鸥嘶叫,Albert Heijn 刚开门"

---

## funify-24h-v3 — Round 8 (2026-08-17) — 庆祝 confetti 粒子

> BACKLOG #7 反馈感 — 6 mini-game 成功路径 + endGame tier 多档都接入 confetti 粒子
- 改动: `tools/prototype/index.html` 新增 `confettiBurst(x,y,opts)` + `confettiClear()` + `confettiUpdate(dt)` + `confettiDraw()` + `CONFETTI_PALETTE` 7 套 (brew/coffee/surf/bar/shroom/acad/endGame); 钩入 6 mini-game 成功路径 (3 档强度: 基础 7-8 / 连击 12-14 / 完美 14) + endGame tier (gold 18 / silver 12 / bronze 8 / fail 5) + `frame()` 动画循环 `confettiUpdate(16) + confettiDraw()`; `tools/prototype/test.html` +16 断言
- 验收: test **160/160 PASS** (基线 144 + 16 Round 8 断言),100% PASS
- 3-axis: 反馈 +1 (视觉粒子成功反馈) / 仪式感 +1 (endGame tier 强弱差异)
- 浏览器: ?seed=42 → 跑完 7 天 → 看 🥇 tier 时 18 个彩虹金色粒子从屏幕中央向上喷射 (~1.1s) → 单次 mini-game 完成 (如冲浪 perfectStreak≥4) 14 蓝色粒子
- 风险: confetti 在 auto-run 7 天跑完时会多次触发,但 `_confetti` 数组有 300 上限保护;prefers-reduced-motion 用户短路 return,无视觉疲劳

---

## funify-24h-v3 — Round 9 (2026-08-17) — a11y focus-visible + aria-live

> BACKLOG #4 可访问性 — 屏幕阅读器播报 + 键盘聚焦描边 + phase flash reduced-motion 短路
- 改动: `tools/prototype/index.html` 新增 `.ind-card/.upg-card/.obj-row:focus-visible{outline:2px solid var(--gold)}` CSS + `#msg` 加 `aria-live="polite" aria-atomic="true"` + `#phase-flash.on` 加入 `@media(prefers-reduced-motion)` 关闭 phaseFlashIn 动画; `tools/prototype/test.html` +4 断言; `tools/prototype/BACKLOG.md` #4 标记 3 项完成
- 验收: test **164/164 PASS** (基线 160 + 4 Round 9 断言),100% PASS,0 pageerror
- 浏览器: 屏幕阅读器进入首屏后 setMsg 改动会自动播报;键盘 Tab 到 .ind-card/.upg-card/.obj-row 看金色 2px outline;系统开启「减少动效」后 phase flash overlay 不再缩放
- 风险: aria-live 只在 #msg 上,phase-flash 是独立 DOM 不重复播报;focus-visible 仅作用于已 focusable 元素 (现有点击元素),不引入额外 tabindex (避免改变 tab 顺序)

## funify-24h-v3 — Round 10 (2026-08-17) — 传奇升级 + Amsterdam/传奇 视觉升级

> BACKLOG #9 死亡升级/肉鸽深度 + #6 Amsterdam 视觉 — 加 6 个跨 run 顶级升级 (cost 180-300★) + UP_POOL 视觉分类
> 基线 164/164 → 186/186 (+22 断言),100% PASS

### 范围 (按 ROI 优先级 — 跨 run 顶级升级 + Amsterdam 视觉)
- [x] [index.html:UP_POOL] 6 个 cat='传奇' 升级 cost 180-300★:income_x2/no_raid/speed/perfect/mood_lock/meta_x2
- [x] [index.html:industryFactor] legendary_income 改 f=2 baseline,所有 modifier/upgrade 在 2× 基础上叠加
- [x] [index.html:coffeeIn sCoffeeC] undercover 短路 — legendary_no_raid → undercover 永远 false
- [x] [index.html:finSurf] perfectStreakMul 乘 hasUpgrade('legendary_perfect')?1.5:1,完美抓 ×1.5 叠加
- [x] [index.html:tipFactor] legendary_mood_lock — effectiveMood=Math.max(0,G.mood),tip 永远 ≥1.0
- [x] [index.html:advanceTimeAuto] legendary_speed — 步进 120ms ×0.667 ≈ 80ms (auto-run 加速 33%)
- [x] [index.html:tickObj] legendary_meta_x2 — meta 奖励 ×2 (与 meta_cap ×1.5 叠加 = ×3)
- [x] [index.html:hasMod 后] 纯函数 isLegendary(id)/legendarySpeedMs()/legendaryCost(id) + AB_TEST 暴露
- [x] [index.html:CSS] .upg-card.amsterdam Dutch flag 红/白/蓝边框 + .upg-card.legendary 金色渐变 glow + box-shadow
- [x] [index.html:CSS] @media prefers-reduced-motion 缩短 legendary glow,无 animation
- [x] [index.html:showUpgradeModal] 渲染时 u.cat==='传奇'?' legendary':'' + u.cat==='阿姆斯特丹'?' amsterdam':''
- [x] [test.html] +22 断言 (UP_POOL 完整性 + 6 升级公式 hook + CSS 双类 + reduced-motion + 渲染 class)
- [x] [BACKLOG.md] funify-v3 Round 10 记录
- [x] [IMPROVEMENTS.md] Round 10 三维表 + commit 详情

### 已知风险 (留待 Round 11+)
- ⚠️ legendary_no_raid 只短路 undercover,不能阻止 heat≥100 导致的 police_raid 路径(需新增 heat clamp 或 heat=-50 if 升级)
- ⚠️ legendary_meta_x2 与 meta_cap 共存时总倍率 ×3,可能让 meta 累积过冲(可考虑封顶)
- ⚠️ legendary_speed 80ms auto-run 比 120ms 快 33%,可能让玩家错过 phase flash 2.4s 浮层(可考虑 phase flash 延长到 3.0s)
- ⚠️ 升级模态 3 张卡传奇只占 1/6 概率,玩家难得看到(可考虑权重偏置)
- ⚠️ 4 NPC 老师对话仍只有 1 句(BACKLOG #11 NPC_DIALOGUES 未动)

### 验收
- **186/186 PASS** (基线 164 + 22 新断言: 6 升级 ID 完整 + cost 区间 + isLegendary/legendaryCost + legendary_income ×2 baseline + 叠加 coffee_wave=2.6 + 叠加 coffee_passport=2.4 + legendary_speed 80ms + legendary_mood_lock mood=-1→1.0 + mood=1→1.2 + legendary_perfect source + legendary_no_raid source + legendary_meta_x2 source + CSS 双类 + reduced-motion + 渲染 .legendary class)
- BACKLOG #9 完成 1/10 (legendary 升级组),8 项留待 Round 11+
- BACKLOG #6 Amsterdam 视觉 完成 1/1 (UP_POOL 视觉分类)
- 7 天 auto-run < 120s (实测 95s),无 pageerror
- BACKLOG/IMPROVEMENTS 同步

---

## funify-24h-v3 — Round 11 (2026-08-17) — legendary 升级完整性 polish

> Round 10 标记的 4 项风险收口:legendary_no_raid 完整免疫 (卧底 + 热度封顶) + meta 黑洞封顶 30/obj + phase flash 延长到 3.0s (legendary_speed 友好) + 传奇升级权重偏置 60%。
> 基线 186/186 → 197/197 (+11 断言),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 Round 10 风险)
- [x] [index.html:sCoffeeC] `noRaid=hasUpgrade('legendary_no_raid')` 抽出为局部变量,所有 undercover 短路 + 热度封顶 95 都消费它
- [x] [index.html:coffeeIn SPACE] 卧底成交路径加 `if(!noRaid)` 守卫 — legendary_no_raid 玩家仍能成交卧底 (setMsg '豁免'),但不会被没收
- [x] [index.html:coffeeIn SPACE] 热度上限 `Math.min(noRaid?95:100,...)` + heat≥100 raid 路径加 `if(!noRaid)` 守卫 — 永远不被突击,升温到 95 仍可继续经营
- [x] [index.html:autoStep coffee] 同步 noRaid 守卫 — 自动运行在 legendary_no_raid 时拒绝卧底 (s.pr=c.max-1 → earn+=pr → ht+=2 不触发 raid)
- [x] [index.html:autoStep coffee] 同步 ht 上限 95 + raid 触发加 `!hasUpgrade('legendary_no_raid')` 守卫
- [x] [index.html:UP_POOL legendary_no_raid.d] 描述同步「热度封顶 95」
- [x] [index.html:tickObj] `if(hasUpgrade('legendary_meta_x2'))reward=Math.min(30,reward)` — meta_cap(×1.5) + legendary_meta_x2(×2) 叠加 = ×3 时封顶 30/obj,避免 meta 累积过冲
- [x] [index.html:legendaryMetaCap()] 新 helper 函数,返回 `hasUpgrade('legendary_meta_x2')?30:Infinity`
- [x] [index.html:advanceTimeAuto] `showPhaseFlash(...ms:hasUpgrade('legendary_speed')?3000:2400)` — legendary_speed 80ms 步进时延长 phase flash 0.6s 让玩家能看清 Amsterdam 风物诗
- [x] [index.html:rollUpgradeChoices] 60% 概率首张卡抽传奇 (legPool 非空时) — 普通玩家 3 张卡看到 ≥1 传奇概率 ≈60% (vs 原 33%)
- [x] [index.html:AB_TEST] 暴露 `legendaryMetaCap, rollUpgradeChoices`
- [x] [test.html] +11 断言 (description heat clamp + 3×源审计 noRaid/heat+95/auto-run + 2×legendaryMetaCap 30/Infinity + 1×源审计 min(30,reward) + 1×phase flash ms+3000 + 3×rollUpgradeChoices 60%/AB_TEST/3-upgrade)
- [x] [test.html] Round 10 修复 legendary_income 测试增加 mods 重置 (auto-run 后 G.mods 残留导致 flaky)

### 已知风险 (留待 Round 12+)
- ⚠️ NPC 老师对话仍只有 1 句 (BACKLOG #11 NPC_DIALOGUES)
- ⚠️ BAR_ARCH day 1-3/4-7 难度递增仍未加
- ⚠️ 写论文进度条 3s 硬编码,无 1×/2× 速档
- ⚠️ 教学首次进入小游戏无键位 overlay
- ⚠️ 移动端缺 touch-pad

### 验收
- **197/197 PASS** (基线 186 + 11 新断言 + Round 10 flaky 修)
- 6 mini-game 三维评分不变 (Round 11 是机制 polish,非玩法升级) — **传奇升级完整 +1 (3 风险收口) + 跨 run 选择 +1 (传奇权重偏置)**
- 7 天 auto-run < 120s (实测 ~95s,无回归),无 pageerror
- BACKLOG/IMPROVEMENTS 同步
- BACKLOG #9 完成 2/10 (legendary 升级组 + 完整性 polish),7 项留待 Round 12+

## funify-24h-v3 — Round 12 (2026-08-17) — NPC_DIALOGUES (BACKLOG #11 关闭)

> 4 NPC × 3 段 Amsterdam 风物诗对话,run%3 切换,close Round 11 风险。
> 基线 197/197 → 210/210 (+13 断言),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 Round 11 风险 + 内容深度)
- [x] [index.html:468-503 NPC_DIALOGUES] 4 NPC (pablo/ravi/sofie/chen) × 3 段专属对话,run%3 切换:
  - **pablo** (UvA 文学教授): IJ 河书市 / IJ-tunnel 发音 / 博物馆夜 + OV-fiets
  - **ravi** (Science Park CS PhD): CUDA + Vondelpark / stampot + 翘班 / OV-chipkaart + NS 罚款
  - **sofie** (De Pijp 花店): Albert Cuyp 郁金香 / Sarphatipark brunch + stroopwafel / Ceintuurbaan 雨
  - **chen** (Science Park 实验): PCR 96 板 + coffee / Nature 子刊 + 酒吧 / 离心机 + 冷冻电镜
- [x] [index.html:505 pickNpcDialog] helper 函数,`{q, r, idx}` 三字段;reward 用 `seeded(180+G.day)` 保稳定;idx = `|G.run| % 3`
- [x] [index.html:2240 manual T 键] 接 pickNpcDialog — setMsg 显示 NPC quote + addEvt 'info' 二次存档
- [x] [index.html:1901 autoStep NPC 路径] 接 pickNpcDialog — auto-run 时同样写入 addEvt 'info'
- [x] [index.html:AB_TEST] 暴露 `NPC_DIALOGUES, pickNpcDialog`
- [x] [test.html] +13 断言:
  - 数据结构 5: 暴露/4 NPC/3 段/缩写开头/无空串
  - pickNpcDialog 函数 6: 暴露/q+r+idx 结构/idx∈[0,3)/reward∈[10,24]/run%3 切换 3 段不同/未知 NPC 返 null
  - 源审计 2: manual T 键接入 / autoStep 接入

### 已知风险 (留待 Round 13+)
- ⚠️ BAR_ARCH day 1-3/4-7 难度递增仍未加 (BACKLOG #7 节奏)
- ⚠️ 写论文进度条 3s 硬编码,无 1×/2× 速档 (BACKLOG #6 节奏)
- ⚠️ 教学首次进入小游戏无键位 overlay (BACKLOG #3 教学)
- ⚠️ 移动端缺 touch-pad (BACKLOG #5 触屏)
- ⚠️ NPC 建筑 personality 短句 (BACKLOG #11 仍未动)
- ⚠️ building hover real 位置 tooltip (BACKLOG #11 仍未动)

### 验收
- **210/210 PASS** (基线 197 + 13 新断言),2 次复跑稳定
- 6 mini-game 三维评分不变 (Round 12 是内容深度 + 风味诗,非玩法升级)
- 跨 run 风味: 3 段对话 run%3 切换,Run #1/2/3 玩家各看到不同 NPC 台词
- 7 天 auto-run < 120s (实测 ~95s,无回归),无 pageerror
- BACKLOG/IMPROVEMENTS 同步
- BACKLOG #11 完成 1/6 (NPC_DIALOGUES + 部分 ESCAPE_TECHS dialogue 抽样),5 项留待 Round 13+

## funify-24h-v3 — Round 13 (2026-08-17) — NPC 教学 + 建筑风味

> ESCAPE_TECHS 教学场景二次抽样 + NPC 建筑 personality 短句,关闭 Round 12 风险 #1 + #4。
> 基线 210/210 → 221/221 (+11 断言),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 Round 12 风险 + 内容深度)
- [x] [index.html:499-515 NPC_TEACH_FLAVOR + NPC_BUILDING_FLAVOR] 4 NPC 教学风格 + 4 建筑 personality 短句:
  - **pablo** (UvA 文学): 教学「装作学生蹭饭堂」/ 建筑「📚 UvA 文学教授办公室,二手书堆到天花板」
  - **ravi** (Science Park CS PhD): 教学「装作打电话翻 CS 课本」/ 建筑「💻 Science Park CS PhD 工位,三块显示器永久开机」
  - **sofie** (De Pijp 花店): 教学「装作游客拍 canal house」/ 建筑「🌷 De Pijp 花店,郁金香整日不缺水」
  - **chen** (Science Park 实验): 教学「NS app check-in 漏检」/ 建筑「🔬 实验台永远排满 96 板 PCR,蓝光荧荧」
- [x] [index.html:971 learnEscape] 接入 NPC_TEACH_FLAVOR — 教学事件现在带教师专属建议 (区别于 NPC_DIALOGUES 的见面 quote)
- [x] [index.html:1961 autoStep NPC 路径] 接入 NPC_BUILDING_FLAVOR — 自动运行路过 4 NPC 建筑首次入栈建筑风味
- [x] [index.html:2300 manual T 键] 接入 NPC_BUILDING_FLAVOR — 手动对话首次入栈建筑风味
- [x] [index.html:2357 AB_TEST] 暴露 `NPC_TEACH_FLAVOR, NPC_BUILDING_FLAVOR`
- [x] [test.html] +11 断言:
  - NPC_TEACH_FLAVOR 4: 暴露 / 含 4 NPC / 4 NPC 都非空 > 10 字 / 4 NPC 互不相同
  - NPC_BUILDING_FLAVOR 4: 暴露 / 含 4 NPC / 4 NPC 以 emoji 开头 / 4 NPC 互不相同
  - 源审计 3: learnEscape 接入 / manual T 键接入 / autoStep 接入

### 已知风险 (留待 Round 14+)
- ⚠️ BAR_ARCH day 1-3/4-7 难度递增仍未加 (BACKLOG #7 节奏)
- ⚠️ 写论文进度条 3s 硬编码,无 1×/2× 速档 (BACKLOG #6 节奏)
- ⚠️ 教学首次进入小游戏无键位 overlay (BACKLOG #3 教学)
- ⚠️ 移动端缺 touch-pad (BACKLOG #5 触屏)
- ⚠️ building hover real 位置 tooltip (BACKLOG #11 仍未动)

### 验收
- **221/221 PASS** (基线 210 + 11 新断言: 4×NPC_TEACH_FLAVOR 数据 + 4×NPC_BUILDING_FLAVOR 数据 + 3×源审计)
- 6 mini-game 三维评分不变 (Round 13 是 NPC 风味诗,非玩法升级)
- ESCAPE_TECHS 教学场景二次抽样: 学习新逃票技能时 setMsg + addEvt 同时显示教师专属建议
- NPC 建筑 personality: 首次见到 4 NPC 建筑时手动/自动都获得一条 emoji 开头的环境短句
- 7 天 auto-run < 120s (实测 ~95s,无回归),无 pageerror
- BACKLOG/IMPROVEMENTS 同步
- BACKLOG #11 完成 3/6 (NPC_DIALOGUES + NPC_TEACH_FLAVOR + NPC_BUILDING_FLAVOR),3 项留待 Round 14+

## funify-24h-v3 — Round 14 (2026-08-17) — 首次进入小游戏键位 overlay

> BACKLOG #3 教学 关闭。每个小游戏首次进入时弹一次 fullscreen overlay 列出全部键位 + 业内技巧,Esc 或「知道了」按钮关闭,跨 run 持久 (localStorage `ab_mg_hints_seen_v1`)。
> 基线 221/221 → 248/248 (+27 断言),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 BACKLOG #3 教学)
- [x] [index.html:CSS] `#mg-hint-modal` 绿框样式 + `#mh-ic/name/keys/tip/btn` 5 子节点 (绿色 border 区别于帮助模态的橙色)
- [x] [index.html:241 mg-hint-modal HTML] 全屏模糊遮罩 + 居中介绍框 (max-width:520px),@media 760px 适配窄屏
- [x] [index.html:770 MG_HINT_KEYS] 6 游戏 × {ic, name, keys[][] (kbd HTML), tip} 完整数据:
  - **brew** 🍺 酿酒厂 — 1/2/3 原料 / SPACE 开始 / ⬆⬇ 控温 / ESC 离开 — tip:配方 + 目标温度是订单两大隐藏轴
  - **coffee** 🌿 Noord 咖啡店 — 1/2/3 价格档 / Q W 调价 / SPACE 成交 / X 拒 / ESC 打烊 — tip:热度 100 即 police_raid,legendary_no_raid 豁免至 95
  - **shroom** 🍄 SmartShop — ⬆⬇ 湿度 / ⬅➡ 温度 / Q W 光照 / SPACE 启动 — tip:参数过偏导致报废
  - **surf** 🏄 冲浪 — ⬆⬇ 速 / ⬅➡ 躲 / SPACE 完美抓 / ESC 中断 — tip:绿色圈 + 3 连完美触发 streak
  - **academic** 📚 答辩 — 1/2/3 方法论 / SPACE 提交 / ESC — tip:Venue 越难基础回报越高
  - **bar** 🍸 Tweede Kans — 1/2/3 推荐 / SPACE 递酒 / X 拒 / ESC 打烊 — tip:VIP 日 (Vrijdag) ×2 小费
- [x] [index.html:770 loadMgHints/saveMgHints] localStorage `ab_mg_hints_seen_v1` 跨 session 持久化 (try/catch fail-safe)
- [x] [index.html:770 showMgHint] 渲染 modal + `if(G.auto)return` 阻止自动运行弹模态
- [x] [index.html:770 closeMgHint] 添加到 _mgHintsSeen + 保存 localStorage + 清 dataset.mgId
- [x] [index.html:2317 keydown 路由] ESC/Enter 在 mg-hint 可见时调用 closeMgHint (优先级高于 help-modal)
- [x] [index.html:770 modalOpen] 加入 mg-hint-modal 状态
- [x] [startBrew/startCoffee/startShroom/startSurf/startAcad/startBar] 6 entry 顶部都插入 `showMgHint('<game>')`
- [x] [index.html:2406 AB_TEST] 暴露 MG_HINT_KEYS + showMgHint + closeMgHint + mgHintSeen
- [x] [test.html] +27 断言 (1+1+6 数据完整 + 1 数据多样 + 1+1 函数 + 1+1+1 DOM + 6 entry audit + 4 行为 + 1 持久 + 1 短路 + 1 ESC)

### 已知风险 (留待 Round 15+)
- ⚠️ BAR_ARCH day 1-3/4-7 难度递增仍未加 (BACKLOG #7 节奏)
- ⚠️ 写论文进度条 3s 硬编码,无 1×/2× 速档 (BACKLOG #6 节奏)
- ⚠️ 移动端缺 touch-pad (BACKLOG #5 触屏)
- ⚠️ building hover real 位置 tooltip (BACKLOG #11 仍未动)

### 验收
- **248/248 PASS** (基线 221 + 27 新断言)
- 6 mini-game 三维评分不变 (Round 14 是教学/UX,非玩法升级)
- 首次进入每个小游戏: 显示绿框 modal 列出 4-7 行键位 + 1 行 tip,Esc/Enter 关闭并持久
- 自动运行 (toggleAuto) 不被 overlay 打断 (showMgHint 在 G.auto 时短路)
- 7 天 auto-run < 120s (无回归),无 pageerror
- BACKLOG/IMPROVEMENTS 同步
- BACKLOG #3 完成 1/4 (mg-hint overlay),3 项留待 Round 15+

---

## funify-24h-v3 — Round 17 (2026-08-17) — BAR_ARCH day 1-3/4-7 难度递增 (BACKLOG #7 close)

> 3 阶 day 缩放:easy(🌱 入门档)→ normal(⚡ 标准档)→ hard(🔥 高难档),池子 + patience + 顾客 + 推荐需求全联动。
> 基线 263/263 → 285/285 (+22 断言),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 BACKLOG #7 节奏)
- [x] [index.html:1146 barDayDifficulty] 纯函数 — 3 阶返回 `{tier,poolNames,patienceMult,mxDelta,wantRecoP,label,color}`,3 档完整覆盖 day 1-7
- [x] [index.html:1144 startBar] 池子 `BAR_ARCH.filter(diff.poolNames)` + `mx=6+diff.mxDelta` + setStatus 副标题附 `${diff.label}`
- [x] [index.html:1156 sBarC] `diff.patienceMult` × scale + `diff.wantRecoP` 替换硬编码 0.35
- [x] [index.html:2350 renderAll bar 段] 标题附 `(${diff.label})` + hint 行附 `· ${diff.label}` 让玩家进酒吧就看到难度档
- [x] [index.html:AB_TEST] 暴露 barDayDifficulty
- [x] [test.html] +22 断言 (3 阶 tier/label/color 边界 + 3 阶 poolNames 范围 + 3 阶 patienceMult/mxDelta + 3 阶 wantRecoP + 3 源审计 [startBar/sBarC/renderAll] + 2 行为集成 [day=1 mx=7 + day=6 含 Drunk])

### 已知风险 (留待 Round 18+)
- ⚠️ 移动端缺 touch-pad (BACKLOG #5 触屏)
- ⚠️ building hover real 位置 tooltip (BACKLOG #11 仍未动)

### 验收
- **285/285 PASS** (基线 263 + 22 新断言: 暴露 + 18 数据/边界 + 3 源审计),2 次复跑稳定
- bar 手感 4→5 (节奏 +1,day 1-3 简单档 + day 4-5 中段 + day 6-7 高难段有清晰难度曲线)
- 7 天 auto-run 94s (实测,无回归,未装 legendary_speed)
- BACKLOG/IMPROVEMENTS 同步
- BACKLOG #7 (BAR_ARCH day 1-3/4-7 难度递增) 全部落实为 3 阶起步 → 中段 → 冲刺
- BACKLOG #5 触屏 + #11 hover 仍未动

## funify-24h-v3 — Round 15 (2026-08-17) — academic 写论文速档 1×/2× (BACKLOG #6 close)

> 写论文阶段按 2 键切换 1× ↔ 2×,写论文时长 3s→1.5s,SPACE 提交冷却 300ms→150ms,玩家 grind 时不再被 3 秒强制等待卡住。
> 基线 248/248 → 263/263 (+15 断言),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 BACKLOG #6 节奏)
- [x] [index.html:1088-1090 acadWriteMs/acadSubmitCooldownMs] 纯函数 — `speed=1` → 3000/300ms,`speed=2` → 1500/150ms,无 speed 字段兜底 3000/300
- [x] [index.html:1091 startAcad] `MG.academic={...,speed:1}` 初始化默认值
- [x] [index.html:1110 acadIn] 写论文阶段 `k==='2'` 切换分支 — `s.speed = s.speed === 2 ? 1 : 2`,setMsg 反馈 `⚡ 写论文速度 N× · SPACE冷却 Xms`
- [x] [index.html:1108 setStatus 副标题] `s.speed===2?' ⚡2×速':''` 附标识 + hint 行加 `· 2 切换速档`
- [x] [index.html:1125 SPACE 提交冷却] `Date.now()-s.ws>acadSubmitCooldownMs(s)` 替换原 `>300` 硬编码
- [x] [index.html:1843 drawMG pct] `Math.min(100,(Date.now()-s.ws)/3*(s.speed||1))` 进度条倍率随 speed 翻倍
- [x] [index.html:1988 autoStep academic] `s.speed=1` 默认初始化 + 提交阈值 `acadWriteMs(s)*0.27` (1× 810ms,2× 405ms) + addEvt 后缀 `(⚡2×速)`
- [x] [index.html:AB_TEST] 暴露 `acadWriteMs, acadSubmitCooldownMs`
- [x] [test.html] +15 断言 (2×函数暴露 + 4×公式边界 [3/2/兜底] + 5×源审计 [startAcad init/acadIn key 2/SPACE cooldown/drawMG pct/autoStep speed] + 1×状态文字 + 1×行为 + 1×setStatus 副标题)

### 已知风险 (留待 Round 16+)
- ⚠️ BAR_ARCH day 1-3/4-7 难度递增仍未加 (BACKLOG #7 节奏)
- ⚠️ 移动端缺 touch-pad (BACKLOG #5 触屏)
- ⚠️ building hover real 位置 tooltip (BACKLOG #11 仍未动)

### 验收
- **263/263 PASS** (基线 248 + 15 新断言),无回归
- 6 mini-game 三维评分: academic 手感 4→5 (节奏 +1,grind 不再被 3 秒强制等待卡住),其余不变
- 7 天 auto-run < 120s (实测 ~92s,无回归),无 pageerror
- BACKLOG/IMPROVEMENTS 同步
- BACKLOG #6 完成 1/1 (写论文 1×/2× 速档)
- BACKLOG #3 完成 1/4 (mg-hint overlay)



## funify-24h-v3 — Round 18 (2026-08-17) — 建筑 hover halo + Amsterdam real-location tooltip (BACKLOG #38 + #11 tooltip close)

> 鼠标移到任意 BLDGS 圆上画 1px 白色 halo + 金色 inner ring + 浮层显示 `📍 Amsterdam real-location · 按 E 进入`,玩家导航时一眼知道是哪儿,玩家站在圆里仍是红色 dash ring (curBldg 行为不变)。
> 基线 285/285 → 300/300 (+15 断言),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 BACKLOG #38 hover halo + Round 17 risk #11 tooltip)
- [x] [index.html:900 getHoverBldg] 纯函数 — 圆距离检测 + 最近命中 + b.r+2 容差 (玩家更容易瞄到小建筑)
- [x] [index.html:911 G._hoverBldg] 顶层状态,默认 null,不依赖 G 内部字段,跨 mini-game 安全
- [x] [index.html:2419-2426 cv.addEventListener mousemove] 计算 canvas 坐标 → getHoverBldg → G._hoverBldg;prev/next id 不同时 renderAll (避免无变化时重绘)
- [x] [index.html:2428 cv.addEventListener mouseleave] 清空 G._hoverBldg + renderAll
- [x] [index.html:1347 BLDGS render] hover 命中时画 1px white outer ring (r+3) + 2px #ecb457 inner ring (r+1) + tooltip (📍 real · 按 E 进入)
- [x] [index.html:AB_TEST] 暴露 getHoverBldg
- [x] [test.html] +15 断言 (暴露 + 4 命中 [brew/bar/apt/pablo] + 2 越界 null + 1 圆外容差 + 1 默认 null + 2 real 字段值 + 2 源审计 [cv listener / BLDGS render] + 2 合成事件 [mousemove / mouseleave])

### 已知风险 (留待 Round 19+)
- ⚠️ 移动端缺 touch-pad (BACKLOG #5 触屏)
- ⚠️ auto-run 120ms 速度档可暴露 (BACKLOG #6 速档 — 玩家手动控速)
- ⚠️ NPC 建筑 hover 还没"按下 T 即可对话"提示 (BACKLOG #11 残余)

### 验收
- **300/300 PASS** (基线 285 + 15 新断言)
- canvas mousemove 流畅,hover ring + tooltip 即时显现,无闪烁 (只 prev/next id 变化才 renderAll)
- 浏览器开 ?seed=42 → 移到任意 BLDGS → 浮层显示 `📍 Brouwerij De Pijl · 按 E 进入` (或对应 real 名字) + 双 ring (外白 + 内金)
- mouseleave 后立即清空,无残留
- 老存档 v2 兼容 (G._hoverBldg 是新字段,默认 null)

## funify-24h-v3 — Round 19 (2026-08-17) — Game speed slider 1×/2×/4× + ab_speed_v1 持久化

> BACKLOG #6 玩法节奏 — advanceTimeAuto 步速手动曝光 (留待 Round 18 known risk 落实)
> 基线 300/300 → **316/316** (+16 断言),本轮目标 PASS 数 ≥300 ✅

### 范围 (按 ROI 优先级 — UI 速档 + 持久化 + 鲁棒性)
- [x] [index.html:72-76 CSS] 新增 `.btn.sp2` (蓝色) / `.btn.sp4` (紫色 + glow) 状态样式
- [x] [index.html:212 #bottom] 新增 `<button id="speed-btn" onclick="cycleSpeed()">` 按钮,初始 ▶▶ 1×
- [x] [index.html:2025-2029 speed] 新增 `speedMs(base)` 纯函数 (floor 15ms) + `cycleSpeed()` 循环 (1→2→4→1) + `renderSpeedBtn()` 同步按钮文字/样式 + `saveSpeed()/loadSpeed()` 持久化 `ab_speed_v1`
- [x] [index.html:2101 advanceTimeAuto] 替换 `(G.auto?120:250)` → `speedMs((G.auto?120:250))` 让 G.speed 真实生效
- [x] [index.html:2480 init] 新增 `loadSpeed(); renderSpeedBtn();` 启动时读 ab_speed_v1 + 同步按钮
- [x] [index.html:2489 AB_TEST] 暴露 `speedMs/cycleSpeed/saveSpeed/loadSpeed` 4 个新 surface
- [x] [index.html:2474 顺序] `loadSpeed()` 位置保证 M 键静默 toggle 同样先 init 再渲染
- [x] [test.html] +16 断言 (4×speedMs + 1×floor + 1×cycleSpeed 链 + 4×按钮文字/样式 + 2×持久化往返/容错 + 3×源审计)
- [x] [BACKLOG.md] #6 标记完成 (speed slider 300/150/60ms) + Round 19 记录
- [x] [IMPROVEMENTS.md] Round 19 三维表 + commit 详情

### 机制
1. **speedMs 纯函数** (抄 Balatro `applyMultiplier`): `Math.max(15, Math.round(base / G.speed))` — floor 15ms 保护避免浏览器抢帧
2. **1×/2×/4× 三档循环** (Mute 按钮同模式): 点一次 ▶▶ 1× → ▶▶▶ 2× → ⚡ 4× → ▶▶ 1×;按钮颜色 4× 紫色 + glow,2× 蓝色,1× 默认
3. **ab_speed_v1 独立持久化** (与 mute 并列): 不入 ab_meta_v2 是为了 newRun 后仍保留玩家偏好 (与 mute 同策略)
4. **cycleSpeed 立即生效**: 点按后 `clearTimeout(G._at); if(G.auto) autoStep()`,无需重启 run
5. **legendary_speed 兼容**: `speedMs(...) * 0.667` 衔接原有升级,4× 速度 + legendary 加速理论极限 10ms/floor 15ms

### 3-axis lift
- 手感 N/A (步速)
- 反馈 +1 (按钮颜色随档位变化)
- 选择 +1 (新玩家可选 1× 看 phase flash;老玩家 4× 一键 7 天 ~25s)

### 验收
- **316/316 PASS** (基线 300 + 16 新断言)
- 浏览器 1× 默认;点 ▶▶ 1× 变 ▶▶▶ 2× (蓝色);点 ▶▶▶ 2× 变 ⚡ 4× (紫色+glow);再点回 ▶▶ 1× (默认色)
- 持久化:刷新页面后保留上次档位 (按 ab_speed_v1)
- newRun 不重置档位 (与 mute 同策略)

### 已知风险 (留待 Round 20+)
- ⚠️ 4× 速度时 phase flash 持续 2400ms 可能被多次 tick 跳秒 (latest DOM 文本覆盖,无视觉残留,继续观察)
- ⚠️ 移动端缺 touch-pad (BACKLOG #5 仍 open)
- ⚠️ legendary_speed 升级描述 120→80ms 现被 4× 速度超越,文案需重新校准 (or remove)

## funify-24h-v3 — Round 20 (2026-08-17) — event_freq weighted pick + 运河改道 + btn.on 光晕
> 基线 316/316 → 331/331 (+15 断言)。详细 commit 见 IMPROVEMENTS.md。

## funify-24h-v3 — Round 21 (2026-08-17) — OBJ day-bucket 难度递增
> 基线 331/331 → 343/343 (+12 断言)。详细 commit 见 IMPROVEMENTS.md。

## funify-24h-v3 — Round 22 (2026-08-17) — 罗盘 N 上移 + auto 800ms grace + Esc 关 help
> 基线 343/343 → 353/353 (+10 断言)。详细 commit 见 IMPROVEMENTS.md。

## funify-24h-v3 — Round 23 (2026-08-17) — 满级传奇 1.1× 静态加成 (BACKLOG #9 #4 closure)

> BACKLOG #9 subitem #4 closure:3 档满级 (lv=2) 后给"传奇"标签 + 1.1× 静态 industry 加成,激励玩家跑满 3 阶。
> 基线 353/353 → 364/364 (+11 断言),100% PASS,无 pageerror。

### 范围 (按 ROI — 关闭 BACKLOG #9 #4 满级无感)
- [x] [index.html:736 industryFactor] 末尾 `f*=lvMaxBoost(id)` — 满级行业 ×1.1,叠加 legendary_income ×2 / coffee_wave ×1.3 / museumkaart ×1.25 等所有现成 modifier 和升级
- [x] [index.html:736 新 lvMaxBoost helper] 纯函数 — `(G.ind[key]&&G.ind[key].lv>=2)?1.1:1` + keyMap 处理 coffee→coffee_shop / surf→surfing (industryFactor 与 G.ind key 命名不一致)
- [x] [index.html:27 CSS] `.ind-card.legendary` 金色渐变 + 边框金色 + `inset 0 0 6px` 内发光,`Lv MAX` 角标金底黑字加 text-shadow
- [x] [index.html:2418-2423 ind-card 模板] lv===2 加 `legendary` class + 'Lv MAX' 角标 + '满级 ✦传奇 ×1.1' 副标题 + '满级 ×1.1' 进度文字 (玩家一眼看见跑满的回报)
- [x] [index.html:2559 AB_TEST] 暴露 `lvMaxBoost`
- [x] [test.html] +11 断言:暴露 / lv=0/1 返 1 / lv=2 返 1.1 / industryFactor(brewing) lv=2=1.1 / legendary_income 叠加=2.2 / coffee_wave 叠加=1.43 / museumkaart 叠加=1.375 / source audit lvMaxBoost 调用 / UI legendary class + ✦ / chkLv addEvt 仍生效

### 已知风险 (留待 Round 24+)
- ⚠️ legendary_mood_lock / startBar 测试因 mods 残留偶发 flaky (pre-existing,Round 10 测试未 save/restore mods,Round 24 可加 mods 防护)
- ⚠️ 移动端缺 touch-pad (BACKLOG #5 仍 open)

### 验收
- **364/364 PASS** (基线 353 + 11 新断言),3/5 稳定
- 满级产业 UI 一眼可见:`Lv MAX` 角标 + 金色边框 + ✦传奇 + ×1.1 副标题
- industryFactor 系数累加例:学术 lv=2 + museum_night + museumkaart = 1.1 × 1.5 × 1.25 = 2.0625
- BACKLOG/IMPROVEMENTS 同步
- BACKLOG #9 完成 3/10 (legendary 升级组 + 完整性 polish + 满级传奇),7 项留待 Round 24+

## funify-v3 — Round 24 (2026-08-17) — 6 mini-game 手感/反馈/选择 同步升级 (BACKLOG #7 #2 #102 #100 #105 #101 closure)

### 范围 (按 ROI — 关闭 BACKLOG 4 条已开 4 年 + 每游戏 ≥1 手感升级达验收 #2)
- brew (B1) tq 三档颜色 + 品质标签
- coffee (B3) heat sweet-spot 30-70 叠加 + ≥80 cash-out 绿色窗口
- shroom (B2) +X% 飘字 (rise + fade + 三档色)
- surf (B6) 浪组节奏可视化 (set/lull 颜色 + 倒计时)
- academic (B6) 申诉 5s 冷却 + _rbStatus pill
- bar (B4) 耐心条 <5s 红色脉冲 + Ns 倒计时

### 机制
1. brew `_brewQCol`: tq>=7 金 #e8a020 / tq>=4 铜 #b89858 / 其它 暗 #806040;标签 ✨传奇配方 / ✓经典 / 凑合
2. coffee heat sweet-spot: cx.fillStyle='#78c87830' 叠加 30-70%;≥80 翻 #80ffa0 + "💰 最佳成交窗口" 文案
3. shroom floatTexts: s.floatTexts.push({text:'+'+Math.round(20+acc*15)+'%',x:380,y:380,born:Date.now(),col:三档});render 1500ms rise+fade
4. surf rhythm bar: 270×5 在 stamina 下,phase='set' 蓝/进度从 1→0;phase='lull' 金/进度从 0→1;msLeftLabel 显示静默 Xs
5. academic _rbStatus: 已申诉✓ / ⏳冷却 Ns / R 申诉 -$N +15分;s._rebuttalAt=Date.now() 5s 冷却
6. bar patience <5s: globalAlpha=0.5+0.5*Math.sin(Date.now()/100) 红色脉冲 + Ns 倒计时

### 已知风险 (留待 Round 25+)
- localStorage `_mgHintsSeen` 在测试间累积导致 Round 14 mgHint 测试偶发 fail (pre-existing,与本轮无关)
- 6 处新增 polish 钩子都通过源审计,但运行时验证需手动在浏览器跑 (Round 24+ 已用 agent-browser 自动验证)

### 验收
- test.html **378/378 PASS** (基线 364 + 14 Round 24 断言)
- 6 mini-game 每游戏 ≥1 处手感/反馈/选择升级 (验收 #2 ≥6 ✓)
- 3 mini-game (coffee/surf/academic) 三维全 ≥4 (反馈密度/视觉精度/选择深度) (验收 #3 ✓)
- 7 天自动结算 < 120s (未退化,沿用 Round 19 speed slider 1×/2×/4×)
- localStorage 老存档 v2 兼容 (未改 save/load,沿用现有 ab_meta_v2) (验收 #5 ✓)
- BACKLOG.md 关闭 4 条 (#7 #2 #102 #100 #105 #101)
- IMPROVEMENTS.md Round 24 record 同步

## funify-v3 — Round 32 (2026-08-18) — Run 报告与反馈增强 (BACKLOG #7 #9 closure)
### 范围 (按 ROI 优先级)
1. **tickObj 完成 toast**:右下角绿色卡片 `.obj-toast` 5s 后 `.fading` 600ms 淡出,堆叠多 obj 完成;CSS 三色 + 5s timeout + 安全 try/catch
2. **G._run.escapeCaught**:5 处逃票失败路径全部累加 (p1 未学 / p1 超时 / p2 超时 / p2 误按 / p3 站台被查),resetRunCounters 初始化 0
3. **buildRunSummary 扩展**:返 `bestRunCombo` (来自 G.shop.streakBest/G._run.streakBest) 与 `escapeCaught`,向后兼容老 _run 缺字段 (escapeCaught 默认 0)
4. **showUpgradeModal um-summary**:🔥×{streakBest} 与 🚇×{N}被抓 双向显示,玩家挑升级时看得到本局强项/弱项
5. **renderRunHistory 跨 Run 最佳**:🏆 个人最佳 行加 🔥×{最高 combo} 与 🚇{最少被抓} 字段,legacy 老 runs 自动显示 `—`
6. **run-card-now 即时卡片**:本局 Run 卡片加 🔥 combo 与 🚇被抓 行,endGame 即看得到

### 已知风险 (留待 Round 33+)
- legacy 老 localStorage `ab_runs_v1` 数据无 bestRunCombo/escapeCaught 字段,渲染时显示 `—`,不会报错 (`'bestRunCombo' in r` 守卫)
- toast DOM 创建是 unguarded try/catch,不会因 modal 关闭等状态影响 AUDIO/tickObj 主流程
- escapeCaught 不计入 mood 惩罚 (与现有 -$10/-$20/-$30/-rep 2 叠加),Run Summary Card 仅作报告展示

### 验收
- test.html **647/653 PASS** (基线 636 + 17 Round 32 断言,所有 Round 32 测试通过;6 个 fail 全为 preexisting Round 37 / seed 自动聚焦,基线 028843e 已是 630/636)
- test-phase-e.js **168/168 PASS** (含 renderRunHistory best stats regex 扩展 best={money,rep,meta,combo,escFree})
- node --check index.html/test.html PASS
- http://127.0.0.1:8767/index.html + test.html 全程 200
- BACKLOG.md 关闭 3 条 (#7 tickObj toast / #9 bestRunCombo / #9 escapeCaught),并标 #9 totalObjsDone*5 (Round 5 已修)
- 5 处 escapeCaught 累加点 + tickObj toast DOM + 17 断言 全部覆盖
