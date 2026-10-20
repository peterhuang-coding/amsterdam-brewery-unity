# D28 三小时窗口最终报告：新地图 demo 未完成

固定执行窗口为 UTC2026-10-20T02:08:39Z—05:08:39Z（北京时间10:08:39—13:08:39），已到期，未延长。收尾于05:14Z心跳触发，只核对已有结果，没有新派发或游戏修改。两项真人答复已兑现为本窗口与MEMORY唯一额外恢复；不是待答，也不能再次使用。

## 实际交付与采用

| 项目 | 窗口结束结果 |
| --- | --- |
| 本窗口实际 Coding Plan | 1次，Seed Evolving thinking enabled/high，单路 |
| 本窗口新增采用 | 0 |
| 累计已采用组件 | 4：GEO转换、独立RENDER、NAV、PACK |
| CITY01-R2 | 独立合格候选1，五文件保存，尚未接入游戏 |
| 游戏新地图与完整主循环 | 0，未完成；BOOT未派 |
| 在途 | 无；65份Amsterdam status均done只表示终态，不是全部通过 |

游戏分支 `codex/real-map-20261017` 本地/远端均为 `1e0ede0f528b764e5c679101889392e92d2d55b9`，工作区干净。改动仍限于tools组件；`tools/prototype`相对旧`dad6b38`无差异，City/FlowerNetwork/scene/UI/index未接新图。收口核对见 [final-observation.json](final-observation.json)。

## MEMORY唯一额外恢复

固定任务 `amsterdam-d27-compact-runtime-r3-20261020`、logical `f02-compact-runtime-d27`。02:12:28.549504Z启动，02:24:33.323947Z结束，724.792秒，CLI1/error_max_turns，合同50轮、provider reported51轮；触及轮次上限，非1800秒超时。原state done/receipt blocked保持；标准partial/call_exception，完整运行时父验拒收、采用0。worker61627/launcher61616及父级服务63240已退出，本轮只读复核未发现这些PID。

父验原始证据：[不可变parent-review](../2026-10-20-six-hour-map/MEMORY01/r3-review/parent-review.md)，SHA256 `de0b4c1dd1f4543f3414481ef8a4fe3331e164cd0b147bfebb1187a53a175935`，已推送父验提交 `d538571449af4d0d648839919cd1466ceccbe853`。以下为本窗口此前独立验收结果，收口未重跑这些测试或拍摄新截图。

- 13条父级命令有效12绿、1条因缺test-runtime.cjs失败。10Python、43NAV、43renderer及原6路线回归等通过；demo、README、合法报告也缺失。最初HTTP监听EPERM属于父级环境，授权loopback后相同两命令通过。
- 完整145703地物、22977546坐标对、属性/顺序/IEEE754及2个负零保持，357文件重复打包逐字节一致。178块（176Int32+2Float64），chunk下载97357158B。全量候选保存于 `compact-runtime-candidate-memory01-r3`，仅候选、非采用。
- 不带routesUrl时，三次Chrome155约25秒加载，最大心跳间隙47.2ms，最高采样heap+backing501161370B，重复释放回落；7项取消/限制/404/编码重试/重复dispose检查通过，3张PNG已实读。这不是峰值RSS或手机实测。
- 带同源真实路线缓存时，原浏览器240秒无结果；干净浏览器独立60秒复现，27.412秒到routes阶段后32598ms无回传心跳，尚未进入named-query。超过原250ms响应门槛。同步makeRoutesService逐段校验是已读路径，具体昂贵谓词根因尚未证明，不能据此声称全图不通或归因于坐标接口。

业务1次、普通修正1/1、真人额外1/1均已耗尽。失败历史、原稿与证据保留；停止此logical，无自动R4、换名重试或主代理补写。

## 试玩状态与未完事项

旧18860/dad6b38链接此前收口已返回404、临时index缺失，原因未知。本轮未触碰旧服务、未再次请求入口，也未重跑旧GUI；旧代码保留在Git，不将旧链接称为当前可玩，不用旧418测试或17资源证明新地图。

CITY候选此前通过34City+7Flower+16独立反例及完整源24检查/2088移动帧/F3/7迁移，但使用明确父级路线适配器，不能代替真实runtime验收。它仍须与合格runtime/BOOT原子接入。加载响应、缺少交付、游戏接入，以及自然首杯→夜探实际带货→返店→日2、390键盘/暂停刷新/新提交资源字节与PNG尚未完成。

源仅为2026-10-16T00Z快照、bbox[4.865,52.345,4.970,52.405]四集合585页的完整范围；不称全城/立面1:1。2693无效源对象不擅改，697桥面不是2350桥，人物场所虚构，渡轮需显式乘船。未获demo认可不迁移正式引擎、Steam发布、收费或签约。

## 后续边界

同一 `amsterdam` 将恢复每日北京时间22点的新真人审批检查，保留ID/thread，最终汇总只通知一次。无新批准、真实交付/失败或必要决定时静默。旧窗口、已消费的批准、自动心跳和剩余候选都不是新授权。

唯一下一步：等待新的明确真人处置；恢复此失败logical须有具体追加范围/次数和新的执行窗口，再核对原账本与依赖。此报告不新增任何尝试。
