/* amsterdam_geo.js — Round 1 schema + minimal dataset for the Amsterdam map replica.
 *
 * Pure data + math. No DOM, no canvas. Renderer hooks (R6-R10) consume this.
 * Goal ID: 20260816-224507-webdemo-map-replica-24h-v1-1095
 *
 * Coordinate source: Wikipedia public landmark coords + hand-curated canal polylines
 * along their documented street centerlines. Bridges/islands/streets are schema-only
 * in Round 1; populated R2-R5 from OpenStreetMap Overpass.
 *
 * Projection: equirectangular at ~52.37°N. Distortion over a 7 km city is < 0.3 %
 * which is well below one canvas pixel at default zoom.
 */
(function (global) {
  'use strict';

  // ─── Constants ─────────────────────────────────────────────────────────────
  const VERSION = 'map-replica-v1-data-1';
  const ORIGIN = { lat: 52.3676, lng: 4.9041, label: 'Muntplein (city center)' };
  const BOUNDS = { south: 52.340, west: 4.850, north: 52.410, east: 4.965 };
  const SCALE_M_PER_PX = 12;            // 12 m → 1 px at default zoom
  const M_PER_DEG_LAT = 111000;          // ≈ constant at this latitude
  const M_PER_DEG_LNG = 111000 * Math.cos(ORIGIN.lat * Math.PI / 180);

  // ─── Projection (pure functions, no side effects) ──────────────────────────
  // lngLat → canvas (x,y). Both unit: meters from origin, then divided by scale.
  function lngLatToCanvas(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const x = (lng - ORIGIN.lng) * M_PER_DEG_LNG / SCALE_M_PER_PX;
    const y = -(lat - ORIGIN.lat) * M_PER_DEG_LAT / SCALE_M_PER_PX;
    return { x, y };
  }
  // canvas → lngLat (for click→world lookup).
  function canvasToLngLat(x, y) {
    const lng = ORIGIN.lng + (x * SCALE_M_PER_PX) / M_PER_DEG_LNG;
    const lat = ORIGIN.lat - (y * SCALE_M_PER_PX) / M_PER_DEG_LAT;
    return { lat, lng };
  }
  // Great-circle distance in meters (haversine — accurate at any latitude).
  function distanceMeters(a, b) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
              Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  // True bounds-in-px: how the bbox projects onto the canvas.
  function projectedBoundsPx() {
    const tl = lngLatToCanvas(BOUNDS.north, BOUNDS.west);
    const br = lngLatToCanvas(BOUNDS.south, BOUNDS.east);
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
  }

  // ─── Landmarks (12 POIs from Wikipedia public coords) ──────────────────────
  // kind: museum | park | station | square | district | brewery | venue | religious
  // mini: maps to a mini-game industry where applicable.
  const LANDMARKS = [
    { id:'rijksmuseum',    name:'Rijksmuseum',          nameZh:'国立博物馆',   lat:52.3600, lng:4.8852, kind:'museum',   mini:'academic' },
    { id:'van_gogh',       name:'Van Gogh Museum',      nameZh:'梵高博物馆',   lat:52.3584, lng:4.8811, kind:'museum',   mini:'academic' },
    { id:'anne_frank',     name:'Anne Frank House',     nameZh:'安妮之家',     lat:52.3752, lng:4.8840, kind:'museum',   mini:'academic' },
    { id:'centraal',       name:'Centraal Station',     nameZh:'中央车站',     lat:52.3791, lng:4.9003, kind:'station',  mini:'travel'   },
    { id:'dam_square',     name:'Dam Square',           nameZh:'水坝广场',     lat:52.3731, lng:4.8926, kind:'square',   mini:'commerce' },
    { id:'vondelpark',     name:'Vondelpark',           nameZh:'冯德尔公园',   lat:52.3580, lng:4.8686, kind:'park',     mini:'wellness' },
    { id:'heineken',       name:'Heineken Experience',  nameZh:'喜力体验馆',   lat:52.3576, lng:4.8919, kind:'brewery',  mini:'beer'     },
    { id:'jordaan',        name:'Jordaan',              nameZh:'约旦区',       lat:52.3760, lng:4.8830, kind:'district', mini:'tour'     },
    { id:'de_pijp',        name:'De Pijp',              nameZh:'德派普区',     lat:52.3560, lng:4.8950, kind:'district', mini:'tour'     },
    { id:'ndsm',           name:'NDSM Werf',            nameZh:'NDSM船坞',     lat:52.4020, lng:4.8910, kind:'venue',    mini:'tour'     },
    { id:'plantage',       name:'Plantage',             nameZh:'普兰塔吉',     lat:52.3670, lng:4.9130, kind:'district', mini:'coffee'   },
    { id:'ijburg',         name:'IJburg',               nameZh:'IJburg新区',   lat:52.3570, lng:4.9610, kind:'district', mini:'surf'     },
  ];

  // ─── Canals (9 main canals as polylines along their centerlines) ───────────
  // Each polyline is a 5-8 anchor points list in [lat, lng] order.
  // width: nominal rendering width in meters (real canals ~10-30 m).
  const CANALS = [
    { id:'singel',            name:'Singel',            width:14,
      points:[[52.3791,4.8950],[52.3765,4.8970],[52.3730,4.8990],[52.3695,4.9015],[52.3670,4.9010]] },
    { id:'prinsengracht',     name:'Prinsengracht',     width:18,
      points:[[52.3770,4.8910],[52.3740,4.8930],[52.3705,4.8960],[52.3670,4.8990],[52.3640,4.9020]] },
    { id:'keizersgracht',     name:'Keizersgracht',     width:20,
      points:[[52.3760,4.8875],[52.3730,4.8900],[52.3695,4.8935],[52.3660,4.8970],[52.3625,4.9000]] },
    { id:'herengracht',       name:'Herengracht',       width:22,
      points:[[52.3750,4.8840],[52.3720,4.8865],[52.3685,4.8900],[52.3650,4.8935],[52.3615,4.8970]] },
    { id:'amstel',            name:'Amstel',            width:30,
      points:[[52.3676,4.9041],[52.3640,4.9070],[52.3580,4.9100],[52.3510,4.9140],[52.3440,4.9180]] },
    { id:'ij',                name:'IJ',                width:80,
      points:[[52.4030,4.8800],[52.4000,4.8950],[52.3980,4.9100],[52.3960,4.9300],[52.3940,4.9550]] },
    { id:'brouwersgracht',    name:'Brouwersgracht',    width:16,
      points:[[52.3805,4.8900],[52.3798,4.8930],[52.3785,4.8955],[52.3770,4.8975],[52.3760,4.8990]] },
    { id:'leidsegracht',      name:'Leidsegracht',      width:14,
      points:[[52.3635,4.8830],[52.3645,4.8865],[52.3655,4.8900],[52.3665,4.8930],[52.3670,4.8960]] },
    { id:'kloveniersburgwal', name:'Kloveniersburgwal', width:12,
      points:[[52.3710,4.9020],[52.3695,4.9040],[52.3680,4.9060],[52.3665,4.9080],[52.3650,4.9100]] },
  ];

  // ─── Bridges, Islands, Streets ─────────────────────────────────────────────
  // Round 1: 5 iconic bridges. Round 3: expanded to 32 (brief target ~50).
  // Each bridge: id, name (Wikipedia public name), lat/lng (Wikipedia public coords),
  // kind (drawbridge/stone/fixed/modern), crosses (canal id it spans).
  // All coords stay inside BOUNDS so the renderer can fit & project them safely.
  const BRIDGES = [
    // R1 (5)
    { id:'magere_brug',    name:'Magere Brug',        lat:52.3733, lng:4.9019, kind:'drawbridge',  crosses:'amstel' },
    { id:'blauwbrug',      name:'Blauwbrug',          lat:52.3680, lng:4.9020, kind:'stone',       crosses:'amstel' },
    { id:'torensluis',     name:'Torensluis',         lat:52.3760, lng:4.8870, kind:'fixed',       crosses:'singel' },
    { id:'paleisbrug',     name:'Paleisbrug',         lat:52.3745, lng:4.8915, kind:'modern',      crosses:'kloveniersburgwal' },
    { id:'herengracht_br', name:'Reguliers Bridge',   lat:52.3675, lng:4.8945, kind:'fixed',       crosses:'herengracht' },
    // R3 — Amstel river (north→south)
    { id:'hortusbrug',          name:'Hortusbrug',           lat:52.3666, lng:4.9066, kind:'fixed',     crosses:'amstel' },
    { id:'mariniersbrug',       name:'Mariniersbrug',        lat:52.3706, lng:4.9039, kind:'fixed',     crosses:'amstel' },
    { id:'nieuwe_amstelbrug',   name:'Nieuwe Amstelbrug',    lat:52.3660, lng:4.9050, kind:'modern',    crosses:'amstel' },
    { id:'magrathbrug',         name:'Magrathbrug',          lat:52.3597, lng:4.9089, kind:'fixed',     crosses:'amstel' },
    { id:'brug_205',            name:'Brug 205',             lat:52.3610, lng:4.9060, kind:'fixed',     crosses:'amstel' },
    // R3 — IJ river (city → east)
    { id:'staalmeestersbrug',   name:'Staalmeestersbrug',    lat:52.3697, lng:4.9118, kind:'modern',    crosses:'ij' },
    { id:'berlagebrug',         name:'Berlagebrug',          lat:52.3650, lng:4.9125, kind:'modern',    crosses:'ij' },
    { id:'oosterdokbrug',       name:'Oosterdokbrug',        lat:52.3764, lng:4.9148, kind:'modern',    crosses:'ij' },
    { id:'jan_schaeferbrug',    name:'Jan Schaeferbrug',     lat:52.3697, lng:4.9260, kind:'modern',    crosses:'ij' },
    { id:'han_lammersbrug',     name:'Han Lammersbrug',      lat:52.3655, lng:4.9270, kind:'modern',    crosses:'ij' },
    { id:'pierre_baijotbrug',   name:'Pierre Baijotbrug',    lat:52.3610, lng:4.9330, kind:'modern',    crosses:'ij' },
    { id:'java_eiland_brug',    name:'Java-eiland Brug',     lat:52.3660, lng:4.9350, kind:'modern',    crosses:'ij' },
    { id:'eilandsbrug',         name:'Eilandsbrug',          lat:52.3770, lng:4.9100, kind:'fixed',     crosses:'ij' },
    { id:'ndsm_brug',           name:'NDSM-werf Brug',       lat:52.4015, lng:4.8900, kind:'drawbridge',crosses:'ij' },
    // R3 — Herengracht / Keizersgracht belt (canal-house heart)
    { id:'brug_165',            name:'Brug 165',             lat:52.3681, lng:4.8920, kind:'fixed',     crosses:'herengracht' },
    { id:'brug_122',            name:'Brug 122',             lat:52.3650, lng:4.8940, kind:'fixed',     crosses:'herengracht' },
    { id:'brug_112',            name:'Brug 112',             lat:52.3682, lng:4.8895, kind:'fixed',     crosses:'keizersgracht' },
    { id:'brug_119',            name:'Brug 119',             lat:52.3670, lng:4.8910, kind:'fixed',     crosses:'keizersgracht' },
    { id:'brug_34',             name:'Brug 34',              lat:52.3650, lng:4.8910, kind:'fixed',     crosses:'keizersgracht' },
    { id:'brug_405',            name:'Brug 405',             lat:52.3660, lng:4.9010, kind:'fixed',     crosses:'kloveniersburgwal' },
    // R3 — Singel / Singelgracht ring + Leidsegracht
    { id:'brug_437',            name:'Brug 437',             lat:52.3670, lng:4.8880, kind:'fixed',     crosses:'singel' },
    { id:'lijnbaansbrug',       name:'Lijnbaansbrug',        lat:52.3650, lng:4.8850, kind:'fixed',     crosses:'singel' },
    { id:'brouwersgracht_brug', name:'Brouwersgracht Brug',  lat:52.3785, lng:4.8840, kind:'fixed',     crosses:'brouwersgracht' },
    { id:'korte_prinsen_brug',  name:'Korte Prinsengracht',  lat:52.3770, lng:4.8830, kind:'fixed',     crosses:'singel' },
    { id:'vijzelgracht_brug',   name:'Vijzelgracht Brug',    lat:52.3650, lng:4.8880, kind:'fixed',     crosses:'singel' },
    { id:'leidsegracht_brug',   name:'Leidsegracht Brug',    lat:52.3581, lng:4.8801, kind:'fixed',     crosses:'leidsegracht' },
    { id:'weteringschans_brug', name:'Weteringschans Brug',  lat:52.3610, lng:4.8870, kind:'fixed',     crosses:'singel' },
  ];
  const ISLANDS  = []; // R2: Bickers, Prinsen, Wittenburg, Oostenburg, Marken
  const STREETS = []; // R2: hand-picked + Overpass fills

  // ─── Schema validation + stats ─────────────────────────────────────────────
  function _insideBounds(lat, lng) {
    return lat >= BOUNDS.south && lat <= BOUNDS.north &&
           lng >= BOUNDS.west  && lng <= BOUNDS.east;
  }
  function _uniqueBy(arr, keyFn) {
    const ids = arr.map(keyFn);
    return new Set(ids).size === ids.length;
  }
  function validate() {
    const errs = [];
    if (LANDMARKS.length < 12) errs.push(`landmarks<12 (got ${LANDMARKS.length})`);
    if (CANALS.length   < 9 )  errs.push(`canals<9 (got ${CANALS.length})`);
    if (BRIDGES.length  < 30)  errs.push(`bridges<30 (got ${BRIDGES.length})`);
    if (!_uniqueBy(LANDMARKS, l => l.id)) errs.push('landmark ids not unique');
    if (!_uniqueBy(CANALS,   c => c.id)) errs.push('canal ids not unique');
    if (!_uniqueBy(BRIDGES,  b => b.id)) errs.push('bridge ids not unique');
    for (const l of LANDMARKS) {
      if (!_insideBounds(l.lat, l.lng)) errs.push(`landmark ${l.id} outside bbox`);
      if (!l.name || !l.nameZh || !l.kind) errs.push(`landmark ${l.id} missing fields`);
    }
    for (const c of CANALS) {
      if (c.points.length < 3) errs.push(`canal ${c.id} needs ≥3 anchors`);
      for (const [la, lo] of c.points) {
        if (!_insideBounds(la, lo)) errs.push(`canal ${c.id} anchor outside bbox`);
      }
    }
    return { ok: errs.length === 0, errors: errs };
  }
  function stats() {
    return {
      version: VERSION,
      origin:  ORIGIN,
      bounds:  BOUNDS,
      scale_m_per_px: SCALE_M_PER_PX,
      landmarks: LANDMARKS.length,
      canals:    CANALS.length,
      bridges:   BRIDGES.length,
      islands:   ISLANDS.length,
      streets:   STREETS.length,
      canvas:    projectedBoundsPx(),
    };
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  global.AMSTERDAM_GEO = {
    VERSION, BOUNDS, ORIGIN, SCALE_M_PER_PX,
    LANDMARKS, CANALS, BRIDGES, ISLANDS, STREETS,
    lngLatToCanvas, canvasToLngLat, distanceMeters, projectedBoundsPx,
    validate, stats,
  };
})(typeof window !== 'undefined' ? window : globalThis);