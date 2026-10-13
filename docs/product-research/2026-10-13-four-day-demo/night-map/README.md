# PLAY08 夜探方位图 — 准备未提交

D23四天网页demo授权/D24失败策略下的独立小包。现有夜探地图只画区域块和动态墙，静态B.WALLS缺失；玩家和西南返店口都为小圆点，自然起点重合。主代理已自然新局→进酒馆开门→0杯提前打烊→长钩绳→夜探起点观察，见[基线截图](baseline-night-map.png)。0杯仅为快速进入夜探，不是首杯/趣味验收；临时18841/PID48942和标签已关闭。

固定任务amsterdam-night-map-20261013 / logical play08-night-map / business；业务提交0、修正0/1。原包/tmp/amsterdam-night-map-20261013/handoff.json，稳定账本尚未创建，恢复必须先查原ID。基线bd614431e31dc44cd3730ef6c0d6c022cd355b1a；仅backstage-scene.js::miniMap及专用helper、新test-night-map-scene.js可写。6公开输入87072B，3现有代码SHA与采用提交相同；空新test预创建供Edit，不当测试通过。已在准确暂存副本跑旧district18/18和scene语法0，dry-run确认请求Seed Evolving thinking enabled/high，实际能力待启动核对。1200秒32轮。

[详细brief](brief.md)、[真实run/renderer接口](frame-contract.md)、[交接包](handoff.json)、[输入SHA](input-hashes.json)、[预检](preflight.json)。主代理仅定边界/准备与未来验收，不实现游戏或新回归。

只改善原小地图：统一投影，人物/返店口形状和标签区别，真实墙/水障碍/动态门闸、桶与提示位置。小屏地图仍能认出角色和出口；不画虚构安全路线、不改变相机或玩法。游戏其他绘制、核心、UI/CSS、经济、存档及旧断言只读。PLAY03/06/07继续搁置，不复活失败包。

完整报告/实际工具/输入哈希/范围、新行为先在未改基线红再候选绿、旧379+全部新全量、自然夜探起点→移动/手动自动→M地图→暂停刷新→实际出口返店、桌面390px和前后截图全部通过后才采用push。技术不等于真人趣味通过；现有试玩仍bd61443/18839。

因PLAY07唯一修正再超时，父选冷却至2026-10-13T09:55:32Z（北京17:55:32），不是Retry-After或恢复保证。此前不派发/探针。冷却后现有心跳实时核对Notion/Git/输入SHA/固定ID和全机容量，先Notion执行中和主线记录后单路启动一次；提交前只有准备，不能当在途。若失败，终态确认后仅一次定向修正；仍失败搁置，不改ID清零。

Notion: https://app.notion.com/p/3f83285284df812590cbecc1b3f8e793

## 追踪同步

失败归档与本合同已push194e2c9fa6f09561b889076f00e5453c83df6b51。2026-10-13T09:17Z真实Notion读回：PLAY07暂缓、PLAY08可执行（仅冷却后可提交），主页已回链本合同和失败归档。冷却前无新套餐请求；准备不当在途或游戏交付。
