# D15：CC推进至2026-09-28 21:00

用户明确要求CC跑到今晚9点并回来验收。这是SM01新恢复决定，不抹去D13/D14历史。长期目标仍是有商业潜力的Steam单机；当前先做网页demo，用户认可后再决定正式引擎。

## 今天的顺序
1. 复用完整候选，修真实移动后禁用提示不刷新及开发标记漏出。
2. 夜间独立验收通过后，接既定白天线索、次日搬货差事/取库存涨价、一次结算和存档。
3. 小包逐个review，提供独立试玩入口和具体可玩的变化；不为了时长制造任务。

## 已派发（结果待收）
固定ID amsterdam-sm01-night-r3-20260928，逻辑attempt3，原始请求已确认CC运行，实际模型doubao-seed-evolving和thinking内容有证据。1800秒/80轮，high、dontAsk范围授权；全机未见其他CC在途后提交，本项目并发1。白天包依赖此接口，未提交。
游戏基线5970a022a7502d3075266cbe9051df472b16b852，独立codex/supermarket-night-shift；输入是de92aaa归档完整候选。工作台授权c49f59b。只允许backstage-ui/test-market-shift-ui与core一条玩家文案；交接包与哈希见docs/product-research/2026-09-28-demo-iteration。
原请求/tmp/amsterdam-d15-20260928/night-handoff.json；稳定目录~/.local/state/taskrouter/claude-plan/amsterdam-sm01-night-r3-20260928。运行时status命令显示state=running/status=unknown且result尚无，仅表示尚未交回；须结合原进程和events核查，不据此取消或重发。
当前游戏采用0，未预报测试通过或用户趣味。Notion SM01执行中，主页D15读回确认，两个子数据库保留。

## 今日调度与停止条件
已通过Codex automation_update更新现有amsterdam（未另建任务）：北京时间08至22点整点检查。20:00停止新派发，21:00明确汇总试玩入口、已采用更新和限制，并恢复原每天22:00审批检查。若首次恢复已过截止，只收原在途结果、汇总和恢复节奏，不续派。日常心跳仍去重，今晚21:00是用户明确要求的定点报告。
固定Coding Plan；失败/unknown终态/限流/内容拒收即停后续并通知；只收已提交，不换Astra或按量，不自动恢复其他旧失败、暂停项。每包至多3600秒且须给截止前验收留余量。没有全局原子并发器，启动前核查全机，最多两路真正独立CC，同波收齐再继续。

## 本轮验收合同
新增实际B.step回归先红后绿，不清缓存作弊；市场原因false→false会刷新；交付成本、安全撤离/放弃/第三夜事实准确且无内部标签；旧测试与核心逻辑保留，输入/文件/命令边界检查；全量Node和独立GUI。handoff-result不应列在自身changed_files，模型完成仍待主代理验收。

## 08:00 scoped acceptance and dependent stage

# D15 demo iteration

Night R3 passed its scoped acceptance and was adopted in [c8d36a14](https://github.com/peterhuang-coding/amsterdam-brewery-unity/commit/c8d36a14cb90aa35c9808145ed40754a47b52b0c), pushed to codex/supermarket-night-shift. CC used fixed Coding Plan Seed Evolving/high, completed in 474.094 seconds. Parent independently reproduced four expected failures with new tests against old production files (28/32), then ran the final snapshot: 313/313, zero failures or skips, 29 files, 39.6 seconds. Existing assertions unchanged; original inputs unchanged.

Real browser checks used valid opt-in night fixtures: keyboard movement changed the disabled fuse explanation from approach to missing part; actual trade/collection/delivery consumed the barrel; paused reload preserved delivery; automatic travel reached the exit and displayed a clean receipt; 390px had no horizontal overflow. This is not natural daytime entry or human fun validation. The complete day/night feature remains unfinished.

R3 changed only the permitted manual UI, one core reason literal and regression tests. CC also identified one `item2` label in the read-only automatic choice. That separate presentation gap is explicitly included in the following day integration scope; this acceptance does not claim every market label is clean. Seven Bash calls exceeded the exact command list, including read-only inspection/filtered tests and one denied report heredoc; the report was subsequently written using the allowed Write tool. Actual file changes/deletions stayed in scope. Do not claim strict command-list compliance.

The dependent first day-stage attempt is `amsterdam-sm01-day-20260928`, exact game baseline c8d36a14cb90aa35c9808145ed40754a47b52b0c, 3600 seconds/100 turns, fixed plan/high. Scope: reopening-core/UI, new test-market-daynight, market wording only in backstage-auto/UI. The night simulation, navigation, scene and all existing tests are read-only. See [day-spec.md](day-spec.md), the handoff and hashes for interfaces and acceptance.

Deliver free shift intelligence, new-night activation, actual returned facts, a one-day crate price consequence, a one-shot next-day errand, strict migration and truthful third-night feedback. Parent will independently review the returned result before adopting. No claim of full SM01 delivery yet. A first local dry-run rejected a command over 1000 characters before any submission or stable task directory; splitting the modern suite into two explicit commands passed preflight. Legacy Phase-E is not staged because legacy.html exceeds the 256KiB file limit; parent runs it in the full repository suite.

Today: stop new dispatch at 20:00, report actual playable updates and limitations at 21:00, then restore the existing daily 22:00 heartbeat. Fail-stop remains active; no metered fallback or other blocked-task recovery.

## Dependent dispatch confirmed
The original amsterdam-sm01-day-20260928 request is now running. Actual doubao-seed-evolving model and thinking events were observed, no terminal result yet. No other CC jobs were in flight at dispatch; this project uses one slot because the stages depend on each other. Notion SM01 remains in progress, links c8d36a14 and the scoped review. Existing amsterdam heartbeat prompt now resumes this exact day ID; no duplicate request. Both Git remote heads verified. Owned temporary 18808 preview server and amsterdam-d15 browser were closed after night acceptance; 18767 user preview remains unchanged.
