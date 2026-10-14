# MAP01 额外定向修正：终态失败，未采用

固定请求 `amsterdam-map-morphology-design-r3-20261015`，logical `f02-map-morphology-design`。真人对原问题 call_3b2914171acb4ab9868e941f8237d61a item0 实际答复“追加一次定向修正（推荐）”；本次只使用该一次例外，原业务与标准修正失败历史完整保留。合同 1b0d09ab65cc2ee0622df64dfd5a8ca43d91168c，启动记录 33cd33978f04fe4266d4a7c8e43d07b73c8f3f52。

## 终态与边界

- 2026-10-14T17:23:09.941197Z 启动，18:11:21.760603Z 结束；Seed Evolving、thinking enabled、effort high，2400 秒/40 轮合同。
- 原回执为 `error_max_turns`、`is_error=true`、Claude CLI 1、外层 2、`state=done/result_status=blocked`；最终事件 `num_turns=41`。worker76332 与 launcher76321 均已退出。不是 2400 秒 worker 硬超时，也没有证据把本次归为 API429/传输故障。
- 回执运行耗时 1744.621 秒，起止墙上时间差 2891.819406 秒；差异原因未证实，分别保留，不改写历史计时。父级曾在墙上时间超过 40 分钟时核查超时实现；脚本确实以 subprocess timeout / monotonic 计时，未取消、修改时限或重发。
- `handoff-result.json` 不存在，`result.report=null`、`tests=[]`、summary 空。四个修改文件存在不代表完整交接。
- 实际 Read17/Edit44/Bash5；三个 Edit 因匹配字符串不存在失败，其余读写路径均在合同内。没有表外 Bash、权限拒绝或文件越界。Bash 为结构检查 2 次、SVG 渲染 3 次；其中首次渲染后、没有 intervening Edit 的第二次渲染属于额外重复，不能声称只执行了两条命令一次。
- 11 份原输入 SHA 全不变，8 份只读暂存 SHA 全不变。只变 `design.md`、`findings.json`、`concept.svg`、`concept-preview.png`，游戏修改 0、设计/游戏采用 0。

## 父级实际检查

已将终态源码复制到独立 `/tmp/amsterdam-map01-r3-parent`，直接执行结构检查及 SVG 渲染，均退出 0。独立渲染和 worker PNG 的 SHA256 完全相同：`debfd84c5fde3f3dd69d7d052997e9fc76b92478727ffdd6a3e9ba7cde8f7fb9`。已实际读取完整 1600×1067 PNG，没有以 XML/命令退出 0 冒充视觉通过。

有改善的部分：正文、JSON、图中已明确现有四片水是连通并集；把弧形/街区形态不足与水道断连分开；原无来源接港说法被否定，Lotte 无立面的事实得到更正。Lotte 在 B3 h70 桥上的 walkable=true/rideable=false 例外与九点步行、72 非自对路线要求已分别声明。原贯穿图例的长线已不再渲染，侧栏长说明已分行。

仍不通过，不能采用：

1. **完整交接缺失**：终态 error_max_turns 且缺保留报告。父级不能代写报告或把运行结果改成成功。
2. **视觉遮挡回退**：`concept.svg:55` 的 DE PIJP 标签基线 y=900；后绘制的 counts 面板在 `concept.svg:264` 从 y=888 开始，覆盖该标签下部。完整实际 PNG 可见只剩上沿字形；移动说明框解决原溢出却引入新遮挡，未满足“无重叠”的定向验收。未继续全面游戏/GUI验收。
3. **新通行说明仍有局部事实错误**：正文/JSON/图底部将 42 单位写成“桥头 42 内 parkBike 停车”条件。实际 city 的 `toggleBike` 才在取车上车时检查人与自行车距离 >42；`parkBike` 把已骑/推的车停在当前人位置，没有“距桥头42”的判断。核心窄桥例外已改善，但不能把新增模式说明整体称为事实通过。

没有运行拟议地图几何、81 路线、存档迁移、首杯或真人体验验收；本包只有设计草稿，没有游戏实现。原两份失败稿、本次终态与本次父审均保留，主代理未重写任何草稿。

## 处置

标准审查拟登记 `rejected/other`（原回执的轮次耗尽/报告缺失为主因，附两条实际语义/视觉问题；以另存登记结果为准）。原业务 1 + 标准修正 1/1 + 本次明确额外修正 1/1 全已使用，MAP01 再次搁置，不自动第四次、不换 ID 清零、不主代理补写。MAP02 与其他搁置项不复活。

当前游戏仍 dad6b38/18860、游戏分支干净；49 份 Amsterdam status 的 state 全 done，仅说明无在途，不说明全通过。目标未完成，goal 实读仍 blocked；固定截止 2026-10-16T19:48:33Z、下次方向 review 2026-10-14T21:48:33Z、final_report_sent=false 保持。

证据：原 `result.json/status.json/launch.json/handoff.json`、`events.jsonl.gz`、原四份输出；`parent-audit.json`、`actual-command-results.json`、`parent-structure.json`、`render-result.json`、`concept-render.png` 与可复核收集脚本。原日志、原稿和回执未修改。
