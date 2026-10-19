# D27 六小时窗口最终报告

固定执行窗口 UTC 2026-10-19 16:52:30—22:52:30（北京时间10月20日00:52:30—06:52:30）已到期。完整 demo 目标未完成。到期只做已有结果核对与交接，新增 Plan 调用0、游戏修改0；本报告不延长执行许可。

## 实际产出

本窗口实际 Coding Plan 调用6次，三波各两路独立 CC，均使用 Seed Evolving、thinking enabled/high。新增采用组件2，累计采用组件4；另有 City 合格候选1，游戏新地图采用0。

| 工作项 | 执行与父验 | 最终去向 |
| --- | --- | --- |
| NAV 原逻辑额外R3 | CLI0；43测试、独立GEOS3000、60变换/7类、全量源72路线段通过 | 已采用5f3d594；额外1/1已用尽 |
| PACK 原逻辑额外R3 | 原CLI1/轮次上限及blocked回执保留；磁盘完整合法报告追回，61Python+23Node及145703对象/843220邻接复核通过 | 12文件逐字节采用1e0ede0；标准partial/call_exception与产物采用分账；额外1/1已用尽 |
| MEMORY 业务及唯一R2 | 业务3000秒超时；R2于19:05:33Z接口Request timed out，1043.485秒/40轮，未到worker上限。父验13命令9绿4红，实际HTTP加载失败、3路线反例及交付缺失 | 未采用；业务1+修正1/1耗尽，原unknown回执保留 |
| CITY 业务及唯一R2 | 业务超时；R2正常CLI0。34City+7Flower+16独立案例、6命令通过；完整源24检查/2088移动帧、F3与旧档迁移通过 | 五文件合格候选保存；依赖runtime/BOOT原子接入，尚未采用；修正1/1已用尽 |

窗口结束核对所有64份Amsterdam状态均done，仅表示没有在途，不表示全部验收通过。六次调用的已知worker/launcher PID均不存在；没有创建或提交MEMORY-R3。不可变父验及原失败历史均保留，详见[NAV](NAV01/r3-review/parent-review.md)、[PACK](PACK01/r3-review/parent-review.md)、[MEMORY](MEMORY01/r2-review/parent-review.md)、[CITY](CITY01/r2-review/parent-review.md)与[收口实测](final-evidence.json)。

## 试玩与当前代码

游戏分支codex/real-map-20261017本地及远端均为1e0ede0f528b764e5c679101889392e92d2d55b9，采用的是tools/geo/bgt、renderer、navigation、packing组件。tools/prototype相对旧dad6b38无差异；City/FlowerNetwork/scene/UI/index未接新图。

[原试玩链接](http://127.0.0.1:18860/tools/prototype/index.html?seed=42001&commit=dad6b38)在本次收口实测返回404。原18860/PID91799仍指向/tmp/amsterdam-play-dad6b38，但该目录下tools/prototype/index.html已不存在；文件缺失原因未知。旧代码仍保存在Git，不能称该链接当前可玩。按保留原服务的边界，收口没有停止服务、重建文件或换图。未重跑GUI、旧418测试/17资源或拍摄新截图；这些旧证据不证明新版地图可玩。原独立18865与父级浏览器已关闭。

## 未完成与实际限制

加载R2的异步hash调用尚未接完，signed-zero及多块实际HTTP都失败；反向缓存、任意近点连接和预先取消三项路线回归仍未通过。没有合格的全量加载/内存/取消重试运行时，不能采用诊断用错误hashmanifest或concurrency1的约610MB采样结果。

City独立验收使用完整源、合格NAV及明确标记的父级存储路线适配器，未使用失败加载器。Node step max17.134ms不是浏览器时长，F3岸边案例不证明pub到渡轮岸可达。原9组路线诊断得到7walk+2bike，132段独立GEOS均通过；pub→ferrySouth、coffee→lab达到250000节点查询上限，既不能称全地图通路，也不能称已证明不通。

PACK候选仍为431675816B JSON/110683722B gzip，几何通过没有解决浏览器成本。MEMORY使用完整未简化GEO源；来源范围仅585页、四集合、145703地物、22977546顶点，快照2026-10-16T00Z、bbox[4.865,52.345,4.970,52.405]。不称全城或建筑立面1:1，2693原无效对象不擅改、697桥面不等于2350桥；人物场所虚构，水域不能当道路。

BOOT未派。仍需合格加载后原子接入City及scene/UI/index，按[接口与接入边界](boot-integration-notes.md)保留10锚点、半径0.4、速度48/96/32、玩家/车独立迁移、经济访问、F3安全岸取消/刷新、CSS内容框/DPR及共享Canvas。新地图自然首杯→夜探实际带货出门→返店→日2、390键盘、暂停刷新及新提交实际资源字节仍须验收。

## 授权与后续

约19:15Z已只问一次[同一MEMORY逻辑额外1800秒/50轮恢复](MEMORY01/transport-recovery-proposal.md)，截至收口没有真人答复，未获批准、未创建handoff或输入、未派发。沉默不计批准，窗口到期不重置任何次数。此问题的后续答复也不会延长已结束窗口；恢复实际开发须新的明确执行窗口及具体范围，并明确解决MEMORY额外机会。

同一amsterdam及原thread恢复每日北京时间22点新审批检查；无新审批、真实交付/失败或必要决定时静默，最终汇总只通知一次。完整目标保持未完成，未获demo认可不迁移正式引擎、Steam发布、收费或签约。本轮无新增方法，沿用已有入口/闭环与无损加载验收方法。
