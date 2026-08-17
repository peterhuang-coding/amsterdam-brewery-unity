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

// ── 1. isolate the Phase E block (E1 + E3 + E2 + E4 in source order) ──
const start = h.indexOf('// Phase E1 — Talent Tree');
const audioIdx = h.indexOf('// WEB AUDIO (Round 6)');
// Stub addEvt so bumpFaction (which calls it) doesn't ReferenceError in tests
const src = 'function addEvt(kind, msg){ /* test stub */ }\n' + h.slice(start, audioIdx);
const G = { talents: [], mutator: null, seed: 42, day: 1, mood: 0, factions: {heineken:0,coffee:0,smartshop:0}, _run: {factionBonus:{brewing:1,coffee:1,shroom:1,bar:1}}, money: 250, bs: [5,3,2], shop: {}, inv:{}, crafted:[], npcFr:{} };
function seeded(n) { const x = Math.sin((G.seed + n * 9973 + G.day * 7919) * 12.9898) * 43758.5453; return x - Math.floor(x) }
const A = new Function('G', 'seeded', '"use strict";' + src +
  '; return {TALENT_POOL,TALENT_BRANCHES,MUTATOR_POOL,FACTION_POOL,FAC_BY_ID,talentFactor,mutatorFactor,rollDayMutator,moodFloor,fineAmt,mutFlag,TALENT_MAX,factionRep,factionRepFactor,bumpFaction,triggerFactionEvent,CRAFT_RECIPES,CRAFT_BY_ID,CRAFT_BY_OUT,CRAFT_ING_POOL,CRAFT_ING_BY_ID,NPC_FRIENDSHIP,NPC_BY_ID,invCount,craftFactor,npcLvl,npcFriendshipFactor,doCraft,doGift};')(G, seeded);

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

// ── 11. Phase E4 — Craft + Gift shape ──
t('6 ingredients', A.CRAFT_ING_POOL.length === 6);
t('8 recipes', A.CRAFT_RECIPES.length === 8);
t('4 NPC friendship', A.NPC_FRIENDSHIP.length === 4);
t('unique recipe outputs', new Set(A.CRAFT_RECIPES.map(r=>r.o)).size === 8);
t('unique NPC fav', new Set(A.NPC_FRIENDSHIP.map(n=>n.fav)).size === 4);
t('every recipe has a factor', A.CRAFT_RECIPES.every(r => r.f && Object.keys(r.f).length));
t('every NPC has a L3 bonus bound to one industry', A.NPC_FRIENDSHIP.every(n => n.L3 && Object.keys(n.L3).length === 1 && ['brewing','coffee','shroom','bar','surf','academic'].includes(Object.keys(n.L3)[0])));
t('every recipe maps both ingredients to known ing', A.CRAFT_RECIPES.every(r => A.CRAFT_ING_BY_ID[r.a] && A.CRAFT_ING_BY_ID[r.b]));

// ── 12. Phase E4 — craft + gift helpers wire correctly ──
t('craft/npc folded into industryFactor', /craftFactor\(id\)\*npcFriendshipFactor\(id\)/.test(h));
t('craft baseline = 1', A.craftFactor('brewing') === 1 && A.craftFactor('coffee') === 1);
G.crafted = ['brew_bundle'];
t('craft factor applies to bound industry', Math.abs(A.craftFactor('brewing') - 1.25) < 1e-9);
G.crafted = ['promo'];
t('craft wildcard hits other industries', Math.abs(A.craftFactor('bar') - 1.15) < 1e-9);
t('npcLvl defaults to 0', A.npcLvl('marta') === 0);
G.npcFr = {marta: 3};
t('npcLvl clamps at 3', A.npcLvl('marta') === 3);
t('npcFriendshipFactor baseline = 1 below L3', (G.npcFr={}, A.npcFriendshipFactor('brewing')) === 1);
G.npcFr = {marta: 3};
t('L3 NPC contributes its bonus', Math.abs(A.npcFriendshipFactor('brewing') - 1.5) < 1e-9);
G.npcFr = {marta: 3, lotte: 3};
t('L3 NPCs stack multiplicatively across industries', Math.abs(A.npcFriendshipFactor('bar') - 1.4) < 1e-9);

