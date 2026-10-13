# PLAY10 父级独立验收

原请求 amsterdam-night-loadout-20261013 于2026-10-13T12:43:28.484748Z正常完成，911.500秒、38轮、CLI0、done/verifying，PID65518退出。完整合法handoff-result.json存在，tests四声明命令各一最终行。原始回执/报告/日志不改。

## 范围与工具
精确采用基线5ffbe6ec2c9ff2532f61a9f0196b80ec1c932dac。20源SHA、18暂存只读SHA相同；仅reopening-ui.js chooseExpedition与keydown模态分支、新test-night-loadout-ui.js。屏蔽两个允许段后UI其他字节完全一致，代码细读确认条件只作用loadout；所有旧测试不变。无额外workspace文件、权限拒绝、写越界。Read16/Edit10/Bash11；五条表外只读Bash为四条grep（其中三条head）与true，原报告说四条grep/true不准确，不能称命令全合规。预留handoff-result.json读写属于回执范围。恢复补丁自干净基线应用后2/2字节匹配。

## 独立测试
最终新测试在未改采用UI为3/7（四红：折叠内容/取消/焦点循环/各日路况），候选7/7。原日志2/7的五失败包含event测试夹具错误（真实tick每次最多1秒），不能当最终行为红灯；父级真实基线结果另存。
旧404+新7=411/411，全37文件；声明旧命令Node外层13/13，UI和新测试语法0。三个真实kit回调、日1/2/3路况、已出门/非summary guard、旧pause/confirm/event Escape均由新测试执行真实UI与core；模拟状态明确为技术fixture，非自然旧档。报告tests第一条重述RED但未增加行，保留。

## 自然浏览器
独立候选18848，新局seed42001：开始→进酒馆→确认开门→0杯提前打烊→summary→夜探工具弹窗。0杯用于到达目标场景，不称首杯教学/真人趣味。390x844弹窗x20/y86.375/w350/h671.25，底757.625；三工具依次底504.859/583.047/681.625，留店底733.625，四项完整常显、原名与原完整说明均保留，不需初始滚动。docWidth390、console错误/警告0。桌面1280x900也截图验证，展开完整街道/地点/Noor内容可阅读。
原生ShiftTab从首工具到summary；Enter打开、Space关闭、Space打开、Enter关闭均保留SUMMARY焦点；Tab与ShiftTab首尾循环在summary/3工具/留店之间。Escape和留店都取消、存档前后完全相同、焦点回到真实夜探启动按钮。重开后真实选择搬货背架，phase explore/kit cart/12格（真实KITS与技术回调核对）/auto true/duration180，现金27保持；P暂停刷新完整保存对象相等，旧暂停Escape仍恢复。
父级第一次诊断误用document.querySelector(details)读到了页面上另一个details，因此日志open字段false与截图展开矛盾；修正父级检查器限定#dialog-body details并等候真实open状态后，四次原生按键逐项通过。保留第一次原始记录及纠正记录，没有更改游戏。不要将父级取样器错误算游戏失败/消耗修正。

## 结论和限制
代码/真实GUI可采用；标准审查拟accepted_with_changes/other，原因是五条表外只读命令及原报告数值偏差。主代理未重写游戏，不需要PLAY10定向修正。整体丰富度/美术/好玩仍未完成，无真人趣味反馈。待独立游戏分支commit/push和新服务17实际资源逐字节核对后才称交付。
