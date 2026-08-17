/* map_renderer.js — Round 3 (perf) + Round 6 (mini-game + island pins) —
 * Amsterdam map replica renderer.
 *
 * Consumes AMSTERDAM_GEO (data layer) and draws it onto an arbitrary canvas.
 * No DOM, no globals besides the export. Pure projection + draw functions so
 * test.html can call them directly.
 *
 * Pipeline: viewportFit → projectLandmark/projectCanalPath/projectBridge/
 *                            projectMiniGame/projectIsland →
 *           renderReplicaOverlay (composes all layers).
 *
 * Layer order matches the brief:
 *   1. water (canals as polylines) — baked once into a static offscreen canvas
 *   2. bridges (white bars) — culled by viewport rect, LOD'd by scale
 *   3. landmark pins (circle + icon + label)
 *   4. mini-game markers (diamond + industry icon + venue name)
 *   5. island pins (small filled circle + name) — only at high zoom
 *   6. scale bar (1 km reference, bottom-left)
 *   7. legend (corner)
 *
 * Round 3 additions (perf):
 *   - viewportRect / inViewport — bounding-box culling for bridges
 *   - getStaticLayer — offscreen canvas cache for the (static) canal layer
 *   - bridgeLOD — at low zoom show only famous bridges (named ones)
 *   - fpsTick / fpsNow / frameMs / fpsReset — sliding-window FPS meter
 *
 * Round 8 additions (polish — label declutter + mini-map):
 *   - LM_PRIORITY + planLandmarkLabels — pure-data declutter pass: sorts
 *     landmarks by priority (museum/station/square > religious > district >
 *     park > brewery > venue), greedily stacks overlapping labels down up to
 *     MAX_STACK_PX, falls back to a dashed leader-line + abbrev; any further
 *     collision hides the label entirely (clipped to canvas). Deterministic;
 *     tests verify zero overlaps in the output.
 *   - drawLandmarks now consumes the plan and never paints two overlapping
 *     text boxes. Pins still draw — only their labels move/shrink/hide.
 *   - drawMiniMap — 90×90 overview panel in bottom-right. Plots every
 *     landmark as a 1.5-px colored dot scaled to the geo extent, so labels
 *     that get hidden in the main view are still findable here.
 *   - getReplSceneStats now reports `labels: { total, shown, hidden,
 *     leaderLines }` so tests + console can assert declutter actually fired.
 *
 * Round 6 additions (brief §2 验收 #2 — 6 mini-game 真实地址 binding):
 *   - MINI_ICON / MINI_COLOR per industry (brewing/coffee_shop/smart_shop/
 *     surfing/academic/bar) — distinct color per venue
 *   - projectMiniGame + drawMiniGames — diamond marker with industry icon,
 *     under landmark pins but above bridges
 *   - projectIsland + drawIslands — small filled circle + name; LOD'd to
 *     only show when scale >= 0.7 so the dense center isn't cluttered
 *   - drawScaleBar — 1 km reference bar at bottom-left using the geo
 *     SCALE_M_PER_PX so it stays accurate across viewport sizes
 *
 * Goal ID: 20260816-224507-webdemo-map-replica-24h-v1-1095
 */