// ── 13. Phase E4 — DOM + key wiring ──
t('craft modal exists in DOM', h.includes('id="craft-modal"') && h.includes('id="craft-pane-craft"') && h.includes('id="craft-pane-gift"'));
t('C key handler opens craft pane', /k==='c'.*showCraft\('craft'\)/.test(h));
t('G key handler opens gift pane', /k==='g'.*showCraft\('gift'\)/.test(h));
t('craft modal swallows C/G/ESC', /craftOpen\(\)\)\{[^}]*closeCraft/.test(h));
t('ingredient drop wired in 5 minigame entry points', (h.match(/dropIng\(/g)||[]).length >= 6);
t('ingredient pool has all 6 ids', new Set(A.CRAFT_ING_POOL.map(i=>i.id)).size === 6);
t('newRunInner initializes E4 state', /G\.inv=\{\};G\.crafted=\[\];G\.npcFr=\{\}/.test(h));
t('sidebar shows ingredient counts', /CRAFT_ING_POOL\.map\(i=>/.test(h));

// ── 14. Phase E4 — balance guard (E4 stack ceiling) ──
// Worst combo: t_sur_all (1.1*) + m_grant (1.25*) + max faction + craft promo (1.15*) + 4 NPC L3
G.npcFr = {marta:3, daan:3, lotte:3, bram:3}; G.crafted = ['promo','brew_bundle','amaro','truffle','atlas','jetlag','spice_rack','perfume'];
G.talents = ['t_sur_all']; G.mutator = 'm_grant'; G.factions = {heineken:100, coffee:100, smartshop:100};
G._run.factionBonus = {brewing: 1.7, coffee: 1.7, shroom: 1.7, bar: 1};
let worstE4 = 0, worstE4D = '';
for (const i of ['brewing','coffee','shroom','surf','academic','bar']) {
  const v = A.talentFactor(i) * A.mutatorFactor(i) * A.factionRepFactor(i) * (G._run.factionBonus[i]||1) * A.craftFactor(i) * A.npcFriendshipFactor(i);
  if (v > worstE4) { worstE4 = v; worstE4D = i; }
}
t(`E4 combo stays sane (worst ${worstE4.toFixed(2)} @ ${worstE4D})`, worstE4 < 16);

// ── 15. Phase A/B/C regression markers still present ──
for (const marker of ['workedToday', 'shoplift', 'escapeIn', 'custRels', 'barStock', 'rollDayObjectives', 'todayWave'])
  t(`Phase A/B/C marker intact: ${marker}`, h.includes(marker));

// ── 16. Phase E5 — Death Cards (灵魂相机) ──
t('CRAZY_POOL defined (12 entries)', /CRAZY_POOL=\[[\s\S]{20,3000}\]/.test(h) && (h.match(/id:'[a-z_]+',weight:1,ic:/g)||[]).length >= 12);
t('tickCrazyEvent wired into advanceTimeAuto', /tickCrazyEvent\(\);/.test(h));
t('undercover sold captures death card', /_dcArch=s\.c\.arch/.test(h) && /G\.deathCards\.push/.test(h));
t('death card blocks 7 days', /G\.shop\.deathBlocked\[[^\]]+\]=G\.day\+7/.test(h));
t('death_card achievement added to ACH_POOL', /id:'death_card',ic:'📸'/.test(h));
t('soul_snatcher achievement added (3+ snatches)', /id:'soul_snatcher'/.test(h));
t('bar spawn filters blocked archetypes', /deathBlocked.*G\.day/.test(h));
t('deathCards reset in newRun', /G\.deathCards=\[\];G\.shop\.deathBlocked=\{\}/.test(h));
t('ufo_blessing hooked into rollDayModifier', /crazyBlessing/.test(h) && /wantPositive=[\s\S]{0,80}crazyBlessing/.test(h));

// ── 17. Phase E8 — Crazy Events shape ──
t('12 crazy event entries', (h.match(/weight:1,ic:'/g)||[]).length >= 12);
t('crazyTipMul wired for tip stacking', /crazyTipMul/.test(h));
t('crazyBrewOrders wired', /crazyBrewOrders/.test(h));
t('crazySurfStam wired', /crazySurfStam/.test(h));
t('crazyFaceMark wired (carnival mask)', /crazyFaceMark/.test(h));
t('crazyMidnight wired (midnight sun)', /crazyMidnight/.test(h));
t('crazySlow wired (canal flood)', /crazySlow/.test(h));
t('crazyBlessing wired (UFO)', /crazyBlessing/.test(h));
t('daily crazy reset on day change', /crazyTipMul=1;[\s\S]{0,200}crazySlow=false/.test(h));
t('newRun resets crazy effects', /G\.shop\.crazyTipMul=1;[\s\S]{0,200}crazySlow=false/.test(h));

// ── 18. Phase E8 — 4% per tick probability (statistical sanity) ──
// Re-parse tickCrazyEvent body to confirm threshold
const crazyMatch = h.match(/function tickCrazyEvent\(\)\{([\s\S]*?)\n\}/);
t('tickCrazyEvent body parsed', !!crazyMatch);
if (crazyMatch) {
  const body = crazyMatch[1];
  t('4% threshold present', />0\.04|>0\.04</.test(body));
  t('skips during minigame', /if\(G\.mg\)return/.test(body));
  t('weighted pick from CRAZY_POOL', /CRAZY_POOL\[/.test(body));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);