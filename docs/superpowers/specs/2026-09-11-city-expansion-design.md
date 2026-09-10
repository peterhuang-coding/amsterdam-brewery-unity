# Amsterdam daytime city expansion

User request: expand the main map, continuing the approved Dave-like daytime outings / nighttime pub loop and dark comedy. Implement directly in the existing three-day worktree, keeping the old experiment available.

## Play

During preparation the main scene is now a walkable city, with six useful destinations: Tweede Kans in Jordaan (brew/open), Lotte's bridge (promise), Bram's De Pijp café (paid work), Noord dock (salvage), Albert Cuyp market (stock), Science Park lab (hops). WASD/arrows move, clicking the map or destination buttons routes around water/buildings, E enters a nearby destination. A ferry corridor crosses the IJ. Travel itself costs no action; undertaking a destination's activity costs one of the existing two daily actions. The pub can always be reached with a clear return button, including after actions are exhausted.

Market offers a known €8 closing-time crate (2 blond + 1 stout, quality1). Lab offers two experimental hops for €6. Both are once/day, visibly show their cost, and use the same immutable game rules as existing preparation. They trade cheaper emergency stock / guaranteed ingredients against higher-yield brewing and skilled salvage. No extra game days or unrelated currencies.

On arrival the destination's action panel opens; it has a return-to-map button. Selecting a destination while traveling updates the route. Walking into water or buildings is blocked. Pausing, hidden pages and overlays stop travel; refresh keeps the last valid position and discoveries, clearing partial routes. Advancing a day places the player outside the pub. Existing saves without city metadata start there normally; core save version remains compatible.

## Presentation

A larger 1800×1120 fictionalized Amsterdam map, canals, bridges, tree-lined quays, market stalls, academic buildings, ferry and district labels. Keep canal blue #173c49, bottle green #345c49, warm stone #b8ad89, old paper #ece0bf, copper #ce8e4c. The signature is an actual moving player and dotted route through the canal city. The same Canvas serves the pub at night and salvage scene. A map/place switch and six labeled destination buttons provide full pointer/keyboard access. Mobile map supports tapping destinations and retains the action panel without horizontal scrolling.

## Boundaries and checks

`reopening-city.js` holds pure geometry, routing, movement and city metadata validation, independent of core economics. UI owns the persisted city snapshot `{x,y,visited}` and ephemeral route/selection. Core adds only market/lab preparation actions; schema includes these in prepared flags. Scene draws geography from the same collision data used by movement.

Verify all destination pairs route across legal land/bridges/ferry without clipping obstacles; movement speed/diagonals bounded; blocked clicks recover; corrupt city saves fallback independently of valid run saves. Rule tests check cost, once/day, no side effects on rejection, inventory/hop limits, old saves and three-day play. Browser check map traversal, ferry, destination interaction, return/open, pause/reload and narrow layout. Review spec, then quality; commit only after checks.