(function (global) {
  'use strict';

  const VERSION = 'map-replica-v1-render-2';

  // ─── Visual mapping ────────────────────────────────────────────────────────
  // kind → emoji + fill colour. Mini-Metro aesthetic: bright pastel pins.
  const KIND_ICON = {
    museum:    '🏛',
    station:   '🚉',
    park:      '🌳',
    square:    '◆',
    district:  '▣',
    brewery:   '🍺',
    venue:     '🎪',
    religious: '⛪',
  };
  const KIND_COLOR = {
    museum:    '#c8a060',
    station:   '#6090b8',
    park:      '#7aa848',
    square:    '#e8d090',
    district:  '#a08868',
    brewery:   '#c87030',
    venue:     '#a058a0',
    religious: '#8a6840',
  };
  // ─── Round 6 — Mini-game venues ────────────────────────────────────────────
  // Each industry gets a distinct diamond colour so 6 venues never collide with
  // landmark pins. Icon pairs with the existing industry emoji in game.js so
  // the player recognises the same building type in the modal.
  const MINI_ICON = {
    brewing:     '🍺',
    coffee_shop: '☕',
    smart_shop:  '🍄',
    surfing:     '🏄',
    academic:    '📚',
    bar:         '🍻',
  };
  const MINI_COLOR = {
    brewing:     '#e85050',   // warm red
    coffee_shop: '#a87040',   // coffee brown
    smart_shop:  '#50a050',   // psilocybin green
    surfing:     '#3090c0',   // wave blue
    academic:    '#8060b0',   // learned purple
    bar:         '#e0a020',   // beer amber
  };
  // ─── Round 6 — Islands ─────────────────────────────────────────────────────
  // kind → (fill, edge, alpha). Islands use a small filled circle (radius 3)
  // and italic labels — they sit under landmark pins.
  const ISLAND_COLOR = {
    artificial:   { fill: '#7aa848', edge: '#3a5a20', alpha: 0.55 },
    park:         { fill: '#4a9858', edge: '#2a5028', alpha: 0.50 },
    polder:       { fill: '#a8b890', edge: '#586048', alpha: 0.45 },
    neighborhood: { fill: '#a08868', edge: '#604030', alpha: 0.40 },
    natural:      { fill: '#6aa890', edge: '#3a6850', alpha: 0.50 },
  };
  // Canal rendering. Real canals are blue; IJ river is wider & slightly different hue.
  function canalColor(c) {
    if (c.id === 'ij') return { fill: '#4a86b4', edge: '#3a6890', label: '#2a5070' };
    if (c.width >= 25) return { fill: '#4a86b4', edge: '#3a6890', label: '#2a5070' };
    return { fill: '#5a90c0', edge: '#3a6890', label: '#2a5070' };
  }

  // ─── Viewport fit ──────────────────────────────────────────────────────────
  // Returns { scale, ox, oy, w, h } so that the geo BOUNDS fits inside
  // (W,H) with `pad` px of margin on each side. scale > 1 → bigger; < 1 → smaller.
  function viewportFit(geo, W, H, pad) {
    pad = pad == null ? 24 : pad;
    if (!geo || !geo.projectedBoundsPx) return null;
    const pb = geo.projectedBoundsPx();      // geo-canvas (raw, before fit)
    const availW = Math.max(1, W - 2 * pad);
    const availH = Math.max(1, H - 2 * pad);
    const scale = Math.min(availW / Math.max(1, pb.w), availH / Math.max(1, pb.h));
    const drawnW = pb.w * scale;
    const drawnH = pb.h * scale;
    const ox = (W - drawnW) / 2 - pb.x * scale;
    const oy = (H - drawnH) / 2 - pb.y * scale;
    return { scale, ox, oy, w: drawnW, h: drawnH };
  }

  // Project a raw geo point to a viewport point.
  function projectPoint(geo, lat, lng, vp) {
    const p = geo.lngLatToCanvas(lat, lng);
    if (!p) return null;
    return { x: vp.ox + p.x * vp.scale, y: vp.oy + p.y * vp.scale };
  }

  // ─── Projecters (one per feature type) ─────────────────────────────────────
  function projectLandmark(geo, lm, vp) {
    const p = projectPoint(geo, lm.lat, lm.lng, vp);
    if (!p) return null;
    return {
      id: lm.id, name: lm.name, nameZh: lm.nameZh,
      kind: lm.kind, mini: lm.mini,
      x: p.x, y: p.y,
      icon: KIND_ICON[lm.kind] || '📍',
      color: KIND_COLOR[lm.kind] || '#888',
    };
  }
  function projectCanalPath(geo, c, vp) {
    const pts = [];
    for (const [la, lo] of c.points) {
      const p = projectPoint(geo, la, lo, vp);
      if (p) pts.push(p);
    }
    return {
      id: c.id, name: c.name,
      points: pts,
      // width in geo-canvas px; multiply by vp.scale to get on-screen px.
      // Clamp to [1, 8] so even narrow canals stay visible & wide rivers don't dominate.
      widthPx: Math.max(1, Math.min(8, (c.width / geo.SCALE_M_PER_PX) * vp.scale)),
      color: canalColor(c),
    };
  }
  function projectBridge(geo, b, vp) {
    const p = projectPoint(geo, b.lat, b.lng, vp);
    if (!p) return null;
    return { id: b.id, name: b.name, kind: b.kind, crosses: b.crosses, x: p.x, y: p.y };
  }

  // ─── R6 · Mini-game projecter ──────────────────────────────────────────────
  // Industry → distinct diamond marker. Falls back to landmarkId for the
  // hover/click hit test so the existing pick path still works.
  function projectMiniGame(geo, m, vp) {
    const p = projectPoint(geo, m.lat, m.lng, vp);
    if (!p) return null;
    return {
      id: m.id, industry: m.industry, name: m.name, address: m.address,
      landmarkId: m.landmarkId, district: m.district,
      x: p.x, y: p.y,
      icon: MINI_ICON[m.industry] || '◆',
      color: MINI_COLOR[m.industry] || '#888',
    };
  }
  // ─── R6 · Island projecter ─────────────────────────────────────────────────
  function projectIsland(geo, i, vp) {
    const p = projectPoint(geo, i.lat, i.lng, vp);
    if (!p) return null;
    const c = ISLAND_COLOR[i.kind] || ISLAND_COLOR.neighborhood;
    return {
      id: i.id, name: i.name, nameZh: i.nameZh, kind: i.kind,
      x: p.x, y: p.y,
      color: c.fill, edge: c.edge, alpha: c.alpha,
    };
  }

  // ─── R8 · Label declutter ──────────────────────────────────────────────────
  // Brief §验收 #1 — "真实 Amsterdam 地图渲染(运河、桥、街、地标)" demands that
  // every landmark be findable. With ~30 landmarks crammed into a 800×500
  // viewport, the centre cluster (Dam Square / Centraal / Anne Frank / Jordaan)
  // paints 5-6 labels on top of each other. This pass:
  //   1. Sorts landmarks by (priority desc, y asc). Major landmarks always
  //      get first pick of their natural position.
  //   2. Greedy collision check against already-placed rects (text-bbox of
  //      "bold 7px sans-serif" ≈ 7 px per CJK char × 0.95).
  //   3. Pushes overlapping labels down by MAX_STACK_PX up to MAX_TRIES rows;
  //      once the bottom row is full, tries a leader-line abbrev at the
  //      bottom-most slot.
  //   4. Hides the label entirely if even the leader slot collides (the pin
  //      still draws — only the text disappears). The mini-map (R8) is the
  //      fallback discoverability path.
  //
  // Pure data: returns an array of {landmark, _rect, _shown, _leader}. No DOM,
  // no canvas — tests assert the algorithm directly.
  const LM_PRIORITY = {
    museum: 8, station: 7, square: 7, religious: 6,
    district: 5, park: 4, brewery: 3, venue: 2,
  };
  const MAX_STACK_PX = 14;     // row height (px) when pushing labels down
  const MAX_TRIES = 3;         // 3 rows of stacked labels before falling back
  const LABEL_H = 9;           // "bold 7px sans-serif" bbox height
  const LABEL_CHAR_W = 6.5;    // px per CJK char @ 7px bold
  function _labelText(lm, abbrev) {
    const raw = lm.nameZh || lm.name || lm.id || '';
    return abbrev ? raw.slice(0, 4) : raw.slice(0, 10);
  }
  function _labelWidth(txt, abbrev) {
    const n = txt.length;
    return Math.max(18, Math.round(n * LABEL_CHAR_W));
  }
  function _rectsOverlap(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x ||
             a.y + a.h < b.y || b.y + b.h < a.y);
  }
  function planLandmarkLabels(scene, canvasH) {
    canvasH = canvasH || (scene && scene.canvas ? scene.canvas.H : 0);
    if (!scene || !scene.landmarks || !scene.landmarks.length) return [];
    const sorted = scene.landmarks.slice().sort((a, b) => {
      const pa = LM_PRIORITY[a.kind] != null ? LM_PRIORITY[a.kind] : 0;
      const pb = LM_PRIORITY[b.kind] != null ? LM_PRIORITY[b.kind] : 0;
      if (pb !== pa) return pb - pa;
      return a.y - b.y;
    });
    const placed = [];
    const plans = new Array(scene.landmarks.length);
    let idx = 0;
    for (const lm of sorted) {
      const fullText = _labelText(lm, false);
      const fullW = _labelWidth(fullText, false);
      let chosen = null;
      let leader = null;
      // Row 0..MAX_TRIES-1: stack the label down by MAX_STACK_PX each try.
      for (let row = 0; row < MAX_TRIES; row++) {
        const centerY = lm.y + 11 + row * MAX_STACK_PX;
        const rect = {
          x: lm.x - fullW / 2,
          y: centerY - LABEL_H / 2,
          w: fullW,
          h: LABEL_H,
          abbrev: false,
          row,
        };
        if (canvasH && rect.y + rect.h > canvasH - 6) continue;  // clip to canvas
        const hit = placed.find(p => _rectsOverlap(rect, p));
        if (!hit) { chosen = rect; break; }
      }
      // Leader-line abbrev fallback — last chance before hiding.
      if (!chosen) {
        const abbrText = _labelText(lm, true);
        const abbrW = _labelWidth(abbrText, true);
        const leaderY = lm.y + 11 + MAX_TRIES * MAX_STACK_PX + 2;
        const leaderRect = {
          x: lm.x - abbrW / 2,
          y: leaderY - LABEL_H / 2,
          w: abbrW,
          h: LABEL_H,
          abbrev: true,
          row: MAX_TRIES,
        };
        if (!(canvasH && leaderRect.y + leaderRect.h > canvasH - 6)) {
          const hit = placed.find(p => _rectsOverlap(leaderRect, p));
          if (!hit) {
            chosen = leaderRect;
            leader = {
              x1: lm.x, y1: lm.y,
              x2: leaderRect.x + leaderRect.w / 2,
              y2: leaderRect.y + leaderRect.h / 2,
              text: abbrText,
            };
          }
        }
      }
      const plan = {
        landmark: lm,
        _rect: chosen,
        _shown: !!chosen,
        _leader: leader,
        _hiddenReason: chosen ? null : 'no_clear_slot',
      };
      if (chosen) placed.push(chosen);
      plans[idx++] = plan;
    }
    return plans;
  }
  function declutterStats(plans) {
    const total = plans.length;
    let shown = 0, hidden = 0, leaderLines = 0;
    for (const p of plans) {
      if (p._shown) shown++;
      else hidden++;
      if (p._leader) leaderLines++;
    }
    return { total, shown, hidden, leaderLines };
  }

  // ─── Composite (pure data → list of layers) ────────────────────────────────
  function buildReplicaScene(geo, W, H, opts) {
    opts = opts || {};
    const vp = viewportFit(geo, W, H, opts.pad == null ? 24 : opts.pad);
    const landmarks = geo.LANDMARKS.map(l => projectLandmark(geo, l, vp)).filter(Boolean);
    const canals    = geo.CANALS.map(c => projectCanalPath(geo, c, vp));
    const bridges   = geo.BRIDGES.map(b => projectBridge(geo, b, vp)).filter(Boolean);
    const miniGames = (geo.MINI_BINDINGS || []).map(m => projectMiniGame(geo, m, vp)).filter(Boolean);
    const islands   = (geo.ISLANDS || []).map(i => projectIsland(geo, i, vp)).filter(Boolean);
    return {
      version: VERSION,
      viewport: vp,
      canvas: { W, H },
      landmarks, canals, bridges, miniGames, islands,
      // Counts surfaced for tests + UI.
      counts: {
        landmarks: landmarks.length,
        canals: canals.length,
        bridges: bridges.length,
        miniGames: miniGames.length,
        islands: islands.length,
      },
    };
  }

  // ─── R3 · Viewport rect (for culling) ──────────────────────────────────────
  // Returns the rect {x0,y0,x1,y1} inside which an object is visible. The whole
  // canvas is in scope — features outside pad get culled.
  function viewportRect(vp, W, H, pad) {
    pad = pad == null ? 24 : pad;
    if (!vp) return { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 };
    return { x0: -pad, y0: -pad, x1: W + pad, y1: H + pad };
  }
  // Quick reject for a point (x,y) with radius r against a rect.
  function inViewport(x, y, r, rect) {
    if (!rect) return true;
    return x + r >= rect.x0 && x - r <= rect.x1 &&
           y + r >= rect.y0 && y - r <= rect.y1;
  }

  // ─── R3 · LOD (level-of-detail) for bridges ───────────────────────────────
  // Famous bridges (Magere Brug, Blauwbrug, etc.) always render. Lesser
  // numbered bridges only render when scale >= 0.6 (default fit ~1.0).
  const FAMOUS_BRIDGES = new Set([
    'magere_brug', 'blauwbrug', 'torensluis', 'paleisbrug', 'hortusbrug',
    'berlagebrug', 'oosterdokbrug', 'ndsm_brug', 'jan_schaeferbrug',
    'han_lammersbrug', 'staalmeestersbrug', 'eilandsbrug',
  ]);
  function bridgeLOD(bridges, scale) {
    if (!bridges || scale >= 0.6) return bridges || [];
    return bridges.filter(b => FAMOUS_BRIDGES.has(b.id));
  }

  // ─── Draw fn (consumes scene → paints ctx) ─────────────────────────────────
  function renderReplicaOverlay(ctx, geo, W, H, opts) {
    opts = opts || {};
    const scene = buildReplicaScene(geo, W, H, opts);
    const useCache = opts.cache === true && typeof document !== 'undefined';
    let cacheHit = false;
    if (useCache) {
      const sl = getStaticLayer(geo, W, H, opts, scene);
      if (sl && sl.canvas) {
        ctx.drawImage(sl.canvas, 0, 0);
        cacheHit = !!sl.hit;
      } else {
        drawCanals(ctx, scene);
      }
    } else {
      drawCanals(ctx, scene);
    }
    const rect = viewportRect(scene.viewport, W, H, opts.pad == null ? 24 : opts.pad);
    drawBridges(ctx, scene, { rect, lod: true, cull: true });
    drawLandmarks(ctx, scene);
    drawIslands(ctx, scene, opts);
    drawMiniGames(ctx, scene, opts);
    drawScaleBar(ctx, geo, scene, opts);
    drawMiniMap(ctx, scene, opts);
    drawLegend(ctx, scene, opts);
    return { scene, cacheHit };
  }

  function drawCanals(ctx, scene) {
    drawCanalsImpl(ctx, scene);
  }
  // Internal: shared by drawCanals (live) and the static-layer baker.
  function drawCanalsImpl(ctx, scene) {
    // Sort: wide rivers under, narrow canals on top so labels stay readable.
    const sorted = scene.canals.slice().sort((a, b) => b.widthPx - a.widthPx);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const c of sorted) {
      if (c.points.length < 2) continue;
      ctx.strokeStyle = c.color.edge;
      ctx.lineWidth = c.widthPx + 1;
      ctx.beginPath();
      ctx.moveTo(c.points[0].x, c.points[0].y);
      for (let i = 1; i < c.points.length; i++) ctx.lineTo(c.points[i].x, c.points[i].y);
      ctx.stroke();
      ctx.strokeStyle = c.color.fill;
      ctx.lineWidth = c.widthPx;
      ctx.stroke();
    }
    // Labels along the longest canal segment, italic light-blue.
    ctx.font = 'italic 8px sans-serif';
    ctx.fillStyle = '#2a5070';
    ctx.textAlign = 'center';
    for (const c of scene.canals) {
      if (c.points.length < 2) continue;
      // Pick mid-segment for label.
      const i = Math.floor(c.points.length / 2);
      const a = c.points[i - 1] || c.points[0];
      const b = c.points[i] || c.points[c.points.length - 1];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.save();
      ctx.translate(mx, my);
      // Rotate to match segment angle (clamped so text never reads upside-down).
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const norm = Math.abs(ang) > Math.PI / 2 ? ang - Math.sign(ang) * Math.PI : ang;
      ctx.rotate(norm);
      ctx.fillText(c.name, 0, -c.widthPx - 1);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBridges(ctx, scene, opts) {
    opts = opts || {};
    const doCull = opts.cull === true;
    const doLOD  = opts.lod  === true;
    const rect   = opts.rect || null;
    const scale  = scene.viewport ? scene.viewport.scale : 1;
    let bridges = scene.bridges;
    if (doLOD) bridges = bridgeLOD(bridges, scale);
    if (doCull && rect) bridges = bridges.filter(b => inViewport(b.x, b.y, 6, rect));
    ctx.save();
    for (const b of bridges) {
      // White bar 8×2 perpendicular-ish (horizontal for simplicity at this zoom).
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(b.x - 4, b.y - 1, 8, 2);
      ctx.strokeStyle = '#3a3a3a';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(b.x - 4, b.y - 1, 8, 2);
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath(); ctx.arc(b.x - 4, b.y - 1, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(b.x + 4, b.y - 1, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(b.x - 4, b.y + 1, 1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(b.x + 4, b.y + 1, 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return { drawn: bridges.length, culled: scene.bridges.length - bridges.length };
  }

  function drawLandmarks(ctx, scene) {
    // R8 · declutter pass first — pure data, no drawing.
    const plans = planLandmarkLabels(scene);
    // Painter's algorithm: sort the plans by y so northern pins draw under
    // southern ones (consistent with prior rounds).
    const sorted = plans.slice().sort((a, b) => a.landmark.y - b.landmark.y);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const plan of sorted) {
      const lm = plan.landmark;
      // Drop shadow
      ctx.fillStyle = '#0003';
      ctx.beginPath(); ctx.arc(lm.x + 1, lm.y + 2, 7, 0, Math.PI * 2); ctx.fill();
      // Pin body
      ctx.fillStyle = lm.color;
      ctx.beginPath(); ctx.arc(lm.x, lm.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Icon
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(lm.icon, lm.x, lm.y + 0.5);
      if (!plan._shown || !plan._rect) continue;
      // Optional dashed leader-line for abbrev labels.
      if (plan._leader) {
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(plan._leader.x1, plan._leader.y1);
        ctx.lineTo(plan._leader.x2, plan._leader.y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Label — full or abbrev depending on which slot won.
      const txt = plan._leader ? plan._leader.text : _labelText(lm, false);
      ctx.font = 'bold 7px sans-serif';
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(txt, lm.x, plan._rect.y + plan._rect.h / 2);
    }
    ctx.restore();
    return declutterStats(plans);
  }

  function drawLegend(ctx, scene, opts) {
    if (opts.legend === false) return;
    const W = scene.canvas.W;
    const kinds = Object.keys(KIND_ICON);
    const boxW = 110, rowH = 11, h = 14 + kinds.length * rowH;
    ctx.save();
    ctx.fillStyle = '#00000060';
    ctx.fillRect(W - boxW - 8, 8, boxW, h);
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('REPLICA · ' + scene.counts.landmarks + ' 个地标', W - boxW - 4, 18);
    ctx.font = '7px sans-serif';
    let y = 28;
    for (const k of kinds) {
      ctx.fillStyle = KIND_COLOR[k];
      ctx.beginPath(); ctx.arc(W - boxW + 4, y - 1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(k + ' (' + scene.landmarks.filter(l => l.kind === k).length + ')', W - boxW + 12, y);
      y += rowH;
    }
    ctx.restore();
  }

  // ─── R6 · Mini-game markers (diamond + industry icon + venue name) ─────────
  // Brief §2 验收 #2 — 6 mini-game 真实地址 binding. Each marker is a 5px-radius
  // diamond with the industry emoji inside and the venue name (short) below.
  // Skipped when opts.miniGames === false so the renderer can be tested without
  // them.
  function drawMiniGames(ctx, scene, opts) {
    if (opts && opts.miniGames === false) return;
    if (!scene || !scene.miniGames || !scene.miniGames.length) return;
    const sorted = scene.miniGames.slice().sort((a, b) => a.y - b.y);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const m of sorted) {
      // Shadow
      ctx.fillStyle = '#0004';
      ctx.beginPath();
      ctx.moveTo(m.x, m.y - 6);
      ctx.lineTo(m.x + 5, m.y);
      ctx.lineTo(m.x, m.y + 6);
      ctx.lineTo(m.x - 5, m.y);
      ctx.closePath();
      ctx.fill();
      // Diamond body
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y - 5);
      ctx.lineTo(m.x + 5, m.y);
      ctx.lineTo(m.x, m.y + 5);
      ctx.lineTo(m.x - 5, m.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Icon
      ctx.font = '7px sans-serif';
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(m.icon, m.x, m.y + 0.5);
      // Short label below (industry + venue)
      ctx.font = 'bold 6px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      const label = (m.name || m.industry).slice(0, 8);
      ctx.strokeText(label, m.x, m.y + 13);
      ctx.fillText(label, m.x, m.y + 13);
    }
    ctx.restore();
    return { drawn: sorted.length };
  }

  // ─── R6 · Island pins (filled circle + name) ───────────────────────────────
  // At default zoom (scale ~1) all 30 are visible. At low zoom (scale < 0.7)
  // we only keep the park/polder landmarks so the dense centre stays legible.
  function drawIslands(ctx, scene, opts) {
    if (opts && opts.islands === false) return;
    if (!scene || !scene.islands || !scene.islands.length) return;
    const scale = (scene.viewport && scene.viewport.scale) || 1;
    let shown = scene.islands;
    if (scale < 0.7) {
      // Keep only park + polder when zoomed out — those are the visually distinct
      // green islands. Hide the dense artificial / neighborhood cluster.
      shown = scene.islands.filter(i => i.kind === 'park' || i.kind === 'polder');
    } else if (scale < 0.5) {
      shown = [];
    }
    const sorted = shown.slice().sort((a, b) => a.y - b.y);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const i of sorted) {
      // Pin
      ctx.globalAlpha = i.alpha;
      ctx.fillStyle = i.color;
      ctx.beginPath(); ctx.arc(i.x, i.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = i.edge;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Italic label
      ctx.font = 'italic 6px sans-serif';
      ctx.fillStyle = '#3a3a3a';
      const label = (i.nameZh || i.name || '').slice(0, 8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeText(label, i.x, i.y - 6);
      ctx.fillText(label, i.x, i.y - 6);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    return { drawn: sorted.length, hidden: scene.islands.length - sorted.length };
  }

  // ─── R6 · 1 km scale bar (bottom-left) ─────────────────────────────────────
  // Uses scene.viewport.scale × geo.SCALE_M_PER_PX so the bar is always
  // physically correct regardless of fit / window size. Returns the rect so
  // tests can assert it's well-formed.
  function drawScaleBar(ctx, geo, scene, opts) {
    if (opts && opts.scaleBar === false) return null;
    if (!geo || !geo.SCALE_M_PER_PX || !scene || !scene.viewport) return null;
    const W = scene.canvas.W, H = scene.canvas.H;
    // 1 km in geo-canvas px = 1000 / SCALE_M_PER_PX. Multiply by vp.scale to
    // get on-screen px.
    const km = 1;
    const px = (km * 1000 / geo.SCALE_M_PER_PX) * scene.viewport.scale;
    const x = 12, y = H - 18;
    const halfH = 4;
    ctx.save();
    // Background pill
    ctx.fillStyle = '#00000060';
    ctx.fillRect(x - 4, y - halfH - 4, px + 32, halfH * 2 + 12);
    // Bar
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y - 1, px, 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y - 1, px, 2);
    // End caps
    ctx.fillRect(x, y - halfH, 1, halfH * 2);
    ctx.fillRect(x + px - 1, y - halfH, 1, halfH * 2);
    // Label
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('1 km', x + px + 4, y + 3);
    ctx.restore();
    return { x, y, w: px + 32, h: halfH * 2 + 12 };
  }

  // ─── R8 · Mini-map overview (bottom-right) ─────────────────────────────────
  // Fallback discoverability for labels hidden by the declutter pass in the
  // dense centre. Plots every landmark as a 1.5-px colored dot scaled to the
  // viewport's drawn region; no text (the legend at the top already names the
  // kind colours). Sits in the bottom-right corner so it doesn't fight with
  // the scale bar (bottom-left) or the legend (top-right). Opt out via
  // opts.miniMap === false.
  const MINI_MAP_SIZE = 90;
  const MINI_MAP_PAD  = 6;
  const MINI_MAP_BOTTOM_OFFSET = 18;  // leaves room for the 1 km scale bar
  function drawMiniMap(ctx, scene, opts) {
    if (opts && opts.miniMap === false) return null;
    if (!scene || !scene.landmarks || !scene.landmarks.length) return null;
    const vp = scene.viewport;
    if (!vp) return null;
    const W = scene.canvas.W, H = scene.canvas.H;
    const size = MINI_MAP_SIZE;
    const x0 = W - size - MINI_MAP_PAD;
    const y0 = H - size - MINI_MAP_PAD - MINI_MAP_BOTTOM_OFFSET;
    ctx.save();
    // Background
    ctx.fillStyle = '#00000060';
    ctx.fillRect(x0, y0, size, size);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x0, y0, size, size);
    // Title (above the box)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MINI-MAP · ' + scene.counts.landmarks, x0, y0 - 2);
    // Map (vp.ox..vp.ox+vp.w) → (x0..x0+size). Defensive against zero-width
    // viewport so we never divide by zero.
    const drawnX = vp.ox, drawnY = vp.oy;
    const drawnW = Math.max(1, vp.w), drawnH = Math.max(1, vp.h);
    function px(x) { return x0 + ((x - drawnX) / drawnW) * size; }
    function py(y) { return y0 + ((y - drawnY) / drawnH) * size; }
    let plotted = 0;
    for (const lm of scene.landmarks) {
      const mx = px(lm.x), my = py(lm.y);
      if (mx < x0 + 1 || mx > x0 + size - 1 || my < y0 + 1 || my > y0 + size - 1) continue;
      ctx.fillStyle = lm.color;
      ctx.beginPath(); ctx.arc(mx, my, 1.5, 0, Math.PI * 2); ctx.fill();
      plotted++;
    }
    // Optional viewport center crosshair — opts.viewportCenter={x,y}.
    if (opts && opts.viewportCenter && typeof opts.viewportCenter.x === 'number') {
      const cx = px(opts.viewportCenter.x);
      const cy = py(opts.viewportCenter.y);
      if (cx >= x0 && cx <= x0 + size && cy >= y0 && cy <= y0 + size) {
        ctx.strokeStyle = '#ecb457';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy);
        ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy + 3);
        ctx.stroke();
      }
    }
    ctx.restore();
    return { x: x0, y: y0, w: size, h: size, plotted };
  }

  // ─── R3 · Static layer cache ──────────────────────────────────────────────
  // Canals + their labels never change between frames (W,H,opts are stable).
  // Bake them once into an offscreen canvas; per-frame just `ctx.drawImage`.
  // Cache is keyed by (geo, W, H, opts.pad) via WeakMap so it auto-cleans if
  // the geo object is GC'd. Browser-only — falls through to live draw otherwise.
  const _staticCache = new WeakMap();
  function _cacheKey(W, H, opts) {
    return `${W}x${H}|${opts && opts.pad != null ? opts.pad : 24}`;
  }
  function getStaticLayer(geo, W, H, opts, scene) {
    if (typeof document === 'undefined') return null;     // test harness: no DOM
    opts = opts || {};
    const key = _cacheKey(W, H, opts);
    let entry = _staticCache.get(geo);
    if (!entry) { entry = {}; _staticCache.set(geo, entry); }
    if (entry[key]) return { canvas: entry[key], hit: true };
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const cctx = c.getContext('2d');
    if (!scene) scene = buildReplicaScene(geo, W, H, opts);
    drawCanalsImpl(cctx, scene);
    entry[key] = c;
    return { canvas: c, hit: false };
  }
  function clearStaticCache(geo) {
    if (geo) _staticCache.delete(geo);
    else _staticCache.clear && _staticCache.clear();
  }

  // ─── R3 · FPS measurement (sliding window) ───────────────────────────────
  // Caller drives fpsTick(performance.now()) once per renderAll. fpsNow returns
  // the smoothed instantaneous FPS; frameMs the most recent frame time in ms.
  const FPS_WINDOW = 60;
  let _frameTimes = [];
  let _lastFrameAt = 0;
  function fpsTick(now) {
    if (now == null) now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
    if (_lastFrameAt > 0) {
      const dt = now - _lastFrameAt;
      // Guard against pathological dt (>250ms = paused tab) by dropping it.
      if (dt > 0 && dt < 250) {
        _frameTimes.push(dt);
        if (_frameTimes.length > FPS_WINDOW) _frameTimes.shift();
      }
    }
    _lastFrameAt = now;
  }
  function fpsNow() {
    if (_frameTimes.length === 0) return 0;
    let s = 0;
    for (const t of _frameTimes) s += t;
    const avg = s / _frameTimes.length;
    return avg > 0 ? Math.round(1000 / avg) : 0;
  }
  function frameMs() {
    if (_frameTimes.length === 0) return 0;
    const last = _frameTimes[_frameTimes.length - 1];
    return Math.round(last * 100) / 100;
  }
  function fpsReset() {
    _frameTimes = [];
    _lastFrameAt = 0;
  }

  // ─── R4 · Scene stats (runtime introspection) ──────────────────────────────
  // Single-call summary for tests + dev console. Reports data, viewport, perf,
  // and cache state so we can assert "replica layer actually rendered X
  // features at Y fps" without scraping canvas pixels.
  function getReplSceneStats(geo, W, H, opts) {
    const scene = buildReplicaScene(geo, W, H, opts || {});
    const vp = scene.viewport;
    const lodScale = vp ? vp.scale : 1;
    const lodBridges = bridgeLOD(scene.bridges, lodScale);
    const rect = viewportRect(vp, W, H, (opts && opts.pad) || 24);
    const culledBridges = lodBridges.filter(b => inViewport(b.x, b.y, 6, rect));
    // R8 · run the same declutter pass the renderer uses, so tests + console
    // can assert on identical numbers. Pure data; no canvas touched.
    const labelPlans = planLandmarkLabels(scene, H);
    const labels = declutterStats(labelPlans);
    return {
      version: VERSION,
      geoVersion: geo && geo.VERSION ? geo.VERSION : null,
      counts: {
        landmarks: geo ? geo.LANDMARKS.length : 0,
        canals: geo ? geo.CANALS.length : 0,
        bridges: geo ? geo.BRIDGES.length : 0,
        islands: geo ? geo.ISLANDS.length : 0,
        streets: geo ? geo.STREETS.length : 0,
        miniGames: geo && geo.MINI_BINDINGS ? geo.MINI_BINDINGS.length : 0,
      },
      viewport: vp ? { scale: vp.scale, w: vp.w, h: vp.h } : null,
      canvas: { W, H },
      bridges: {
        total: scene.bridges.length,
        lod: { shown: lodBridges.length, hidden: scene.bridges.length - lodBridges.length },
        culled: { shown: culledBridges.length, hidden: lodBridges.length - culledBridges.length },
        famous: lodBridges.filter(b => FAMOUS_BRIDGES.has(b.id)).length,
      },
      labels,                              // R8 — declutter summary
      cache: {
        // Probe whether the static cache is hot for the current key. Returns
        // hit=true if drawReplicaOverlay with cache:true would skip live draw.
        hit: (typeof document !== 'undefined') &&
              (function () {
                const sl = getStaticLayer(geo, W, H, opts || {}, scene);
                return !!(sl && sl.hit);
              })(),
      },
      perf: {
        fps: fpsNow(),
        frameMs: frameMs(),
        samples: _frameTimes.length,
      },
    };
  }

  // ─── Export ────────────────────────────────────────────────────────────────
  global.MAP_RENDERER = {
    VERSION,
    KIND_ICON, KIND_COLOR,
    MINI_ICON, MINI_COLOR,            // R6 — mini-game venue markers
    ISLAND_COLOR,                     // R6 — island pin palette
    FAMOUS_BRIDGES,
    LM_PRIORITY,                      // R8 — declutter priority table
    viewportFit, projectPoint,
    projectLandmark, projectCanalPath, projectBridge,
    projectMiniGame, projectIsland,   // R6
    buildReplicaScene, renderReplicaOverlay,
    drawMiniGames, drawIslands, drawScaleBar,  // R6 — exposed for tests
    drawLandmarks,                    // R8 — now consumes planLandmarkLabels
    // R8 polish
    planLandmarkLabels, declutterStats, drawMiniMap,
    // R3 perf layer
    viewportRect, inViewport, bridgeLOD, drawBridges,
    getStaticLayer, clearStaticCache,
    fpsTick, fpsNow, frameMs, fpsReset,
    // R4 introspection
    getReplSceneStats,
  };
})(typeof window !== 'undefined' ? window : globalThis);