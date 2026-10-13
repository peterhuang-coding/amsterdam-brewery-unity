# PLAY07：酒馆里的人

D23授权范围内的新独立人物表现包。采用基线bd614431e31dc44cd3730ef6c0d6c022cd355b1a，codex/art-pass-20261013。自然新局→进酒馆→开门观察[基线截图](baseline-night.png)：Marta仍是圆形轮廓，选中箭头很小。基线来源独立18840临时服务，不改18839/旧档；仅观察，未倒酒，不是新成果。

设计取舍：全场景重画会扩大边界；增加DOM卡会与已搁置首杯包重叠；本包选择只画人物轮廓、衣着、选中形状和真实等候/倒酒反应。深绿酒馆保持，铜色描边/梅紫与青绿衣物区别熟人，不把普通客人画成指定人物。选中客人少量真实姓名/想喝酒种信息，动作保持所有晚一致，不加新教程。

[交接规格与步骤](brief.md) · [合成绘制状态契约](frame-contract.md)。只写scene客人座椅段/专用helper、新test-pub-guests.js；城市/运河/酒馆其他绘制、实际倒酒杯、核心/UI/CSS/经济/存档只读。全部旧断言不变。新测试执行真实PubScene.draw，合成frame明确标注、不冒充真实旧档。父级完整379+新增回归及自然GUI桌面/390px/选择/倒酒/暂停刷新后才采用。

固定amsterdam-pub-guests-20261013，logical play07-pub-guests/business；1200秒32轮，Seed Evolving enabled/high，Read/Edit/Bash、仅4精确命令。7公开输入95133B，准确暂存city13内置断言+scene7（node:test外层8/8）、scene语法通过；新test为空，不算通过。dry-run仅本地配置检查，无套餐调用。

当前准备未提交、业务0/修正0/1、采用0；因前次API超时，父选冷却至2026-10-13T07:17:19Z。此之前不派/探针，不代表服务恢复保证。到时实时读原ID/Notion/Git/输入哈希及全机容量，Notion执行中与主线提交记录后单路启动一次。不是等待新许可。已有稳定账本则只查原请求，不重复提交。失败一次定向修正，仍失败搁置；PLAY03/PLAY06仍暂缓。

父级规格自审：文件/方法边界清楚；waiting/selected/pour按实际ID，不用历史标志；旧Canvas矩阵/数值检查保留；不改其他场景；有自然基线截图和GUI路径。美观和趣味仍待实物与人判断，不以测试数替代。

Notion：[PLAY07](https://app.notion.com/p/3f83285284df819983d1fe6a03568ddb)。
