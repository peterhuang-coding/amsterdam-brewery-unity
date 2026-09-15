# Night Exploration 2 Implementation Plan

> 使用 subagent-driven-development 执行独立界面任务，并用 requesting-code-review 进行规格和质量审查；主执行者实现规则、自动探索与存档集成。用户已批准本切片，连续执行到可验收。

**Goal:** 在现有夜探地图实现三种夜间局势、有限空瓶引诱、可拖动路障桶，并支持自动选择与安全恢复。

**Architecture:** Backstage 继续持有唯一世界状态和碰撞；自动策略调用其 command/step。Canvas 与 HUD 读取同一 streetInfo 和 street 数据。新探险版本为 2；旧局迁移成 legacy，不插入新障碍。

**Tech Stack:** 原生 JavaScript、Canvas、Node 行为检查、Playwright 浏览器。

## Task 1：规则与行为回归

Files: backstage-core.js、reopening-core.js；新增 test-night-streets.js。

- [ ] 写 Node 回归并确认新增行为失败：
  `const a=B.create(42,1),b=B.create(42,2); assert.notEqual(a.street.situation,b.street.situation)`。
  调用 `B.command(run,'lure',{x:...,y:...})` 验证瓶数减少/敌人朝声源移动；抓桶移动再松开，验证世界坐标和机器碰撞。
- [ ] 实现规格中的 street 对象与 `B.streetInfo(run)`；scenario 用 Seed 与日数轮换，三个固定局势配置只影响新增障碍和演员位置。
- [ ] 在真实移动碰撞中加入路障桶；拖动时先确认桶可移动，否则保留原位置；瓶投掷沿线截断，调查行为有期限。
- [ ] version=1 迁移时保留旧几何与全部旧字段；reopening restore 接回迁移后的 run。新版本验证数量/ID/坐标/模式，不能只验证模板存在。
- [ ] `node --test tools/prototype/test-night-streets.js tools/prototype/test-backstage.js tools/prototype/test-daynight.js`。

## Task 2：Canvas 与操作界面

Files: backstage-ui.js、backstage-scene.js、backstage.css（需要时 index.html/reopening-ui.js 的文案）。

- [ ] 由界面子任务读取 streetInfo 绘制同源的路障、可拖桶、声源、调查状态。
- [ ] N 投瓶、R 拖桶/放下及触屏按钮；HUD 展示三瓶消耗、冷却、拖桶状态和当前局势。暂停或正在自动执行时不绕过既有控制规则。
- [ ] 开局/夜探说明与帮助同步；旧存档 legacy 文案解释本趟保持旧街况。
- [ ] 原有相机瞄准测试、键盘事件传播检查与语法检查通过。

## Task 3：自动探索

Files: backstage-auto.js；test-night-streets.js。

- [ ] 加入 take-lure / take-barrel 选择和必要的有限导航阶段，调用真实命令。
- [ ] 摆桶过程中确实走到桶旁、抓取、移动、释放，再绕行拿箱；目标不可达回到可恢复选择，不能假成功。
- [ ] 补三局势的自动抵达、暂停、刷新往返和声音/拖桶阶段恢复用例。B.solid 变化后清理/重算路径。
- [ ] 跑全部现有原型检查，修复受影响的行为后再扩大。

## Task 4：交付验证

- [ ] 规格审查通过后进行代码质量审查，修正已确认问题。
- [ ] Playwright 实际开始/打烊/夜探，分别选择引诱与摆桶，检查刷新恢复和窄屏；核对运行时资源确为新版。
- [ ] 更新原型 README，给变更资源加一致版本参数，commit/push 玩法分支。
- [ ] 工作台只同步批准记录、规格链接和结果；Notion R01 置待验收，其余任务保持原审批状态。
- [ ] Hub 写回实际验证与唯一下一步；不宣称完成工具成长和完整人物链。
