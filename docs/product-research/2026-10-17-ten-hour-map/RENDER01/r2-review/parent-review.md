# RENDER01 唯一定向修正：父级拒收

结论：rejected / semantic，设计组件和游戏采用均0。原业务1+唯一修正1/1已用尽；不自动第三次、不换ID、不由主代理补写实现。数据PACK01-R2仍在同波运行，D26窗口继续。原回执、原报告、实现与日志保持原字节。

## 终态与范围

固定ID amsterdam-d26-geo-map-renderer-r2-20261017，2026-10-16T18:27:03.811993Z至18:50:37.836963Z，1414.012秒，CLI0/is_error=false，完整合法四最终命令报告，worker67847/launcher67846已退出，外层60268已收回。Seed Evolving thinking enabled/effort high，1800秒55轮，业务后的唯一修正。Read11/Edit12/Bash8；其中2条额外只读命令实际执行：wc+head、node测试管道tail，其余精确命令内。无权限拒绝、无读写越界、10源SHA和6只读暂存SHA全保持。仅geo-map-renderer.js/test-geo-map-renderer.cjs/renderer-demo.html改变，benchmark逐字节未变。

父级复制原始输出独立执行4精确命令均0，37/37（原31测试文本保持，仅插入6测试），benchmark合格。原始新增rectHits测试辅助函数混用w/h和width/height会使部分矩形断言失效；父级仅在隔离诊断副本修正维度取值后37/37仍绿，不改原测试或实现。该测试盲区本身不能证明功能失败，实际浏览器另验。

## 原标签问题改善已实际核实

完整候选145703地物，父级真实Canvas在320/390/1440视口（实际292/362/1100CSS）、street/city和昼/夜共12组重测：Lotte与pub标签12组均存在、互相遮挡0，实际文本度量位于标签框内，字体约11/12CSS；浏览器序列化最小10.9999952727属于4.73e-6CSSpx舍入，不当字体回退。全城夜间PNG已实际读图，原被遮的Lotte可见。该技术夹具使用旧PACK候选，不是自然游戏或采用后的资源验收。

首版父级matrix误读公开返回记录没有的lines/fp字段，TypeError已保留为full-matrix-initial-error.log；改为捕捉真实fillText/font/measureText后重跑12组。未改下游代码，不把父级诊断错误当游戏故障。

## 新回退：静止页面不断改变画布高度

实际原始renderer-demo.html，不注入CSS或修改实现。390×844、DPR1、请求CSS1100自然受布局限制；canvas外框364px，内容362px、1px边框。正常绘制时resolveFrameSize读取getBoundingClientRect含边框尺寸，syncFrame每帧据此外框重新设置canvas.width/height；CSS height:auto又由新的内部宽高比计算下一次外框，构成反馈。

真实连续100帧（约2秒）两次独立复现：
- 修正版开始外框高度214.8125，backing364×214；静止后高度274.484375，backing364×274。
- 同一100帧对照原首稿：外框高度212.609375→212.609375，backing1100×640不变。
- 修正版页面标题/按钮/玩家均无操作，画面纵向范围改变、页脚下移约60px。before/after PNG实际读图确认。
- 这不是设备DPR变化、用户缩放或真实移动。画布尺寸同步属于本次明确修正范围；新增响应helper尚不能稳定代表可绘制内容尺寸。原标签已改善和37绿不抵消该回退。

证据demo-measure.json/log（每20帧采样）、demo-drift.json/log与两张PNG、baseline-height.json/log、原demo与helper源码。HTTP实际geo-map-renderer.js/renderer-demo.html/parent-full.html字节与父级隔离副本相等，module SHA 7e60695d5e4307f819a3def38b1d67f4d904d2be2d583e11356926460056292c，demo SHA e56b9ac796034709dcfc9f4f6f36bfccb55ce809b342e07292b5a72d36e01f48。

## 边界与后续

未继续扩大到DPR/所有长名称/所有地图边缘的完整GUI验收，已确认拒收。没有把辅助测试改动采用进游戏，也没有补写下游报告。完整失败证据保全，原业务/修正历史保留。旧试玩18860/dad6b38、游戏转换工具3c9bb0e保持；数据PACK-R2继续。NAV额外一次问题仍仅待真人实际答复，本次没有新RENDER例外问题或第三次请求。
