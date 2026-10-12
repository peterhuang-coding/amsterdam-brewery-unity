# PLAY02 第一条街：候选已归档，未采用

D22 2026-10-13用户新批准实现近景地图与易上手改进。Coding Plan已实际修改4文件，但2146.430秒后达到80轮上限，缺完整交接；父级又在实际页面复现“直接进酒馆”误入Lotte地点。完整验收0/1、游戏采用0，PLAY02阻塞。

候选已包含近景跟随、建筑立面与人物、可选桥边约定、短欢迎页和局部提示。**这些不是已交付版本，也没有获得玩家趣味认可。** 原18828/18767及旧档不动，独立游戏HEAD仍d89421e。

- [独立验收与复现步骤](evidence/parent-review.md)
- [完整候选补丁](candidate.patch.gz)，准确基线d89421ef86dda52044c38fab63f71a3f979138ca；解压后git apply，已实际恢复并核对4/4哈希。
- [输出哈希](evidence/output-sha256.json) · [恢复验证](evidence/restore-check.json)
- [最终全量356/356](evidence/full-regression.txt) · [原基线红灯2/9](evidence/new-tests-red.txt.gz) · [语法](evidence/syntax.json)
- [任务终态](evidence/result-summary.json) · [范围审查](evidence/scope-review.json)
- [批准范围与验收](brief.md) · [原交接包](handoff.json)
- [Notion PLAY02](https://app.notion.com/p/3f73285284df81499790d13e30b41789)

原请求amsterdam-first-street-20261013已结束，无本项目在途。失败即停，未补派、换模型、按量或主代理补写。新明确恢复后可复用此补丁，先修目的地与压缩引导，再完整交接和自然GUI；不自动继续。
