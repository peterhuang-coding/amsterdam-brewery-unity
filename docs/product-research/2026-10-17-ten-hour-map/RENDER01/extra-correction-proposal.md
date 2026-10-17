> 最新：2026-10-17T01:19:43.879799+00:00已收到真人实际同意。RENDER准备固定R3，仅本项追加一次。 导航未获本次批准。以下提案及旧待答记录保留为历史。

# RENDER01：额外一次定向修正提案（已询问一次，待真实答复；未授权、未创建请求）

原业务和唯一修正均已拒收，历史保留。最新父验[r2-review/parent-review.md](r2-review/parent-review.md)：原标签互遮已修复，但390×844/DPR1静止100帧画布外框高214.8125→274.484375、页脚下移约60px，首稿稳定。含边框外框尺寸与height:auto/backing回写形成反馈。

若真人额外批准一次：沿用logical `f02-real-geo-renderer-d26`（已与原账本逐字核对），固定拟定task `amsterdam-d26-geo-map-renderer-r3-20261017`，1800秒55轮，Seed Evolving enabled/high。只改geo-map-renderer.js/renderer-demo.html/test-geo-map-renderer.cjs；保持几何/地图API/有界缓存与原标签改善。限定CSS内容框/边框/backing尺寸的稳定测量及回写，纠正原rectHits测试辅助函数width/height与w/h错配，不扩成美术重写。

输入是当前修正版、原37测试、原尺寸反例与父级真实DOM测量，不含聊天或Hub。先准备并验证精确合同、公开输入SHA、远端和Notion再派发；当前没有handoff或请求。

验收：原37测试意图与benchmark，实际原始demo静止帧、resize/尺寸按钮和DPR1/2均无自增长；完整数据12组320/390/1440近景/总览/昼夜的字体/标签互遮/玩家遮挡保持通过，截图实际读图。不能只用stub或同一帧尺寸断言代替浏览器布局反馈。

额外次数仅1；再失败即保留并搁置，不自动继续。批准此项不批准NAV/PACK额外次数，不等于游戏采用或延长02:03:03Z截止。
