# MAP02 首包父验：数据复跑通过，说明语义需定向修正

原任务 amsterdam-map-baseline-20261015，2026-10-14T16:26:01.533051Z 正常结束，974.639秒，CLI0、final subtype success、is_error=false、adapter verifying。完整合法交接报告；worker69583已退出。十份原输入与七份只读暂存SHA不变，实际Read18/Edit5/Bash6，Bash仅两种授权命令各三次，无权限拒绝或越界写入。原始回执和稿件保留。

父级读完探针，在独立/tmp/amsterdam-map-baseline-parent复跑node baseline-probe.js与python3 validate_baseline.py，两者退出0；生成baseline.json的186365字节与CC交付完全一致。9锚点、81有序对（9自环为空，72跨点可达）、8直线/64网格路、2424可行走网格点、16渡轮对；9锚点恢复及额外3种合成恢复检查。采样与合成存档不等于连续几何证明、自然试玩或乐趣认可。

整包暂不采用，原因是inventory.md第5节渡轮解释与其自己的baseline.json相矛盾：

1. Noord位于北岸，却把→noord写为向南、noord→其他写为向北。去Noord也并非全部61样本：pub/lotte/coffee/market→noord各61；flowers/lab/garden/cart→noord各50；noord→其余8锚点各50。合计844正确。改用明确的from/to分组，避免错误概括。
2. UI:585按剩余折线长度除以240/420并向上取整估算秒数，不是步进模拟实际到达时间。City的实际移动步进应另外说明，不混作UI估时算法。
3. 第3节garden进入途径列为“只有”三种并不完整：UI:689的E键调用enterCityPlace，连同页面动作也可触发；核对:409-423、:611及键盘入口后列准确范围或去掉排他断言。第4节flower facade迁移后自行车仍须经过:363-369合法性检查，不能无条件称保留自行车。

唯一修正限于inventory.md及合法交接报告，baseline-probe.js和baseline.json必须逐字节保持；源与验证器只读。原数据可作为已独立复跑的事实输入，原错误说明不可当通过稿。业务1/修正0，本轮游戏修改0、采用0。修正失败按D24搁置，不主代理重写整稿。
