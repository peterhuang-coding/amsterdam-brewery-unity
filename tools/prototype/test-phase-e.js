#!/usr/bin/env node
// Phase E regression gate — run: node tools/prototype/test-phase-e.js
// Extracts the Phase E data pools + factor helpers out of index.html and asserts
// they are actually wired (real multipliers, not flavor text), balanced, and seed-deterministic.
// Round 2 adds Phase E2 (Faction System).
const fs = require('fs');
const path = require('path');
const HTML = path.join(__dirname, 'index.html');
const h = fs.readFileSync(HTML, 'utf8');

let pass = 0, fail = 0;
const t = (n, c) => c ? pass++ : (fail++, console.log('  FAIL: ' + n));

// ── 0. whole-file syntax gate (node --check equivalent for inline <script>) ──
const scripts = [...h.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
t('inline scripts parse', scripts.every(s => { try { new Function(s[1]); return true } catch (e) { console.log('    ' + e.message); return false } }));

// ── 1. isolate the Phase E block (E1 + E3 + E2 in source order) ──
const start = h.indexOf('// Phase E1 — Talent Tree');
const audioIdx = h.indexOf('// WEB AUDIO (Round 6)');
// Stub addEvt so bumpFaction (which calls it) doesn't ReferenceError in tests
const src = 'function addEvt(kind, msg){ /* test stub */ }\n' + h.slice(start, audioIdx);
const G = { talents: [], mutator: null, seed: 42, day: 1, mood: 0, factions: {heineken:0,coffee:0,smartshop:0}, _run: {factionBonus:{brewing:1,coffee:1,shroom:1,bar:1}}, money: 250, bs: [5,3,2], shop: {} };
function seeded(n) { const x = Math.sin((G.seed + n * 9973 + G.day * 7919) * 12.9898) * 43758.5453; return x - Math.floor(x) }
const A = new Function('G', 'seeded', '"use strict";' + src +
  '; return {TALENT_POOL,TALENT_BRANCHES,MUTATOR_POOL,FACTION_POOL,FAC_BY_ID,talentFactor,mutatorFactor,rollDayMutator,moodFloor,fineAmt,mutFlag,TALENT_MAX,factionRep,factionRepFactor,bumpFaction,triggerFactionEvent};')(G, seeded);

// ── 2. shape ──
t('12 talents', A.TALENT_POOL.length === 12);
t('4 branches x 3 nodes', A.TALENT_BRANCHES.length === 4 && A.TALENT_BRANCHES.every(b => A.TALENT_POOL.filter(x => x.br === b.id).length === 3));
t('12 mutators', A.MUTATOR_POOL.length === 12);
t('3 factions', A.FACTION_POOL.length === 3);
t('unique ids', new Set(A.TALENT_POOL.map(x => x.id)).size === 12 && new Set(A.MUTATOR_POOL.map(x => x.id)).size === 12 && new Set(A.FACTION_POOL.map(x => x.id)).size === 3);
t('every faction has all 4 threshold events', A.FACTION_POOL.every(f => f.plus50 && f.minus50 && f.plus100 && f.minus100));
t('every faction binds to a known industry', A.FACTION_POOL.every(f => ['brewing','coffee','shroom'].includes(f.ind)));

// ── 3. every entry is WIRED, not flavor text (acceptance criterion #1) ──
t('every talent has a factor or a flag', A.TALENT_POOL.every(x => x.f || x.flag));
t('every mutator has a real effect', A.MUTATOR_POOL.every(m => m.f && Object.keys(m.f).length));
t('talent/mutator folded into industryFactor', /f\*=talentFactor\(id\)\*mutatorFactor\(id\)/.test(h));
t('faction folded into industryFactor', /factionRepFactor\(id\)\*fb/.test(h));

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

// ── 6. balance guard — no talent+mutator+faction combo runs away ──
const inds = ['brewing', 'coffee', 'shroom', 'surf', 'academic', 'bar'];
let worst = 0, worstD = '';
for (const m of A.MUTATOR_POOL) {
  G.mutator = m.id;
  for (const combo of [['t_brew_yield', 't_brew_bar', 't_sch_edge', 't_sur_surf'],
                       ['t_sur_all', 't_street_fence', 't_sch_coffee', 't_brew_yield']]) {
    G.talents = combo;
    for (const fac of A.FACTION_POOL) {
      // scenario: max rep 100 + max bonus → upper bound check
      G.factions[fac.id] = 100;
      G._run.factionBonus[fac.ind] = 1.7;
      for (const i of inds) {
        const v = A.talentFactor(i) * A.mutatorFactor(i) * A.factionRepFactor(i) * (G._run.factionBonus[i] || 1);
        if (v > worst) { worst = v; worstD = m.id + '/' + fac.id + '/' + i }
      }
    }
  }
}
t(`no combo exceeds 8x (worst ${worst.toFixed(2)} @ ${worstD})`, worst < 8);

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

// ── 8. Phase E2 — Faction System semantics ──
G.factions = {heineken: 0, coffee: 0, smartshop: 0};
t('factionRep defaults to 0', A.factionRep('heineken') === 0);
t('factionRepFactor baseline = 1', A.factionRepFactor('brewing') === 1 && A.factionRepFactor('coffee') === 1 && A.factionRepFactor('shroom') === 1);
G.factions.heineken = 100;
t('+100 rep → 1.5x on bound industry', Math.abs(A.factionRepFactor('brewing') - 1.5) < 1e-9);
t('+100 rep → no leak to other industries', A.factionRepFactor('coffee') === 1);
G.factions.heineken = -100;
t('-100 rep → 0.5x (clamp at 0.5)', Math.abs(A.factionRepFactor('brewing') - 0.5) < 1e-9);
G.factions.heineken = 50;
t('+50 rep → 1.25x', Math.abs(A.factionRepFactor('brewing') - 1.25) < 1e-9);

// ── 9. threshold events fire exactly once per crossing ──
// bumpFaction mutates G._run.factionBonus as the durable signal of threshold events;
// we check the bonus state rather than mocking addEvt (which is a stub in the eval scope).
const bonusInit = () => G._run = {factionBonus:{brewing:1,coffee:1,shroom:1,bar:1}};
bonusInit(); G.factions = {heineken: 49, coffee: 0, smartshop: 0}; G.money = 250; G.shop = {};
A.bumpFaction('heineken', 5, 'test');   // crosses +50 only (49→54)
t('crossing +50 only writes hk_supply bonus to factionBonus.brewing', Math.abs(G._run.factionBonus.brewing - 1.2) < 1e-9);
bonusInit(); G.factions = {heineken: 49, coffee: 0, smartshop: 0}; G.money = 250; G.shop = {};
A.bumpFaction('heineken', 60, 'test');  // crosses +50 and +100 (49→100)
t('crossing both +50 and +100 in one bump writes hk_supply (1.2) then hk_corp (1.3) compound', Math.abs(G._run.factionBonus.brewing - 1.2 * 1.3) < 1e-9);
t('rep clamps at +100', G.factions.heineken === 100);
bonusInit(); G.factions = {heineken: -40, coffee: 0, smartshop: 0}; G.money = 250; G.shop = {};
A.bumpFaction('heineken', -15, 'test');  // crosses -50 only (-40→-55)
t('crossing -50 fires hk_blackout (real money hit)', G.money === 250 - 20);
t('crossing -50 does NOT cross -100, no rival bonus', G._run.factionBonus.brewing === 1);
bonusInit(); G.factions = {heineken: 0, coffee: 0, smartshop: 0}; G.money = 250;
A.bumpFaction('smartshop', 60, 'test');  // crosses +50 only (0→60)
t('crossing +50 but not +100 fires plus50 only', Math.abs(G._run.factionBonus.shroom - 1.3) < 1e-9);
t('crossing +50 alone does NOT trigger plus100 (still 60, not 100)', G.factions.smartshop === 60);

// ── 10. F key panel + sidebar badge wiring ──
t('F-key panel exists in DOM', h.includes('id="fac-modal"') && h.includes('id="fac-grid"'));
t('F key handler toggles faction panel', /k==='f'.*toggleFactions/.test(h));
t('F panel consumes F/ESC while open', /facOpen\(\)\)\{[^}]*closeFactions/.test(h));
t('sidebar shows faction badges', /FACTION_POOL\.map\(f=>/.test(h) || /FACTION_POOL\.map\(f=>/.test(h.replace(/\s+/g, ' ')));

// ── 11. Phase A/B/C regression markers still present ──
for (const marker of ['workedToday', 'shoplift', 'escapeIn', 'custRels', 'barStock', 'rollDayObjectives', 'todayWave'])
  t(`Phase A/B/C marker intact: ${marker}`, h.includes(marker));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);