/*
 * CITY01 / f02-real-city-d27 shared immutable GeoWorld.
 *
 * One reviewed coordinate source shared by the city runtime and the flower
 * network. Pure standard JavaScript, UMD:
 *   globalThis.GeoWorld (browser) / module.exports (CommonJS).
 * No DOM, no dependencies, no network; nothing here is a pathfinder or a
 * collision map — the accepted NAV navigator owns geometry predicates and the
 * independently implemented runtime owns routing (frozen routes interface).
 *
 * Coordinate system: local-equirectangular metres, identical to the accepted
 * GEO v1 dataset / real-pub-sample.json projection (originLon 4.865,
 * originLat 52.405, referenceLat 52.375). The ten anchors below are the exact
 * reviewed game anchors (anchors.json); venue identities, names, prose and
 * costs are the fictional game layer placed on top of real ground surfaces.
 *
 * Coverage note: these constants describe anchor points only. They make no
 * claim of full-map walkability; the complete 145703-feature map is configured
 * at runtime through City.configure(data, { navigator, routes }).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GeoWorld = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Bumped on any reviewed-anchor change; stamped into every new city save.
  const MAP_VERSION = 'amsterdam-d27-real-city-geo-v1';

  // Full-map projection/bbox of the accepted GEO v1 extract (real-pub-sample
  // ships the same projection; its source.complete=false applies to its
  // feature subset, not to these constants).
  const PROJECTION = Object.freeze({
    type: 'local-equirectangular',
    units: 'metres',
    originLon: 4.865,
    originLat: 52.405,
    referenceLat: 52.375,
    radiusMeters: 6371008.8
  });
  const BOUNDS = Object.freeze({ x: 0, y: 0, width: 7127.775, height: 6671.705,
    bbox: Object.freeze([4.865, 52.345, 4.97, 52.405]) });

  const PROVENANCE = Object.freeze({
    provider: 'Kadaster / PDOK BGT',
    license: 'CC0-1.0',
    snapshot: '2026-10-16T00:00:00Z',
    url: 'https://api.pdok.nl/kadaster/bgt/ogc/v1/',
    projection: PROJECTION,
    bounds: BOUNDS,
    note: 'Anchor coordinates are reviewed points on real BGT ground-road or ' +
      'bridge-deck surfaces identified by featureId. Venues, names and stories ' +
      'are fictional; the F3 banks are game boarding anchors near street ends, ' +
      'not surveyed GVB platform coordinates. The complete source manifest SHA ' +
      'and full-feature validation live in parent evidence.'
  });

  function anchor(id, x, y, featureId, basis, fictionalVenue) {
    return Object.freeze({ id, x, y, featureId, basis, fictionalVenue });
  }

  // The ten reviewed anchors (anchors.json), frozen and shared by reference.
  const ANCHORS = Object.freeze({
    pub: anchor('pub', 1100.211, 3243.117,
      'wegdeel:b5910e46-8d27-5ba7-982d-41b311e24e21',
      'Egelantiersgracht, Amsterdam', true),
    market: anchor('market', 1930.884, 5497.996,
      'wegdeel:10c3b1e8-8cab-5e25-aced-07c5e975d08b',
      'Albert Cuypstraat, Amsterdam', true),
    coffee: anchor('coffee', 1890.585, 5451.035,
      'wegdeel:523cd265-0270-5555-a739-b8e1cc451754',
      'Gerard Douplein, Amsterdam', true),
    flowers: anchor('flowers', 1787.339, 5870.28,
      'wegdeel:f643a552-96d1-5d10-8fca-ef33e6298948',
      'Ferdinand Bolstraat, Amsterdam', true),
    lab: anchor('lab', 6158.236, 5450.173,
      'wegdeel:035ca0a8-9093-53f7-9be3-2c9adb5942fb',
      'Science Park, Amsterdam', true),
    lotte: anchor('lotte', 1056.057, 3247.41,
      'overbruggingsdeel:8b1d9302-4306-51af-ae31-9b60532e81c5',
      'Actual BGT bridge deck near fictional pub; not a real named business', true),
    ferrySouth: anchor('ferrySouth', 2336.407, 2714.803,
      'wegdeel:c163c06b-1650-5bb9-979c-321aabee488e',
      'Game boarding anchor near official street end; not surveyed GVB platform coordinates', false),
    ferryNorth: anchor('ferryNorth', 2590.929, 2528.07,
      'wegdeel:62cc967a-355f-5d50-ae7e-1bacb568682b',
      'Game boarding anchor near official street end; not surveyed GVB platform coordinates', false),
    flowerCart: anchor('flowerCart', 1798.234, 5870.4,
      'wegdeel:1bb60ca7-c898-5d95-b717-2cbeb8b099d8',
      'Fictional game interaction near flower venue on actual ground-road surface; no claim of real greenhouse/cart address', true),
    garden: anchor('garden', 1810.35, 5801.567,
      'wegdeel:e507c0ca-c183-5739-98f3-be834a5b3e67',
      'Fictional game interaction near flower venue on actual ground-road surface; no claim of real greenhouse/cart address', true)
  });

  // The seven existing game places. Identity, names, district, kind, icon,
  // prose and action costs are preserved from the rectangular prototype; the
  // coordinates now reference shared real anchors. Noord uses the canonical
  // north F3 bank.
  function place(id, a, name, district, kind, icon, description, quote, cost) {
    return Object.freeze({
      id, name, district, kind, icon, description, quote, cost,
      x: a.x, y: a.y, anchorId: a.id, featureId: a.featureId
    });
  }

  const PLACES = Object.freeze({
    pub: place('pub', ANCHORS.pub, 'Tweede Kans', 'Jordaan', 'pub', '🍺',
      '回到吧台，准备今晚的二次机会。', '酒馆还没倒，只是账单站得更稳。', 0),
    lotte: place('lotte', ANCHORS.lotte, 'Lotte 的桥', '运河带', 'visit', '♫',
      '找 Lotte 约好今晚的黑啤和吉他。', '我带吉他，你带一杯不是曝光量的报酬。', 0),
    coffee: place('coffee', ANCHORS.coffee, 'Bram 咖啡馆', 'De Pijp', 'coffee', '☕',
      '帮 Bram 顶一段午市，工资当天结。', '梦想不能抵时薪，这条街至少还记得。', 0),
    noord: place('noord', ANCHORS.ferryNorth, '北岸码头', 'Noord', 'surf', '⚓',
      '从漂浮物里找还能用的酒花和瓶子。', '河面什么都送来，除了保修单。', 0),
    market: place('market', ANCHORS.market, 'Albert Cuyp 市场', 'De Pijp', 'market', '▥',
      '用 €8 收下一箱收市库存。', '三瓶酒的保质期，比这间店的租约长。', 8),
    flowers: place('flowers', ANCHORS.flowers, '南街花店', 'De Pijp', 'flowers', '⚘',
      '挑几枝郁金香，给今天配一种颜色。', '花会谢，账单不会。至少窗台可以先好看起来。', 0),
    lab: place('lab', ANCHORS.lab, 'Chen 实验室', 'Science Park', 'lab', '⚗',
      '用 €6 换两份实验酒花。', '经费不够发论文，够发酵。', 6)
  });

  // F3 is a saved transit leg between two canonical banks, never walkable
  // water. Canonical anchor ids are the only legal from/to values.
  const F3 = Object.freeze({
    id: 'F3',
    from: 'ferrySouth',
    to: 'ferryNorth',
    south: ANCHORS.ferrySouth,
    north: ANCHORS.ferryNorth,
    speedMps: 32,
    note: 'Fictional game ferry; banks are game anchors on real ground surfaces.'
  });

  // Garden side-door entry and the flower cart interaction point used by the
  // unchanged FlowerNetwork economy.
  const ENTRY = Object.freeze({ id: 'garden', x: ANCHORS.garden.x, y: ANCHORS.garden.y,
    featureId: ANCHORS.garden.featureId });
  const CART = Object.freeze({ id: 'flowerCart', x: ANCHORS.flowerCart.x, y: ANCHORS.flowerCart.y,
    featureId: ANCHORS.flowerCart.featureId });

  return Object.freeze({
    MAP_VERSION, PROJECTION, BOUNDS, PROVENANCE,
    ANCHORS, PLACES, F3, ENTRY, CART
  });
});

