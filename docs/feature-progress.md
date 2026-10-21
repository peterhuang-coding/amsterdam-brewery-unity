# 轻量地图与玩法联调

[玩法与 Feature 盘点（2026-10-21）](gameplay-feature-matrix.md)

当前方向是城市总览加可切换的局部街区，优先保留运河、街区和桥梁形态，细节后续逐步增加。原始地理数据用于离线制作，避免浏览器一次加载整份精细地图。

| Feature | 当前状态 |
| --- | --- |
| 城市总览与局部地图 | 离线制作、五街区数据和按需加载已验收；绘制模块待修正 |
| 经营主线 | 现有版本已实测酿酒、第一杯、夜探实际取货、返店与第二天 |
| 花店小游戏 | 现有版本已实测取消、完成、前篮存取与布置窗台 |
| 送货、列车与打捞 | 现有地图已实测送花与急件交付、列车往返结算、30 秒打捞及奖励入库 |
| 街区移动与存档 | 真实街区移动、渡轮、停车及花园入口已部分验证；迁移和初始化接口仍待修正 |
| 新地图整合 | 等绘制和移动模块验收后接入，并重新验证主线与小游戏 |

现有规则回归为 472 项通过，无失败或跳过。上述试玩结果属于现有地图，不代表新地图已完成或已发布。

## Main loop and minigame regression coverage

Added 10 combined scenarios using real public game actions: brewing and first service; after-hours pickup and single reward settlement; salvage success, junk and natural finish; flower cancel/store/retrieve/use; delivery and parcel handoff; supply order fulfilment and cancellation; rail fares and return; saved-game restoration; and a winning three-day ending without mandatory optional activities.

The complete existing suite plus these scenarios passes **472 tests, zero failures or skips**. No production core changes were needed for these cases. This verifies game rules; the simplified map integration and its browser acceptance remain in progress.

## Lightweight map data

The offline compiler now produces a simplified city overview and five local districts from the existing BGT extract. The overview is 1,714,916 compressed bytes; districts range from 27,953 to 153,038 compressed bytes. Twenty compiler tests pass. Independent full-source checks found no unsafe cells among 427,277 listed walking/cycling cells; all ten required anchors have safe access and the required local connections.

These are generated data and offline checks. The browser loader has passed independent verification; the map scene and game entry still need integration and real playthrough verification. The existing game entry has not switched maps yet.

## District loading and navigation

The loader now reads the city overview first and one local district at a time. Resources are committed under `tools/prototype/map-data/amsterdam-shape-d29-v1/` (2,099,378 compressed bytes across six resources, plus the manifest). It validates hashes and limits, supports raw gzip and HTTP Content-Encoding, and keeps the previous district on cancellation or failure.

Independent checks passed 184 route cases against the actual five district grids, 44 runtime tests, 16 packaging tests and eight API counterexamples. Real Chrome exercised 20 district loads and ten anchor-route checks per delivery mode, plus cancellation, supersession, retry and disposal. Maximum measured heartbeat gaps were 34.3 ms and 39.9 ms; these local samples are not mobile or peak-memory guarantees.

A source-only encoding normalization replaced three literal control characters in one regular expression with equivalent hexadecimal escapes. All 65,536 UTF-16 code units were checked for identical matching, including DEL; runtime tests were rerun on these final bytes. No navigation or loading logic was rewritten during adoption.

The running game still uses its previous map. Entry, district movement, canvas sharing and full gameplay acceptance remain pending.

## Remaining integration blockers

The first district movement adapter is not merged. Independent checks using the actual district resources confirmed destination commits after loading, walking/cycling transitions, ferry cancellation and remote bicycle preservation. The broader check stopped at legacy-save migration; it is not a complete acceptance pass.

The remaining adapter fixes are a mismatched migration return shape, rejecting invalid travel departures before save-repair normalization, and supporting initialization before the first local district loads. The scoped correction was interrupted by a provider overload before any files changed; the existing verified game remains intact.

The map scene also needs its actual district-to-district links, idle-frame validation cost and narrow-screen label overlap corrected. These findings are separate from test-fixture mistakes. Entry switching and a complete playthrough on the new map remain pending; current mainline/minigame playthrough evidence still belongs to the existing map.
