## PLAY05首包终态与唯一修正准备

原amsterdam-market-focus-20261013已05:06:29.161469Z结束，1377.032秒、48轮上限（最终num_turns49）、error_max_turns/CLI1、state done/blocked，PID30474退出。result.report=null，但workspace/handoff-result.json实际存在且四条最终命令齐全；不是缺文件，也不是正常成功。Read11/Edit29/Bash13全部范围内，9源与7只读SHA不变，无权限拒绝或写越界。

父级原样新11/11、采用基线配最终测试2/11、全34文件376/376=旧365+11、旧包32/32、语法0。仍复现两处语义缺陷：市场只隐藏exp-objectives外框，三个无关目标正文仍在；真实collect→drop后背包空、stockTaken历史标记仍true，提示错误声称货已在包。报告“已隐藏”与实际渲染矛盾；最终GUI未跑，游戏采用0。两文件补丁在干净e3b7ac3恢复2/2 SHA一致，原始回执/实际报告/日志与父验归档market-focus-draft，标准review rejected/semantic。原执行器晚期unwired红灯不冒充未经修改基线；父级另做真实采用基线红灯。

D24本项唯一定向修正amsterdam-market-focus-r2-20261013准备，logical play05-market-focus/correction，复用完整原稿。只改backstage-ui.js与test-market-focus-ui.js：隐藏完整无关目标片段、区别当前背包与历史取货后果，并把同一当前目标卡提前；保留原11测试与全部旧断言/成本风险/自动选项。10公开输入198057B，准确暂存11/11+32/32+两语法通过，Seed Evolving enabled/high、Read/Edit/Bash，1200秒32轮。先新回归在未修原候选红灯，再修复与完整报告；父级全旧365+新增和自然夜1/次日回执/第三夜技术用例/390px/键盘后才采用。准备未提交，修正0/1；即时核对全机容量和原ID后只启动一次，仍失败搁置。

当前游戏e3b7ac3/18837保持，旧服务存档不动；PLAY03不复活。下一次整体review05:48:33Z与四天固定截止不变。

合同见brief.md；准确输入、允许命令、哈希、预检与dry-run独立存证。
