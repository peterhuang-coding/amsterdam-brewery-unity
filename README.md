# Tweede Kans · Amsterdam Brewery

一家快倒闭的阿姆斯特丹酒吧，三个晚上，一本会自己长出收费项目的账。

当前默认入口是浏览器里的三天完整试玩：白天在运河打捞、酿酒、打工或拜访邻居；夜晚亲手倒酒，照顾顾客，也应付房东、网红和检查员。方向是《潜水员戴夫》式的昼夜经营节奏，加上关于租金、官僚手续和曝光经济的黑色幽默。

## 试玩

无需安装依赖。在仓库根目录运行：

```sh
python3 -m http.server 18767 --bind 127.0.0.1 -d tools/prototype
```

打开 http://127.0.0.1:18767/?seed=42 。也可直接打开 `tools/prototype/index.html`。

- 白天有两次行动，30 秒运河打捞能带回酒花和密封酒瓶，也可能捞到收费清运的单车。
- 晚上核对两款酒的口味和价格，在合适时机收杯；倒酒消耗真实库存。
- 三位熟客会记得承诺。三种不速之客事件会改变库存、顾客预算、耐心和实际租金。
- 前两晚可选设备升级；第三晚结束时留下 €100、累计让 12 位客人满意，就能重新开业。
- 支持鼠标、键盘、触屏按钮，自动存档与暂停。`H` 看帮助，`P` 暂停。

这是一个验证核心乐趣的短篇切片，尚不是完整城市探索或长线内容版本。原来的七天城市实验保留在 `tools/prototype/legacy.html`。仓库名称沿用历史命名，当前开发与验收入口是 Web 原型。

## 开发与验证

```sh
node --test tools/prototype/test-reopening.js
node tools/prototype/test-phase-e.js
```

玩法规则、Canvas 场景和页面交互分别放在 `reopening-core.js`、`reopening-scene.js`、`reopening-ui.js`。详细操作与验收见 [试玩说明](tools/prototype/README.md)。设计和实施记录位于 `docs/superpowers/`。
