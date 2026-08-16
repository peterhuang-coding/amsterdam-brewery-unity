/* map_renderer.js — Round 2 renderer for the Amsterdam map replica.
 *
 * Consumes AMSTERDAM_GEO (data layer) and draws it onto an arbitrary canvas.
 * No DOM, no globals besides the export. Pure projection + draw functions so
 * test.html can call them directly.
 *
 * Pipeline: viewportFit → projectLandmark/projectCanalPath/projectBridge →
 *           renderReplicaOverlay (composes all layers).
 *
 * Layer order matches the brief:
 *   1. water (canals as polylines)
 *   2. bridges (white bars)
 *   3. landmark pins (circle + icon + label)
 *   4. legend (corner)
 *
 * Goal ID: 20260816-224507-webdemo-map-replica-24h-v1-1095
 */
(function (global) {
  'use strict';

  const VERSION = 'map-replica-v1-render-1';

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

  // ─── Composite (pure data → list of layers) ────────────────────────────────
  function buildReplicaScene(geo, W, H, opts) {
    opts = opts || {};
    const vp = viewportFit(geo, W, H, opts.pad == null ? 24 : opts.pad);
    const landmarks = geo.LANDMARKS.map(l => projectLandmark(geo, l, vp)).filter(Boolean);
    const canals    = geo.CANALS.map(c => projectCanalPath(geo, c, vp));
    const bridges   = geo.BRIDGES.map(b => projectBridge(geo, b, vp)).filter(Boolean);
    return {
      version: VERSION,
      viewport: vp,
      canvas: { W, H },
      landmarks, canals, bridges,
      // Counts surfaced for tests + UI.
      counts: { landmarks: landmarks.length, canals: canals.length, bridges: bridges.length },
    };
  }

  // ─── Draw fn (consumes scene → paints ctx) ─────────────────────────────────
  function renderReplicaOverlay(ctx, geo, W, H, opts) {
    opts = opts || {};
    const scene = buildReplicaScene(geo, W, H, opts);
    drawCanals(ctx, scene);
    drawBridges(ctx, scene);
    drawLandmarks(ctx, scene);
    drawLegend(ctx, scene, opts);
    return scene;
  }

  function drawCanals(ctx, scene) {
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

  function drawBridges(ctx, scene) {
    ctx.save();
    for (const b of scene.bridges) {
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
  }

  function drawLandmarks(ctx, scene) {
    // Painter's algorithm: sort by y so northern pins are under, southern over.
    const sorted = scene.landmarks.slice().sort((a, b) => a.y - b.y);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const lm of sorted) {
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
      // Label below
      ctx.font = 'bold 7px sans-serif';
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(lm.nameZh, lm.x, lm.y + 11);
    }
    ctx.restore();
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

  // ─── Export ────────────────────────────────────────────────────────────────
  global.MAP_RENDERER = {
    VERSION,
    KIND_ICON, KIND_COLOR,
    viewportFit, projectPoint,
    projectLandmark, projectCanalPath, projectBridge,
    buildReplicaScene, renderReplicaOverlay,
  };
})(typeof window !== 'undefined' ? window : globalThis);
