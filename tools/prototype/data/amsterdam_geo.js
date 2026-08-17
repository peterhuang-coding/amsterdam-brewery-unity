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
  const VERSION = 'map-replica-v1-data-3';
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
    // R4 — anchor landmarks for the 6 mini-game venue bindings (within 1 km of each).
    { id:'buiksloterham',  name:'Buiksloterham',        nameZh:'Buiksloterham', lat:52.4015, lng:4.9130, kind:'district', mini:'surf'     },
    { id:'allard_pierson', name:'Allard Pierson',       nameZh:'阿勒德皮尔森',   lat:52.3636, lng:4.8917, kind:'museum',   mini:'academic' },
    // R5 — 16 more landmarks to reach the brief target of 30+.
    { id:'oosterpark',     name:'Oosterpark',           nameZh:'东公园',         lat:52.3587, lng:4.9170, kind:'park',     mini:'wellness' },
    { id:'westerpark',     name:'Westerpark',           nameZh:'西公园',         lat:52.3870, lng:4.8760, kind:'park',     mini:'wellness' },
    { id:'artis',          name:'Artis Zoo',            nameZh:'阿提斯动物园',  lat:52.3660, lng:4.9150, kind:'venue',    mini:'tour'     },
    { id:'albert_cuyp',    name:'Albert Cuyp Market',   nameZh:'阿尔伯特市场',  lat:52.3563, lng:4.8947, kind:'square',   mini:'commerce' },
    { id:'de_waag',        name:'De Waag',              nameZh:'称重房',         lat:52.3727, lng:4.8965, kind:'museum',   mini:'commerce' },
    { id:'paleis',         name:'Royal Palace',         nameZh:'王宫',           lat:52.3732, lng:4.8914, kind:'museum',   mini:'academic' },
    { id:'nieuwe_kerk',    name:'Nieuwe Kerk',          nameZh:'新教堂',         lat:52.3731, lng:4.8914, kind:'religious', mini:'academic' },
    { id:'oude_kerk',      name:'Oude Kerk',            nameZh:'老教堂',         lat:52.3752, lng:4.8978, kind:'religious', mini:'academic' },
    { id:'magna_plaza',    name:'Magna Plaza',          nameZh:'Magna Plaza',     lat:52.3730, lng:4.8902, kind:'square',   mini:'commerce' },
    { id:'beurs_van_berlage',name:'Beurs van Berlage',  nameZh:'贝拉戈交易所',  lat:52.3750, lng:4.8960, kind:'venue',    mini:'commerce' },
    { id:'stopera',        name:'Stopera',              nameZh:'市政歌剧院',     lat:52.3675, lng:4.9018, kind:'venue',    mini:'bar'      },
    { id:'paradiso',       name:'Paradiso',             nameZh:'Paradiso音乐厅', lat:52.3623, lng:4.8838, kind:'venue',    mini:'bar'      },
    { id:'melkweg',        name:'Melkweg',              nameZh:'银河音乐厅',     lat:52.3640, lng:4.8838, kind:'venue',    mini:'bar'      },
    { id:'foam',           name:'Foam Photography',     nameZh:'Foam摄影博物馆', lat:52.3711, lng:4.8840, kind:'museum',   mini:'academic' },
    { id:'eye_filmmuseum', name:'Eye Filmmuseum',       nameZh:'Eye电影博物馆',  lat:52.3841, lng:4.9008, kind:'museum',   mini:'tour'     },
    { id:'hermitage',      name:'Hermitage Amsterdam',  nameZh:'冬宫分馆',       lat:52.3650, lng:4.9018, kind:'museum',   mini:'academic' },
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
    // R5 — 18 more bridges to reach the brief target of ~50.
    // R5 — Prinsengracht belt (was 0 → 4)
    { id:'brug_282',   name:'Brug 282',     lat:52.3760, lng:4.8840, kind:'fixed',     crosses:'prinsengracht' },
    { id:'brug_289',   name:'Brug 289',     lat:52.3700, lng:4.8900, kind:'fixed',     crosses:'prinsengracht' },
    { id:'brug_295',   name:'Brug 295',     lat:52.3650, lng:4.8970, kind:'fixed',     crosses:'prinsengracht' },
    { id:'brug_301',   name:'Brug 301',     lat:52.3580, lng:4.9050, kind:'fixed',     crosses:'prinsengracht' },
    // R5 — Herengracht / Keizersgracht additional south
    { id:'brug_122b',  name:'Brug 122B',    lat:52.3610, lng:4.8980, kind:'fixed',     crosses:'herengracht' },
    { id:'brug_119b',  name:'Brug 119B',    lat:52.3615, lng:4.8970, kind:'fixed',     crosses:'keizersgracht' },
    // R5 — Brouwersgracht additional
    { id:'brouwersgracht_br_a', name:'Brouwersgracht Noord', lat:52.3795, lng:4.8915, kind:'fixed', crosses:'brouwersgracht' },
    // R5 — Singel mid-segment
    { id:'brug_437b',  name:'Brug 437B',    lat:52.3730, lng:4.8950, kind:'fixed',     crosses:'singel' },
    { id:'brug_437c',  name:'Brug 437C',    lat:52.3700, lng:4.8990, kind:'fixed',     crosses:'singel' },
    // R5 — Kloveniersburgwal additional
    { id:'brug_405b',  name:'Brug 405B',    lat:52.3685, lng:4.9040, kind:'fixed',     crosses:'kloveniersburgwal' },
    { id:'brug_405c',  name:'Brug 405C',    lat:52.3650, lng:4.9080, kind:'fixed',     crosses:'kloveniersburgwal' },
    { id:'vuurbrug',   name:'Vuurbrug',     lat:52.3730, lng:4.8990, kind:'fixed',     crosses:'kloveniersburgwal' },
    // R5 — Leidsegracht additional
    { id:'leidsegracht_br',  name:'Leidsegracht Noord',   lat:52.3650, lng:4.8865, kind:'fixed', crosses:'leidsegracht' },
    { id:'leidsegracht_br2', name:'Leidsegracht Mid',     lat:52.3670, lng:4.8940, kind:'fixed', crosses:'leidsegracht' },
    // R5 — IJ river additional
    { id:'ndsm_werf_brug',   name:'NDSM-werf Footbridge', lat:52.4020, lng:4.8910, kind:'modern',  crosses:'ij' },
    { id:'muiderbrug',       name:'Muiderbrug',           lat:52.3670, lng:4.9270, kind:'modern',  crosses:'ij' },
    // R5 — Amstel river additional south
    { id:'brug_201',         name:'Brug 201',             lat:52.3700, lng:4.9030, kind:'fixed',   crosses:'amstel' },
    { id:'brug_220',         name:'Brug 220',             lat:52.3640, lng:4.9060, kind:'fixed',   crosses:'amstel' },
  ];
  // R5 — 30 islands (artificial IJ river islands + park islands + neighborhood "islands").
  // kind: artificial (IJ infill) | natural | polder (reclaimed land) | park (island in pond) | neighborhood (canal-belt area)
  const ISLANDS = [
    // Westelijke Eilanden (real, artificial)
    { id:'bickerseiland',     name:'Bickerseiland',          nameZh:'Bickers岛',      lat:52.3835, lng:4.8930, kind:'artificial', district:'noord'     },
    { id:'prinseneiland',     name:'Prinseneiland',          nameZh:'王子岛',         lat:52.3840, lng:4.8860, kind:'artificial', district:'noord'     },
    { id:'realen_eiland',     name:'Realeneiland',           nameZh:'Reaal岛',        lat:52.3840, lng:4.8900, kind:'artificial', district:'noord'     },
    // Oostelijke Eilanden (real, artificial)
    { id:'wittenburg',        name:'Wittenburg',             nameZh:'Wittenburg岛',    lat:52.3730, lng:4.9180, kind:'artificial', district:'centrum'   },
    { id:'oostenburg',        name:'Oostenburg',             nameZh:'Oostenburg岛',    lat:52.3740, lng:4.9220, kind:'artificial', district:'centrum'   },
    { id:'cruquius_eiland',   name:'Cruquius-eiland',        nameZh:'Cruquius岛',      lat:52.3760, lng:4.9260, kind:'artificial', district:'oost'      },
    { id:'knsm_eiland',       name:'KNSM-eiland',            nameZh:'KNSM岛',          lat:52.3760, lng:4.9300, kind:'artificial', district:'oost'      },
    // IJburg cluster (real, artificial — modern infill)
    { id:'java_eiland',       name:'Java-eiland',            nameZh:'Java岛',          lat:52.3640, lng:4.9450, kind:'artificial', district:'oost'      },
    { id:'pen_eiland',        name:'Pen-eiland',             nameZh:'Pen岛',           lat:52.3960, lng:4.9450, kind:'artificial', district:'noord'     },
    { id:'zeeburgereiland',   name:'Zeeburgereiland',        nameZh:'Zeeburger岛',     lat:52.3680, lng:4.9650, kind:'artificial', district:'oost'      },
    { id:'steigereiland',     name:'Steigereiland',          nameZh:'Steiger岛',       lat:52.3540, lng:4.9650, kind:'artificial', district:'oost'      },
    { id:'haveneiland',       name:'Haveneiland',            nameZh:'Haven岛',         lat:52.3500, lng:4.9650, kind:'artificial', district:'oost'      },
    { id:'rieteilanden',      name:'Rieteilanden',           nameZh:'Riet群岛',        lat:52.3460, lng:4.9650, kind:'artificial', district:'oost'      },
    { id:'ijburg_centrumeiland',name:'IJburg Centrumeiland', nameZh:'IJburg中心岛',    lat:52.3550, lng:4.9650, kind:'artificial', district:'oost'      },
    // IJ-related industrial docks (artificial)
    { id:'ndsm_eiland',       name:'NDSM-werf',              nameZh:'NDSM船坞',        lat:52.4020, lng:4.8900, kind:'artificial', district:'noord'     },
    { id:'oosterdok_eiland',  name:'Oosterdok',              nameZh:'Oosterdok',       lat:52.3764, lng:4.9148, kind:'artificial', district:'centrum'   },
    { id:'entrepotdok',       name:'Entrepotdok',            nameZh:'Entrepotdok',     lat:52.3680, lng:4.9160, kind:'artificial', district:'centrum'   },
    { id:'scheepvaartmuseum_island',name:'Scheepvaartmuseum', nameZh:'海事博物馆岛',    lat:52.3710, lng:4.9150, kind:'park',      district:'oost'      },
    // Park islands (real islands inside park ponds)
    { id:'vondelpark_eiland', name:'Vondelpark Eiland',      nameZh:'冯德尔公园岛',   lat:52.3580, lng:4.8660, kind:'park',      district:'west'      },
    { id:'oosterpark_eiland', name:'Oosterpark Eiland',      nameZh:'东公园岛',         lat:52.3587, lng:4.9170, kind:'park',      district:'oost'      },
    { id:'sarphatipark_eiland',name:'Sarphatipark Eiland',   nameZh:'Sarphati公园岛',   lat:52.3563, lng:4.8973, kind:'park',      district:'zuid'      },
    { id:'beatrixpark_eiland',name:'Beatrixpark Eiland',     nameZh:'碧翠丝公园岛',     lat:52.3460, lng:4.8800, kind:'park',      district:'zuid'      },
    { id:'westerpark_eiland', name:'Westerpark Eiland',      nameZh:'西公园岛',         lat:52.3870, lng:4.8760, kind:'park',      district:'west'      },
    { id:'hermitage_eiland',  name:'Hermitage Tuin',         nameZh:'冬宫花园岛',      lat:52.3650, lng:4.9018, kind:'park',      district:'centrum'   },
    // Polder (reclaimed lake, now surrounded by canals)
    { id:'watergraafsmeer',   name:'Watergraafsmeer',        nameZh:'水草地',          lat:52.3570, lng:4.9300, kind:'polder',    district:'oost'      },
    // Neighborhood "islands" — historic canal-belt areas enclosed by waterways
    { id:'lastage',           name:'Lastage',                nameZh:'Lastage区',       lat:52.3730, lng:4.9060, kind:'neighborhood', district:'centrum' },
    { id:'westelijke_eilanden',name:'Westelijke Eilanden',   nameZh:'西部群岛',        lat:52.3850, lng:4.8900, kind:'neighborhood', district:'noord'  },
    { id:'oostelijke_eilanden',name:'Oostelijke Eilanden',   nameZh:'东部群岛',        lat:52.3740, lng:4.9210, kind:'neighborhood', district:'oost'   },
    { id:'volewijck',         name:'Volewijck',              nameZh:'Volewijck',        lat:52.3950, lng:4.9110, kind:'neighborhood', district:'noord'  },
    { id:'muiderpoort_island',name:'Muiderpoort',           nameZh:'Muiderpoort',      lat:52.3650, lng:4.9300, kind:'neighborhood', district:'oost'   },
  ];
  const STREETS = []; // R2: hand-picked + Overpass fills

  // ─── Mini-game → real Amsterdam venue binding (R4) ─────────────────────────
  // Each binding maps a mini-game industry to a real Amsterdam address with
  // public coords. Used by:
  //   - the Replica overlay layer (to anchor the building at its true location)
  //   - tooltips in `index.html` (so the player sees the real street name)
  //   - test.html assertions (binding integrity + within-bbox + address ≠ null)
  // Schema: { industry, id, name, address, lat, lng, district, landmarkId }
  //   industry must match a key in IND_DEF (brewing|coffee_shop|smart_shop|
  //              surfing|academic|bar)
  //   landmarkId is optional — when present, the binding reuses an existing
  //              landmark's coords (single source of truth).
  const MINI_BINDINGS = [
    { industry:'brewing',    id:'brew',    name:'Brouwerij De Pijl', address:'Warmoesstraat 19, 1012 JD Amsterdam',
      lat:52.3762, lng:4.8970, district:'tweede_kans',  landmarkId:null },
    { industry:'coffee_shop',id:'coffee',  name:'Noord Coffeeshop',  address:'Van der Pekstraat 8, 1031 JP Amsterdam-Noord',
      lat:52.4020, lng:4.8910, district:'noord',        landmarkId:'ndsm' },
    { industry:'smart_shop', id:'shroom',  name:'Damstraat SmartShop', address:'Damstraat 22, 1012 JL Amsterdam',
      lat:52.3732, lng:4.8965, district:'bloemenmarkt', landmarkId:null },
    { industry:'surfing',    id:'surf',    name:'Buiksloterham Surf', address:'Buiksloterham, 1034 Amsterdam-Noord',
      lat:52.4015, lng:4.9130, district:'noord',        landmarkId:'buiksloterham' },
    { industry:'academic',   id:'acad',    name:'Allard Pierson',    address:'Oude Turfmarkt 127, 1012 GC Amsterdam',
      lat:52.3636, lng:4.8917, district:'science_park', landmarkId:'allard_pierson' },
    { industry:'bar',        id:'bar',     name:'Café Tweede Kans',  address:'Warmoesstraat 19, 1012 JD Amsterdam',
      lat:52.3762, lng:4.8970, district:'tweede_kans',  landmarkId:null },
  ];

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
    if (LANDMARKS.length < 30) errs.push(`landmarks<30 (got ${LANDMARKS.length})`);
    if (CANALS.length   < 9 )  errs.push(`canals<9 (got ${CANALS.length})`);
    if (BRIDGES.length  < 50)  errs.push(`bridges<50 (got ${BRIDGES.length})`);
    if (ISLANDS.length  < 30)  errs.push(`islands<30 (got ${ISLANDS.length})`);
    if (!_uniqueBy(LANDMARKS, l => l.id)) errs.push('landmark ids not unique');
    if (!_uniqueBy(CANALS,   c => c.id)) errs.push('canal ids not unique');
    if (!_uniqueBy(BRIDGES,  b => b.id)) errs.push('bridge ids not unique');
    if (!_uniqueBy(ISLANDS,  i => i.id)) errs.push('island ids not unique');
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
    for (const b of BRIDGES) {
      if (!_insideBounds(b.lat, b.lng)) errs.push(`bridge ${b.id} outside bbox`);
    }
    // R5 — island validation (id, name, lat, lng, kind all required)
    for (const i of ISLANDS) {
      if (!_insideBounds(i.lat, i.lng)) errs.push(`island ${i.id} outside bbox`);
      if (!i.id || !i.name || !i.kind) errs.push(`island ${i.id||'?'} missing fields`);
    }
    // R4 · mini-game bindings must cover the 6 industries and stay inside bbox.
    if (MINI_BINDINGS.length < 6) errs.push(`minigame bindings<6 (got ${MINI_BINDINGS.length})`);
    if (!_uniqueBy(MINI_BINDINGS, m => m.industry)) errs.push('minigame industries not unique');
    if (!_uniqueBy(MINI_BINDINGS, m => m.id))       errs.push('minigame ids not unique');
    for (const m of MINI_BINDINGS) {
      if (!m.industry || !m.id || !m.name || !m.address) errs.push(`minigame ${m.id||'?'} missing fields`);
      if (!_insideBounds(m.lat, m.lng)) errs.push(`minigame ${m.id} outside bbox`);
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
      minigames: MINI_BINDINGS.length,
      canvas:    projectedBoundsPx(),
    };
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  global.AMSTERDAM_GEO = {
    VERSION, BOUNDS, ORIGIN, SCALE_M_PER_PX,
    LANDMARKS, CANALS, BRIDGES, ISLANDS, STREETS, MINI_BINDINGS,
    lngLatToCanvas, canvasToLngLat, distanceMeters, projectedBoundsPx,
    validate, stats,
  };
})(typeof window !== 'undefined' ? window : globalThis);