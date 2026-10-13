# PLAY03 首包终态与一次修正合同

2026-10-13：原请求amsterdam-first-cup-20261013在1500.160秒worker timeout，CLI143，state done/result unknown，原PID18184确认退出；缺handoff-result，完整接受0/1，游戏采用0。D24允许同一逻辑任务一次定向修正，后续若该修正或父级验收失败则搁置PLAY03，不再补派本项。

父级候选33文件367/367，0跳过；最终9新测试置回真实6e4f7b3基线3/9（6预期失败），候选9/9。CC早期版本红灯2/9是不同测试快照，不能混用。只读17输入与源哈希不变，四允许文件改动，旧first-street仅指定一个测试改变、另10项原样。实际Read13/Edit17/Bash4；其中wc及grep|head两条只读Bash在精确命令表外，无权限拒绝/写越界；CC只跑一次早期新测试红灯和JS语法，没完成最终测试/报告，最终绿灯来自父级。

独立临时候选18834自然新局→街头→进酒馆→开张后，当前客人/酒款/批次摘要与折叠选项实际可见；Enter展开后details.open=true但document.activeElement为BODY，后续Space未收起（也没有倒酒）。仅这段交互已验证；首杯到账/刷新/390px尚未完成。源码根因：summary激活处理调用render替换节点，render仅按data-focus恢复，新增summary未设恢复标识。不要声称三个玩法缺陷或完整GUI通过。截图keyboard-review.jpg记录较晚自动租金事件，并不是焦点证明；焦点证据用gui-focus.json。

修正amsterdam-first-cup-r2-20261013，沿用逻辑play03-first-cup，attempt_kind correction，额度1/1。复用四文件原候选，只允许reopening-ui.js和test-first-cup-ui.js（其余原候选CSS/旧测试只读）。仅修首杯disclosure焦点、补行为回归与完整标准报告，保留9测试和旧42范围。目标按Enter/Space开合后焦点仍在summary、Tab可进入选项、定时render不丢焦点，展开状态/选择保持；不改变游戏机制。1200秒32轮，Seed Evolving enabled/high，所有预置文件可Read/Edit，三条精确测试命令；禁止额外Bash。父级最终全量及自然首杯/到账/刷新/390px通过才采用，当前试玩6e4f7b3不变。
