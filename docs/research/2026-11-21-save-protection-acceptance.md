# 存档保护与 Lotte/库存链路验收（2026-11-21）

分支：`codex/real-map-20261017`
代码提交：`6d8567d`、`e98d805`、`a6e0072`
Worktree：`/Volumes/SanDisk2TB/amsterdam-brewery-unity/.claude/worktrees/art-pass-20261013`

本记录只覆盖本轮实际做过的技术验收。Notion AB 清单公开链接要求登录，未能读取；本记录不声称逐条核对了 AB-12～19，也不把历史浏览器通关当作本轮验收。

## 自动化

```sh
node --test tools/prototype/test-*.js tools/prototype/test-*.cjs
```

结果：**599 项通过，0 失败，0 取消，0 跳过**。

聚焦新增用例分别通过：

- `node --test tools/prototype/test-save-guard.js`：10/10
- `node --test tools/prototype/test-save-protection-ui.js`：5/5
- `node --test tools/prototype/test-obligations-ui.js`：1/1

## 真实浏览器

环境：本机 Chromium（chrome-devtools MCP），局域 HTTP `127.0.0.1:18767`，种子 42；除特别注明外，界面操作均为真实点击/键盘。移动端检查使用 390×844、DPR 2、`mobile,touch` 模拟，不是实体手机。

| 检查 | 实际操作 | 结果 |
|---|---|---|
| 正常存档与主菜单 | 打开 `☰`，手动保存，继续游戏 | 主档为格式 2，备份键生成，状态栏显示保存时间 |
| 保存并回主菜单 | `P` 暂停，点击“保存并回到主菜单” | 回到主菜单，现金/天数/报告保留 |
| 坏档恢复 | 在同源静态页把主档截断，保留有效备份，刷新游戏 | 启动显示“上次的存档没能通过校验”；原文进入 `..._recovery`；自动保存暂停；点击“恢复上一份备份”后回到第 1 天白天准备，主档写回格式 2 |
| 较新版本 | 写入 `format:3` 主档后刷新 | 启动显示“这个存档来自较新的版本”；原文复制到 `..._future`；选择“暂不处理”并游玩 6 秒，主档原文未变；主菜单显式“保留原存档，开始新一局”后才写格式 2 |
| 写入失败 | 页内让 `Storage.prototype.setItem` 对主键抛 `QuotaExceededError` | 状态栏“保存失败 · 进度未写入”，主档未变；恢复写入后重试成功 |
| 390px 菜单 | 主菜单打开状态测量 | 视口 `scrollWidth=390`、无横向溢出；4 个按钮 302×43px；Tab 在弹窗内移动，Esc 关闭 |
| 库存/约定对账 | 实际走到 Lotte 桥边并点击承诺 | 显示“今晚的酒去了哪里 / Lotte 留酒 1 杯 / 现有黑啤 2 杯 / 散客还剩 1 杯”；酿酒后面板更新为 8 杯 |
| 跨日 Lotte | 第 1 天实际酿酒、开门、免费应对房东、125 秒选中 Lotte 倒酒收杯 | `promiseKept=true`、`music=false`，反应“她记得那杯黑啤。明晚她带乐队来。”；次日 `music=true`，晨报与“Lotte 的花与酒”显示第 2 晚乐队；刷新后第 2 天/2 次准备/1 报告/€24 不变 |
| 三晚结局 | 第 2、3 天真实“开门→提前打烊→结算→下一天” | 到达失败结局（3 份报告、€0、满意 1）；结局页无“第 4 晚/第四晚演出”承诺；刷新后结局与报告数不变 |

截图：

- [390px 主菜单](images/2026-11-21-save-protection/menu-390.png)：按钮可读、焦点环可见、无横向溢出。
- [坏档恢复菜单](images/2026-11-21-save-protection/corrupt-recovery-500.png)：截图时 Chromium 窗口最小宽度为 500px；显示损坏原因、原档已保留、可恢复备份与暂不处理。
- [390px 库存/约定对账](images/2026-11-21-save-protection/obligations-390.png)：面板宽 324px，文字完整，无横向溢出。

## 边界

- 本次浏览器只走到失败结局；未在本局完成获胜结局，也未在同一局浏览器验证“赠花+留酒+次晚音乐”的花束部分。该组合由真实模块 UI 测试覆盖。
- 第 2、3 晚为提前打烊，不能据此评价后两晚的客人节奏、租金压力或趣味。
- 未做真人试玩、实体手机、公网性能、真实磁盘配额耗尽、隐私模式或跨设备同步。
- 启动仍自动续档；未做拦截式启动主菜单。
- 坏档/较新版本的恢复副本只存在同一浏览器 localStorage，未提供导出文件。

## 复现入口

```sh
cd /Volumes/SanDisk2TB/amsterdam-brewery-unity/.claude/worktrees/art-pass-20261013
python3 -m http.server 18767 --bind 127.0.0.1 -d tools/prototype
```

打开 `http://127.0.0.1:18767/index.html?seed=42`。页眉 `☰` 为主菜单，`P` 为暂停。
