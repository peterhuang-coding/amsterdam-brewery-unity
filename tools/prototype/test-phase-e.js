#!/usr/bin/env node
// Phase E regression gate — run: node tools/prototype/test-phase-e.js
// Extracts the Phase E data pools + factor helpers out of index.html and asserts
// they are actually wired (real multipliers, not flavor text), balanced, and seed-deterministic.
const fs = require('fs');
const path = require('path');
const HTML = path.join(__dirname, 'index.html');
const h = fs.readFileSync(HTML, 'utf8');

let pass = 0, fail = 0;
const t = (n, c) => c ? pass++ : (fail++, console.log('  FAIL: ' + n));

// ── 0. whole-file syntax gate (node --check equivalent for inline <script>) ──
const scripts = [...h.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
t('inline scripts parse', scripts.every(s => { try { new Function(s[1]); return true } catch (e) { console.log('    ' + e.message); return false } }));

// ── 1. isolate the Phase E block ──
const start = h.indexOf('// Phase E1 — Talent Tree');
const end = h.indexOf('function rollDayMutator');
const src = h.slice(start, h.indexOf('}', h.indexOf('return m;', end)) + 1);
const G = { talents: [], mutator: null, seed: 42, day: 1, mood: 0 };
function seeded(n) { const x = Math.sin((G.seed + n * 9973 + G.day * 7919) * 12.9898) * 43758.5453; return x - Math.floor(x) }
const A = new Function('G', 'seeded', '"use strict";' + src +
  '; return {TALENT_POOL,TALENT_BRANCHES,MUTATOR_POOL,talentFactor,mutatorFactor,rollDayMutator,moodFloor,fineAmt,mutFlag,TALENT_MAX};')(G, seeded);

// ── 2. shape ──
t('12 talents', A.TALENT_POOL.length === 12);
t('4 branches x 3 nodes', A.TALENT_BRANCHES.length === 4 && A.TALENT_BRANCHES.every(b => A.TALENT_POOL.filter(x => x.br === b.id).length === 3));
t('12 mutators', A.MUTATOR_POOL.length === 12);
t('unique ids', new Set(A.TALENT_POOL.map(x => x.id)).size === 12 && new Set(A.MUTATOR_POOL.map(x => x.id)).size === 12);

// ── 3. every entry is WIRED, not flavor text (acceptance criterion #1) ──
t('every talent has a factor or a flag', A.TALENT_POOL.every(x => x.f || x.flag));
t('every mutator has a real effect', A.MUTATOR_POOL.every(m => m.f && Object.keys(m.f).length));
t('talent/mutator folded into industryFactor', /f\*=talentFactor\(id\)\*mutatorFactor\(id\)/.test(h));

// ── 4. multiplier semantics ──
G.talents = []; G.mutator = null;
t('baseline is 1x', A.talentFactor('brewing') === 1 && A.mutatorFactor('brewing') === 1);
G.talents = ['t_brew_yield'];
t('talent applies to its industry', Math.abs(A.talentFactor('brewing') - 1.25) < 1e-9);
t('talent does not leak across industries', A.talentFactor('coffee') === 1);
G.talents = ['t_brew_yield', 't_sur_all'];
t('talents stack multiplicatively', Math.abs(A.talentFactor('brewing') - 1.25 * 1.1) < 1e-9);
G.mutator = 'm_thesis';
t('named industry overrides wildcard ("其余" semantics)', Math.abs(A.mutatorFactor('academic') - 1.8) < 1e-9);
t('wildcard hits only unnamed industries', Math.abs(A.mutatorFactor('bar') - 0.85) < 1e-9);
G.mutator = 'm_storm';
t('m_storm surf is 2.2 not 1.98', Math.abs(A.mutatorFactor('surf') - 2.2) < 1e-9);

// ── 5. non-multiplier flags ──
G.mutator = 'm_strict'; G.talents = [];
t('strict week doubles fines', A.fineAmt(15) === 30);
G.talents = ['t_street_slip'];
t('slip halves fine before strict doubles', A.fineAmt(15) === 16);
t('slip widens mood floor to -3', A.moodFloor() === -3);
G.talents = []; G.mutator = 'm_mercury';
t('mercury retrograde widens mood floor', A.moodFloor() === -3);
G.mutator = 'm_grant';
t('default mood floor stays -2', A.moodFloor() === -2);
G.mutator = 'm_strike';
t('tram strike waives the no-business fine', A.mutFlag('noFine'));

// ── 6. balance guard — no talent+mutator combo runs away (brief risk: mutator 无敌) ──
const inds = ['brewing', 'coffee', 'shroom', 'surf', 'academic', 'bar'];
let worst = 0, worstD = '';
for (const m of A.MUTATOR_POOL) {
  G.mutator = m.id;
  for (const combo of [['t_brew_yield', 't_brew_bar', 't_sch_edge', 't_sur_surf'],
                       ['t_sur_all', 't_street_fence', 't_sch_coffee', 't_brew_yield']]) {
    G.talents = combo;
    for (const i of inds) { const v = A.talentFactor(i) * A.mutatorFactor(i); if (v > worst) { worst = v; worstD = m.id + '/' + i } }
  }
}
t(`no combo exceeds 4x (worst ${worst.toFixed(2)} @ ${worstD})`, worst < 4);

// ── 7. seed determinism + build diversity (acceptance criterion #3) ──
const paths = {};
for (const s of [42, 100, 200, 250]) {
  G.seed = s; const p = [];
  for (let d = 1; d <= 7; d++) { G.day = d; p.push(A.rollDayMutator().id) }
  paths[s] = p.join('>');
}
G.seed = 42; const replay = [];
for (let d = 1; d <= 7; d++) { G.day = d; replay.push(A.rollDayMutator().id) }
t('same seed replays identically', replay.join('>') === paths[42]);
t('4 seeds yield 4 distinct 7-day paths', new Set(Object.values(paths)).size === 4);
t('>=6 distinct mutators surface across seeds', new Set(Object.values(paths).join('>').split('>')).size >= 6);

// ── 8. Phase A/B/C regression markers still present ──
for (const marker of ['workedToday', 'shoplift', 'escapeIn', 'custRels', 'barStock', 'rollDayObjectives', 'todayWave'])
  t(`Phase A/B/C marker intact: ${marker}`, h.includes(marker));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
