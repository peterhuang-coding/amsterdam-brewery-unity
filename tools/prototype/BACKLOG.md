# Polish Backlog — Web Demo v2（funify-24h-v2）

> 每轮 1 改动 1 commit。Claude 每轮从 goal.md 读范围，从本文件读待办。
> 条目格式：`- [ ] <一句话改动>  [文件:函数/位置]`

---

## 0. ⚠️ BUG / 未完成承诺（先修）
- �️ [README.md:60-62] "19/19 PASS" 与实际 58/58 不符；README 未同步
- ⚠️ [index.html:128 #t-explore] "perfect +50?" 问号是草稿残留；finSurf 已实现 `s.perfect*50`，应改为 `· 完美抓 +50★`
- ⚠️ [index.html:1289 罗盘 N/W 标签错位] `cx.textAlign='center'` 时 W 应在 x=18 但写成 (28,30)，与箭头重叠
- ⚠️ [index.html:2111 autoStep academic 硬编码 `ok=s.sc>60`] venue 多样化后 auto 仍走旧阈值；与手动 commitAcad 不一致
- ⚠️ [index.html:2277 Escape 关闭 help-modal] 注释说"Esc 退出"但只有 closeHelp 一条路径
- ⚠️ [index.html:484 IND_DEF 5 项但 README/IMPROVEMENTS.md 说 6 个游戏] bar 不在 IND_DEF，玩家误以为 6 产业都能升级
- ⚠️ [index.html:1563 菜单价格 € 符号] 但 G.money 显示 `$`，单位不统一
- ⚠️ [index.html:2155 triggerDream 在 day 1 Dawn] 但 setStatus 之后调用，梦境消息被覆盖
- ⚠️ [index.html:2152 `if(G.day>7){endGame}` 在 `G.ti++` 之前] ti 推到 6 后 day 才推到 8，多走一个空时段
- ⚠️ [index.html:2289 T 键对话只在 inside] README 没明确说 T 是 NPC 键；玩家只能靠摸索
- ⚠️ [index.html:2279 auto 进 mini-game 后任意键立刻取消 auto] 无 grace period，误触即停
- ⚠️ [index.html:633 EV_KIND 表与 EV_POOL 不同步] 新加 event 必须同时改 EV_KIND；应改 `EV_POOL.forEach(e=>EV_KIND[e.id]=e.kind||'neutral')` 自描述

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
- [ ] [index.html:1153 建筑标签 hover 无反馈] hover halo（外面 1px 白色 ring）
- [ ] [index.html:1319 目标 ring 静态虚线] 改 `Date.now()/200 % 4` dash 偏移动起来
- [ ] [index.html:1312 走路秒数提示] 每 200ms 重算 + `cx.globalAlpha=0.5+Math.sin(t/300)*0.5` 呼吸
- [ ] [index.html:684 nnBridge 改道无提示] `G._wp` 被设置时 `setMsg('🚶 运河挡路 → 改道 Magere Brug')`
- [ ] [index.html:2099 toggleAuto 按钮] 加 `.btn.on{box-shadow:0 0 12px var(--green)}` 激活光晕
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
- [ ] [index.html 全局 body + canvas] 加 `<canvas aria-label="Amsterdam 地图..." role="img">`
- [ ] [index.html:166 #msg span] 加 `aria-live="polite"` 让 setMsg 被播报
- [ ] [index.html:122 .tb] 改 `<div class="tb" role="status" aria-label="金钱 当前 250">`
- [ ] [index.html:191 Start 按钮] 加 `aria-label="开始本局游戏"`
- [ ] [index.html 全局 缺 focus 样式] 给 .ind-card、.upg-card、.obj-row 都加 `:focus-visible{outline:2px solid var(--gold);outline-offset:2px}`
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
- [ ] [index.html:633 wantPositive 30% 无生效提示] event_freq 触发时 addEvt `🎲 event_freq 已生效（30%偏正向）`
- [ ] [index.html:2151 advanceTimeAuto 120ms 太快] 暴露 speed slider（300/150/60ms 三档）
- [ ] [index.html:633 EV_KIND 与 EV_POOL 同步] 改 `EV_POOL.forEach(e=>EV_KIND[e.id]=e.kind||'neutral')`
- [ ] [index.html:484 IND_DEF inc:[12,18,26] 过小] 提升 inc 数组到 [25,40,55]
- [ ] [index.html:510-524 OBJ_CATS 无难度递增] day 1-3 走 n:30 轻松档，day 4-7 强制 n:100/服务 6/酿酒 3
- [ ] [index.html:633 wantPositive hard filter 缩池] 改 weighted pick 而非 hard filter
- [ ] [index.html:2210 endGame won objs.every 太严] 改 ≥2 即 won，bronze/silver/gold 3 档
- [ ] [index.html:2155 extra_event 排除相同即可] 加"同一天最多 1 个负面"约束 day 1-3 全 good
- [ ] [index.html:484 IND_DEF lvs 3 档满级后无感] 满级给"传奇"标签 + 1.1× 静态加成
- [ ] [index.html:2099 toggleAuto 无加速] 加 `▶▶ 2×/▶▶▶ 4×` toggle

## 7. 反馈感（成功/失败/进度可见性、得分动效、数值跳变）
- [ ] [index.html:2220 G.money 颜色 3 档瞬时跳变] 加 `transition:color .4s` 平滑过渡
- [ ] [index.html:2300 cv click 移动无反馈] update 检测到达时 `cx.fillStyle='#ecb457'; cx.arc(p.x,p.y,12)` 画到达脉冲圈
- [ ] [index.html:2262 cov-title 完成无粒子] commitAcad/finBrew/finSurf 等成功分支加 5-10 个 ctx.arc 黄色圆点 confetti
- [ ] [index.html:2211 setMsg "目标达成"] tickObj 完成分支加 5 秒 toast `#toast{position:fixed;top:80px;right:20px}`
- [ ] [index.html:1857 greenState 只有文字] 改 `pos>0.6?'✨ 完美区!':pos>0.3?'⚪ 白区':'❌ 错过!'`
- [ ] [index.html:1534 温度条单调红] ≥目标后 `cx.fillStyle='#78c878'` 绿色
- [ ] [index.html:1635 咖啡耐心条 <5s 闪烁] `Math.sin(Date.now()/100)*0.4+0.6` 紧迫闪烁
- [ ] [index.html:1449 配方品质 tq 离散跳变] 加三档颜色过渡 `tq==9?'#e8a020':tq>=6?'#b89858':'#806040'`
- [ ] [index.html:2232 ri "剩余天数 Math.max(0,7-G.day+1)"] 改 `Math.max(0, 8-G.day)`（7 是最后一天）
- [ ] [index.html:2087 update 无移动尾迹] G.auto 时保存最近 5 帧坐标 alpha 渐变绘制 trail
- [ ] [index.html:1701 蘑菇生长每次 +20% 飘字] 在 s.gr 增加时画短暂 +20% 飘字

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
- [ ] [index.html:740 G.brewNotes 与 G.strainNotes 跨 run 但无展示] 加 `📒 知识本`按钮列出已掌握
- [ ] [index.html:601 G escapeLevel:0 无信任] 加 `G.teacherRep:{}` 3 次同导师对话升级 escape success 10%
- [ ] [index.html:1019 finBar combo 局内重置] 加 `bestRunCombo` 在 upgrade 模态展示
- [ ] [index.html:2207 endGame legacy 太简单] 加 `totalObjsDone*5` 鼓励完成目标
- [ ] [index.html:626-639 rollDayModifier 跨 run 无回避] 加 `G.modHistory` 数组最近 5 天事件优先选不在历史中
- [ ] [index.html:601 G initial 没 inventory 历史] 加 "🗃️ 收藏" 模态展示累计
- [ ] [index.html:832 tryEscape 只看 escapeLevel] 加 `G.escapeCaught:0` 跑局报告

## 10. 持久化/重玩性（存档槽位、跨设备、Seed 分享、replay）
- [ ] [index.html:586 saveMeta 单 key] 加 `ab_meta_v2_${slot}` slot 1-3 + UI 切换
- [ ] [index.html:586 saveMeta 无 export/import] 加 #export-btn 触发 JSON 下载 + #import-btn 上传
- [ ] [index.html:2300 cv.click 无 replay] 加 `G.actionLog.push({t,x,y,k})` 数组 P 键回放
- [ ] [index.html:2316 setMsg seed 显示但不复制] 加 `📋 copy URL` 按钮便于分享
- [ ] [index.html:563 seedAbbrev 简单 2 字母] 附 tooltip 解释算法
- [ ] [index.html:329-548 EV_POOL 18 / WAVE_POINTS 7 重复] 加 `runHash = G.run % 18` 让每个 run 事件池不同
- [ ] [index.html:2305 newRunInner 起手固定 5 seed] 从玩家历史 seed 随机抽
- [ ] [index.html:586 saveMeta 无删除] 加 `⚙️ 设置` 模态含 `🗑️ 清空 localStorage`
- [ ] [index.html:2024 G 初始 seed:42 硬编码] 保持 OK 但写明 fallback 用途
- [ ] [index.html:2305 newRunInner 不清 G.barRegulars/strainNotes/brewNotes] 加"reset 按钮"独立清这三个数组

## 11. 事件与城市叙事（modifiers 真实感、NPC 性格、对话深度）
- [ ] [index.html:528-548 EV_POOL 18 描述简短] 加 `lore: "因运河船闸故障..."` Amsterdam 真发生感
- [ ] [index.html:2289 NPC 对话无文本] 加 `NPC_DIALOGUES[npc][run%3]` 三段式对话
- [ ] [index.html:500 ESCAPE_TECHS 4 老师固定] 每个 NPC 老师 3 段专属 dialogue 随机抽取
- [ ] [index.html:2173 DREAM_POOL 8 段梦] 加 `lvl: G.day` 让 day 7 梦境描绘 7 天总结
- [ ] [index.html:2261 cov-title 切 phase 无旁白] 加 phase-changed flash overlay 3 秒闪"Day 3 · Morning · IJ 河面晨雾"
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
