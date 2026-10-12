# ART01 / D20：网页 demo 整体美术升级

用户新授权按既有商业目标提升网页demo美术，Coding Plan执行、主代理审阅，用户稍后试玩。当前游戏d89421ef86dda52044c38fab63f71a3f979138ca；仍先验证demo，用户认可后再评估正式引擎。UPG01旧失败保留，本包只做其目标下的明确视觉增量，不自动实现概念稿全部剧情。

## 设计方向
“白天运河明信片，夜晚潮湿霓虹后台”。为2.5D城市冒险服务：场景为主视觉，操作清晰，黑色幽默来自现有文案和小店生活，不加入营销页、收费提示或开发术语。
共同色系：深运河 #153D47、夜色 #112632、暖灯 #F2C078、砖红 #B66B52、苔绿 #7D9674、浅纸 #E8E7D8。角色/拾取物亮度高于环境，危险不能只靠红绿。原生字体不联网：展示 Georgia/宋体；正文系统无衬线；数值monospace。它是游戏，不是SaaS卡片仪表盘。

## 并行边界
SCENE只改reopening-scene.js和backstage-scene.js：酒馆空间层次/材质/光影；白天城市屋顶、立面、运河、桥、码头、绿化；夜探暖冷光、湿地细节、道具轮廓、人物和出口辨识。用原创Canvas绘制，保留所有真实碰撞/交互坐标、相机映射和状态分支；无伪造交互、无覆盖线索标签、无新增网络/图片/库。升级要明显，不能只改几个色值。材质细节用有界确定循环；保持已有reduced motion，不新增无障碍闪烁。
UI只改index.html及reopening.css、backstage.css、journey.css：整洁的酒馆招牌/画框与章节层级，资源像店内账台读数，动作像清晰的值班板，统一常用字号/按钮/选中/禁用/键盘焦点。保持所有现有ID、data-action/data-verb、JS加载及其顺序、所有操作、可见信息、真实反馈和存档；不得加按钮/删入口/更改功能或JS。宽屏场景占主位，手机390px无横向溢出，重要按钮至少44px高、常用中文内容至少13px。禁止用display:none隐藏必要信息来通过响应式。可以重整重复CSS，但别追加一大串互相打架的覆盖。

## 验收
父级在组合候选上跑原347测试/所有语法，独立浏览器检查开局酒馆、白天地图/进店、入夜自动/手动入口、暂停恢复、夜间交互；390px检查资源/选项/键盘可达性。视觉验收比较原版：可清楚说出三处实质改进；不宣称商业或趣味已验证。

## 工具与报告
只Read/Edit/Write指定文件；Bash只执行交接包精确命令，不附加ls/cat/grep/git/install/network。不要读取自身CLI日志。父级预跑依赖已给齐。请用Edit/Write工具写源码与handoff-result.json，不用Bash写文件。
完整报告示例（字段值必须真实）：
{"status":"completed","summary":"实际完成内容","changed_files":["tools/prototype/reopening.css"],"tests":[{"command":"python3 validate_ui.py","exit_code":0,"summary":"实际结果"}],"blockers":[],"memory_delta":[],"next_steps":["Parent browser visual review"]}
status只能completed或blocked，不能complete。changed_files只写实际改动的产品文件，不列报告自己。不保证完成时如实blocked；失败即停，无自动重试/模型切换。
