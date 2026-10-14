# MAP01 唯一修正：完整交接，父级语义与图稿拒收

结论：采用0，MAP01按D24搁置。三弧运河与联排街区比原单弯渠稿更接近F02要求，但下列三处问题仍未解决，不能把结构绿灯当成可直接执行的设计。原稿、SVG和报告不改写；尚未得到用户设计认可，没有游戏改动。

## 原请求与独立核验

- `amsterdam-map-morphology-design-r2-20261015`实际2026-10-14T16:33:30.267105Z开始，16:58:40.031524Z结束，1509.736秒。CLI0、final subtype success、is_error=false、adapter verifying/state done，worker72043已退出；不是超时/限流。
- Read14/Edit15/Bash3。两次准确`python3 validate_design.py`，另有一条表外`true`；无permission_denials或disallowed_changes，但不能称命令全部合规。十二份原输入、九份只读暂存SHA保持；仅三份设计输出及reserved报告写入。
- 完整合法一条最终命令报告。原summary误写“MAP02 correction”，实际task/telemetry是MAP01；memory_delta自称“Adopted/accepted”仅执行器自述，本父验不认可，不改原回执。
- 父级在独立`/tmp/amsterdam-map01-r2-parent`运行结构验证器，退出0；rsvg-convert渲染退出0，实际读图。最终SVG SHA256 `7bc963565b041858942f7772c2828a4cfc0a5dffa9badf5fc1b7c08077fd9788`、PNG SHA256 `368b4f96ac657cd022c80c37214f91304b1168c0021916614249fe323b259495`，均与16:48实际读过的中间图逐字节相同，问题保留到最终稿。
- 本轮只核对既有源码规则和设计图，未实现新几何、未重跑418/游戏GUI，不证明城市感、首次体验或乐趣已获认可。

## 最多三个明确阻碍

1. **现状与地理事实不准确，削弱还原度论证。** `design.md` §1/§2与`findings.json` I1说三条南渠“互不接IJ”。实际IJ矩形止于y460，两条竖渠都从y460开始，横渠又与两竖渠相交；四个矩形水域的并集连通。父级直接读取dad6b38导出矩形，计算接触边`0–1/0–2/1–3/2–3`，结果全连通，见`map01-existing-geometry-evidence.json`。这不否认直角水网缺少真实运河带形态，但不能把缺少弧带偷换成水域不连通。§4还新增了未在源卡提供的“Brouwershaven一带”说法；[Schouwen-Duiveland市政府的Brouwershaven页面](https://www.schouwen-duiveland.nl/bouwen-verbouwen-en-slopen/woningbouw/brouwershaven)与[I amsterdam中Brouwersgracht/Prinsengracht的官方图注](https://www.iamsterdam.com/ontdek/amsterdam-750-jaar)不支持将这两个地名混用为Amsterdam接港事实。该句须有准确来源或明确移除事实断言。
2. **Lotte的设计槽位与拟验收互相矛盾。** §4将Lotte放在B3上，B3要求h=70、维持不可骑行/必须推车的现行规则；§11第1项和最终`findings.acceptance[0]`又要求七地点+ENTRY+CART全部walkable/rideable。这两条不能同时成立。原`City.rideable`明确排除h<80跨点；父级实调现有两窄桥中心，均walkable=true、rideable=false。需要统一Lotte落点与期望通行模式，不能把未来执行器逼向改规则或放松测试。未用修改后的游戏代码伪造反例。
3. **最终SVG仍不满足清晰可审阅要求。** 放大图的线段写成`x1=1450,y1=876,x2=1450,y=940`，缺少`y2`；实际渲染产生从顶部贯穿图例和旧骨架小图的长竖线。右侧放大图说明与底部数量行未换行，超出面板并被整个画布裁切/互相覆盖。`concept-render.png`保留完整实际渲染，不裁掉问题。XML合法与计数schema检查无法发现此类布局问题。

## 后续边界

业务1+唯一修正1/1均已使用，标准登记rejected/semantic。按当前目标仍保留的“每项一次修正、失败搁置”，不再派第三次，不换ID清零，不由主代理改写SVG/设计或游戏。MAP02此前也已按其原逻辑限次搁置，原探针数据的父级复跑证据独立保留。需要额外修正授权时，先展示这份完整未采用草图与三条问题，再只请求明确例外；不能把“无限火力”泛化为已取消当前明确保留的D24规则。

游戏继续采用dad6b38/18860。旧PLAY03/06/07/11/12/FREEZE01继续搁置。固定四天截止与下次方向review不变，整体目标未完成。
