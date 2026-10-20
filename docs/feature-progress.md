# 轻量地图与玩法联调

当前方向是城市总览加可切换的局部街区，优先保留运河、街区和桥梁形态，细节后续逐步增加。原始地理数据用于离线制作，避免浏览器一次加载整份精细地图。

| Feature | 当前状态 |
| --- | --- |
| 城市总览与局部地图 | 离线制作工具开发中，尚未接入游戏 |
| 经营主线 | 现有版本已实测酿酒、第一杯、夜探实际取货、返店与第二天 |
| 花店小游戏 | 现有版本已实测取消、完成、前篮存取与布置窗台 |
| 送货、列车与打捞 | 完整流程联调中 |
| 新地图整合 | 等地图产物验收后接入，并重新验证主线与小游戏 |

现有规则回归为 418 项通过。上述试玩结果属于现有地图，不代表新地图已完成或已发布。

## Main loop and minigame regression coverage

Added 10 combined scenarios using real public game actions: brewing and first service; after-hours pickup and single reward settlement; salvage success, junk and natural finish; flower cancel/store/retrieve/use; delivery and parcel handoff; supply order fulfilment and cancellation; rail fares and return; saved-game restoration; and a winning three-day ending without mandatory optional activities.

The complete existing suite plus these scenarios passes **428 tests, zero failures or skips**. No production core changes were needed for these cases. This verifies game rules; the simplified map integration and its browser acceptance remain in progress.

## Lightweight map data

The offline compiler now produces a simplified city overview and five local districts from the existing BGT extract. The overview is 1,714,916 compressed bytes; districts range from 27,953 to 153,038 compressed bytes. Twenty compiler tests pass. Independent full-source checks found no unsafe cells among 427,277 listed walking/cycling cells; all ten required anchors have safe access and the required local connections.

These are generated data and offline checks. The browser loader and map scene still need integration and real playthrough verification. The existing game entry has not switched maps yet.
