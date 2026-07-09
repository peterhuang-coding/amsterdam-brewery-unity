# Agent Spec 02 — 通宵任务：存档系统压力测试 + 边界场景探索

## 分支

继续在 agent/save-system 上工作（不切分支）。

## 任务

这是一个"通宵跑"的任务。你要对刚完成的存档系统做彻底的边界测试和鲁棒性验证。只读分析 + 在现有代码上做防御性加固（如果发现问题）。

## 具体工作

### 第 1 步：存档完整性分析

静态分析 SaveManager.cs 和 GameController 的保存/读取流程：

- 画出保存流程的完整调用链（SaveGame() → SaveManager.Save() → JSON 序列化 → 文件写入）
- 画出读取流程的完整调用链
- 列出 SaveData 中每个字段的序列化来源（在 GameController 中哪个变量映射到 SaveData 哪个字段）
- 检查是否有 GameController 状态没有进 SaveData（比如 _waitingForDrinkChoice、_currentDrinkOptions、_pendingCustomerId、_shiftCtrl 的运行时状态）
- 写出"读档后无法恢复的状态"清单

### 第 2 步：异常场景分析

分析以下场景会发生什么（静态分析代码路径）：

1. **存档文件损坏** — 如果 save_slot_0.json 被手动编辑成非法 JSON，Load 会怎样？
2. **存档文件丢失** — 文件被删除后按 F9
3. **空存档** — 文件存在但内容为 `{}`
4. **版本不匹配** — version 字段是 99（当前代码只支持 1）
5. **磁盘空间不足** — 写入时 IO 异常
6. **并发保存** — F5 连按 10 次
7. **读档时酒吧开着** — 读档时 _shiftCtrl.IsShiftOpen == true 但队列状态不在 SaveData 中
8. **读档时对话进行中** — 读档时 _activeDialogue != null
9. **跨语言读档** — 当前 locale 和存档时的 locale 不同
10. **Day 14 读档** — 读档后立即触发 ending

对每个场景给出：会不会崩溃？会不会数据错乱？会不会静默失败？如果可能出问题，给出修复方案。

### 第 3 步：SaveManager 防御性加固

如果第 2 步发现了可修复的问题，在 SaveManager.cs 中加固：

- JSON 反序列化加 try-catch，失败返回 null
- 空 JSON / 字段缺失时给默认值而不是崩溃
- version 不匹配时 warning 日志但仍尽力加载
- SaveData 字段缺失时用默认值填充（比如新增字段在旧存档中不存在）
- 文件写入失败时不覆盖旧存档（先写临时文件，成功后再 rename）

### 第 4 步：存档 UI 体验改进

如果当前 Save/Load 按钮没有以下反馈，补上：

- 保存成功：FeedbackText 显示 "Game saved. (Day X, $Y)"
- 读档成功：FeedbackText 显示 "Loaded — Day X, $Y at Z"
- 读档失败（无文件）：FeedbackText 显示 "No save file found."
- 读档失败（损坏）：FeedbackText 显示 "Save file corrupted."
- 自动保存时不显示反馈（静默），但加载时提示 "Auto-save from Day X available — F9 to continue"
- 同一个 slot 5 秒内不能连续保存（防止 F5 连打）

### 第 5 步：存档兼容性测试用例生成

生成一个测试矩阵 CSV，列出所有可能的状态组合：

```
Day, Time, Location, Money, BarOpen, DialogueActive, SaveThenLoad_ExpectedBehavior
1, morning, de_pijp, 250, NO, NO, Day1 morning de_pijp $250
1, evening, tweede_kans, 300, YES, NO, Day1 evening T.Kans $300 bar open (queue lost)
...
```

至少覆盖 20 个状态组合。标出哪些预期会失败（如 bar open 时读档）。

### 第 6 步：自动保存策略优化

分析当前自动保存触发时机（day 变化时保存到 slot 1）。考虑：

- 是否应该在每次 serve 后也自动保存？（防止崩溃丢钱）
- 是否应该在对话结束后自动保存？
- 自动保存和手动保存会不会互相踩？（slot 0 vs slot 1）
- 建议 3 个 slot 的用途分配：
  - slot 0: 手动保存
  - slot 1: 自动保存（day 变化）
  - slot 2: checkpoint 保存（对话前/bar open前）

把建议写清楚。

### 第 7 步：循环 — 做第 8 步到第 11 步

以下可以反复做：

**第 8 步：序列化性能分析**

- SaveData 当前有多少字段？JSON 大概多大？
- 如果触发对话 ID 累积到 100 个，JSON 多大？
- 如果加库存数据（spec 04），JSON 多大？
- Unity 的 JsonUtility 在移动端序列化这个大小的对象大概多少 ms？
- 存档写入是否需要异步？（当前是同步的）

**第 9 步：跨平台路径验证**

- Application.persistentDataPath 在不同平台分别指向哪里？（iOS/Android/macOS/Windows/Linux）
- 存档文件在这些路径下是否会被云同步（iCloud/Google Drive）误覆盖？
- 建议的路径隔离方案

**第 10 步：存档加密分析**

虽然这个原型不需要加密，但做分析：
- 如果用 AES 加密存档，需要改 SaveManager 的哪些地方？
- PlayerPrefs 存加密密钥是否安全？
- 建议的最小改动方案（如果以后需要防作弊）

**第 11 步：存档文档**

写一份 Docs/save-system-design.md，包含：
- 存档文件格式说明
- 字段列表和类型
- 版本兼容策略
- 错误处理策略
- 未来扩展指南（加新字段怎么兼容旧存档）

## 不改动的边界

- SaveManager 核心 API 签名不变（Save/Load/Delete/ListSlots）
- GameController 游戏逻辑不变
- 可以修改 SaveManager.cs 的防御性代码
- 可以修改 GameController 的保存/读取/反馈相关代码

## 循环模式

第 7-10 步是循环的。每轮从不同角度审视存档系统：
- 第一轮：崩溃安全（每个异常路径都检查）
- 第二轮：用户体验（每个反馈都到位）
- 第三轮：性能和数据量
- 第四轮：未来扩展

## 验证

```bash
python3 tools/validate_unity_project.py      # 必须通过
grep -r "Arial.ttf" Assets/Scripts/          # 必须为空
```

## 完成后

1. 把第 1、2、5、11 步的产出放到 Docs/ 下（或写在本文件结果区）
2. git commit，message 格式：`fix: save system hardening — defensive deserialization, edge cases, UI feedback`
3. 把 commit hash、发现的问题数量、修复数量写在本文件「## 结果」下面

---

## 结果

（agent 完成后填写）

- 异常场景分析：/10 个场景
- 发现需修复的问题数：
- 已修复数：
- 测试矩阵状态组合数：/20
- 自动保存策略建议：
- commit hash：
- 用时（大概）：
