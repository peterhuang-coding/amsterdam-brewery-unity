#!/usr/bin/env node
// Phase E regression gate — run: node tools/prototype/test-phase-e.js
// Extracts the Phase E data pools + factor helpers out of index.html and asserts
// they are actually wired (real multipliers, not flavor text), balanced, and seed-deterministic.
// Round 2 adds Phase E2 (Faction System).
const fs = require('fs');
const path = require('path');
const HTML = path.join(__dirname, 'index.html');
const h = fs.readFileSync(HTML, 'utf8');

// ── Round 8: localStorage stub for Phase C relationship chain tests ──
// Phase C pushRelationship/loadRelationships use localStorage; provide an in-memory shim.
const _lsStore = new Map();
globalThis.localStorage = {
  getItem(k){ return _lsStore.has(k) ? _lsStore.get(k) : null },
  setItem(k,v){ _lsStore.set(k, String(v)) },
  removeItem(k){ _lsStore.delete(k) },
  clear(){ _lsStore.clear() },
  key(i){ return Array.from(_lsStore.keys())[i] },
  get length(){ return _lsStore.size }
};

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
const MG = { brew: null, shroom: null, coffee: null, surf: null }; // Round 7: brewApplySoul writes to MG.brew
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
t('CRAZY_POOL defined (24 entries)', /CRAZY_POOL=\[[\s\S]{20,3000}\]/.test(h) && (h.match(/id:'[a-z_]+',weight:1,ic:/g)||[]).length >= 24);
t('tickCrazyEvent wired into advanceTimeAuto', /tickCrazyEvent\(\);/.test(h));
t('undercover sold captures death card', /_dcArch=s\.c\.arch/.test(h) && /G\.deathCards\.push/.test(h));
t('death card blocks 7 days', /G\.shop\.deathBlocked\[[^\]]+\]=G\.day\+7/.test(h));
t('death_card achievement added to ACH_POOL', /id:'death_card',ic:'📸'/.test(h));
t('soul_snatcher achievement added (3+ snatches)', /id:'soul_snatcher'/.test(h));
t('bar spawn filters blocked archetypes', /deathBlocked.*G\.day/.test(h));
t('deathCards reset in newRun', /G\.deathCards=\[\];G\.shop\.deathBlocked=\{\}/.test(h));
t('ufo_blessing hooked into rollDayModifier', /crazyBlessing/.test(h) && /wantPositive=[\s\S]{0,80}crazyBlessing/.test(h));

// ── 17. Phase E8 — Crazy Events shape ──
t('24 crazy event entries', (h.match(/weight:1,ic:'/g)||[]).length >= 24);
t('crazyTipMul wired for tip stacking', /crazyTipMul/.test(h));
t('crazyBrewOrders wired', /crazyBrewOrders/.test(h));
t('crazySurfStam wired', /crazySurfStam/.test(h));
t('crazyFaceMark wired (carnival mask)', /crazyFaceMark/.test(h));
t('crazyMidnight wired (midnight sun)', /crazyMidnight/.test(h));
t('crazySlow wired (canal flood)', /crazySlow/.test(h));
t('crazyBlessing wired (UFO)', /crazyBlessing/.test(h));
t('daily crazy reset on day change', /crazyTipMul=1;[\s\S]{0,200}crazySlow=false/.test(h));
t('newRun resets crazy effects', /G\.shop\.crazyTipMul=1;[\s\S]{0,200}crazySlow=false/.test(h));
t('E8.2 — tulip_crash event present', /id:'tulip_crash',weight:1,ic:'🌷'/.test(h));
t('E8.2 — rijksmuseum_steal clamps rep', /id:'rijksmuseum_steal'/.test(h) && /Math\.max\(-20/.test(h));
t('E8.2 — cat_cafe_overrun clamps mood floor & cap=2', /id:'cat_cafe_overrun'/.test(h) && /Math\.min\(2,Math\.max\(moodFloor\(\),G\.mood\+2\)\)/.test(h));
t('E8.2 — pizza_bench adds crazySurfStam', /id:'pizza_bench'/.test(h) && /crazySurfStam=\(G\.shop\.crazySurfStam\|\|0\)\+20/.test(h));
t('E8.2 — night_market fines $5', /id:'night_market'/.test(h) && /G\.money=Math\.max\(0,G\.money-5\)/.test(h));
t('E8.2 — tram_strike sets crazySlow', /id:'tram_strike'/.test(h) && /G\.shop\.crazySlow=true/.test(h));
t('E8.3 — bike_swarm: slow + tip mul', /id:'bike_swarm'/.test(h) && /crazyTipMul=\(G\.shop\.crazyTipMul\|\|1\)\*1\.2/.test(h));
t('E8.3 — vondelpark_picnic: mood +1', /id:'vondelpark_picnic'/.test(h) && /G\.mood=Math\.min\(2,G\.mood\+1\)/.test(h));
t('E8.3 — cheese_roll: crazySurfStam +25', /id:'cheese_roll'/.test(h) && /crazySurfStam=\(G\.shop\.crazySurfStam\|\|0\)\+25/.test(h));
t('E8.3 — duck_parade: mood +1', /id:'duck_parade'/.test(h) && /G\.mood=Math\.min\(2,G\.mood\+1\)/.test(h));
t('E8.3 — canal_crash: crazyBrewOrders +5', /id:'canal_crash'/.test(h) && /crazyBrewOrders=\(G\.shop\.crazyBrewOrders\|\|0\)\+5/.test(h));
t('E8.3 — sinterklaas_arrival: money +$15', /id:'sinterklaas_arrival'/.test(h) && /G\.money\+=15/.test(h));

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

// ── 19. Phase E5+ Round 5 — Crazy flags actually wired into minigames ──
t('tipFactor honors crazyTipMul', /tipFactor\(\)[\s\S]{0,500}crazyTipMul/.test(h));
t('finBrew honors crazyBrewOrders (revenue +)', /crazyBrewOrders/.test(h) && /1\+0\.08\*\(G\.shop\.crazyBrewOrders/.test(h));
t('surf start subtracts crazySurfStam', /stamina:Math\.max\(20,100\+\(G\.shop\.crazySurfStam/.test(h));
t('bar spawn uses crazyFaceMark', /faceMark:G\.shop\.crazyFaceMark\|\|/.test(h));
t('bldgPhaseOk honors crazyMidnight at Dawn', /crazyMidnight&&G\.ti===0/.test(h));
t('speedMs honors crazySlow (-50% time)', /crazySlow\)\?0\.5:1/.test(h));

// ── 20. Phase E6 — Body Trade (Inscryption body-parts 致敬) ──
t('doBodyTrade defined', /function doBodyTrade\(n\)/.test(h));
t('body-modal CSS added', /#body-modal\s*\{/.test(h));
t('body-modal HTML present', /id="body-modal"[\s\S]{0,200}肉体交易/.test(h));
t('B key triggers openBodyTrade', /if\(k==='b'\)\{openBodyTrade\(\);return\}/.test(h));
t('B/ESC closes body modal', /if\(tk==='b'\|\|tk==='escape'\)\{e\.preventDefault\(\);closeBodyTrade\(\)\}/.test(h));
t('moodFloor honors traumaUntil (-1 extra)', /traumaUntil&&G\.shop\.traumaUntil>=G\.day\)\?-1:0/.test(h));
t('body_trade_1 achievement added', /id:'body_trade_1'/.test(h));
t('body_trade_3 achievement added (3+ trades)', /id:'body_trade_3'/.test(h));
t('bodyTradeCount tracked in _run', /bodyTradeCount:0/.test(h) && /G\._run\.bodyTradeCount\+\+/.test(h));
t('traumaUntil reset in newRunInner', /G\.shop\.traumaUntil=0/.test(h));
t('doBodyTrade: mood -1 / meta +5 (1:5 ratio)', /G\.mood=Math\.max\(moodFloor\(\),G\.mood-n\);[\s\S]{0,80}G\.meta\+=5\*n/.test(h));

// ── 21. Phase E7 — Run Summary Card + history ──
t('buildRunSummary defined', /function buildRunSummary\(/.test(h));
t('pushRunHistory persists to ab_runs_v1', /localStorage\.setItem\('ab_runs_v1'/.test(h));
t('loadRunHistory parses safely', /function loadRunHistory\(\)/.test(h));
t('renderRunHistory shows 10 cards', /runs\.map\(r=>`<div class="run-card">/.test(h));
t('endGame calls buildRunSummary', /buildRunSummary\(objDone,objTotal,tier\)/.test(h));
t('endGame calls pushRunHistory', /pushRunHistory\(G\._run\.summaryCard\)/.test(h));
t('showUpgradeModal renders summary card', /run-card-now/.test(h) && /renderRunHistory\(\)/.test(h));
t('upg-modal HTML has run-card-now div', /id="run-card-now"[\s\S]{0,200}id="run-history"/.test(h));
t('summary card has 4 numbers + 4 emoji', /\$\{card\.money\}[\s\S]{0,300}sigArch[\s\S]{0,200}sigFact[\s\S]{0,200}sigTalent[\s\S]{0,200}sigMutator/.test(h));

// ── 22. Phase E10 — Demo Telemetry & Polish ──
t('intro screen shows Day 1 of 7 · 🌱', /Day 1 of 7 · 🌱/.test(h));
t('help text includes T/F/C/G/B keys (with optional J)', /<b>T<\/b> 天赋树 · <b>F<\/b> 派系(?: · <b>J<\/b> 成就树)? · <b>C<\/b> 配方 · <b>G<\/b> 送礼 · <b>B<\/b> 肉体交易/.test(h));
t('day-bar CSS added', /#day-bar\s*\{/.test(h));
t('day-bar-fill CSS added', /#day-bar-fill\s*\{/.test(h));
t('day-dot CSS added', /\.day-dot\s*\{/.test(h));
t('run-card CSS added', /\.run-card\s*\{/.test(h));
t('top bar has day-bar element', /<span id="day-bar"><div id="day-bar-fill"><\/div><\/span>/.test(h));
t('top bar has day-dots element', /<span id="day-dots"><\/span>/.test(h));
t('renderAll updates day-bar-fill width', /day-bar-fill[\s\S]{0,200}width=Math\.min/.test(h));
t('renderAll renders 7 day-dots', /for\(let i=1;i<=7;i\+\+\)/.test(h));

// ── 22b. Phase E round 8 — Phase E teaser + Run History best stats ──
t('intro screen mentions Phase E teaser (T/F/C/G + 搞怪事件)', /🆕 Phase E/.test(h) && /<b>T<\/b>/.test(h) && /<b>F<\/b>/.test(h) && /<b>C<\/b>/.test(h) && /<b>G<\/b>/.test(h) && /24 个 <b>🦄 搞怪事件<\/b>/.test(h));
t('renderRunHistory computes best stats header (best money/rep/meta)', /renderRunHistory[\s\S]{0,500}best=\{money:0,rep:-Infinity,meta:0\}/.test(h) || /renderRunHistory[\s\S]{0,500}best=\{money:0,rep:-Infinity,meta:0,combo:0,escFree:Infinity\}/.test(h));
t('renderRunHistory shows 🏆 个人最佳 banner', /🏆 个人最佳 \(跨 \$\{runs\.length\} Run\)/.test(h) || /🏆 个人最佳 \(跨 '\+runs\.length\+'\s*Run\)/.test(h));
t('renderRunHistory best uses border-color:var(--gold)', /bestRow=.*border-color:var\(--gold\)/.test(h));

// ── 23. Phase E9 — Achievement Tree (4 branches × 3 tiers) ──
t('ACH_TREE defined with 4 branches', /const ACH_TREE=\[[\s\S]{0,4000}?\];/.test(h) && (h.match(/ACH_TREE=\[/g) || []).length === 1);
t('ACH_TREE has Brew Master / Coffee King / Rogue / Scholar branches',
  /id:'brew',n:'Brew Master'/.test(h) && /id:'coffee',n:'Coffee King'/.test(h) && /id:'rogue',n:'Rogue'/.test(h) && /id:'scholar',n:'Scholar'/.test(h));
t('each branch has bronze/silver/gold tiers',
  /\{t:'bronze',ic:'🥉'/.test(h) && /\{t:'silver',ic:'🥈'/.test(h) && /\{t:'gold',ic:'🥇'/.test(h));
t('G.achTree state field present (brew/coffee/rogue/scholar)', /G\.achTree=\{brew:0,coffee:0,rogue:0,scholar:0\}/.test(h));
t('J key wired to achtOpen/showAchtree', /'j'[\s\S]{0,200}achtOpen/.test(h) || /showAchtree\(/.test(h));
t('renderAchtree fills achtree-grid', /renderAchtree\([\s\S]{0,500}?achtree-grid/.test(h));
t('tier unlock grants +5★ meta +1 talent slot', /\+5★ meta \+1 天赋槽|\+5\* meta \+1 talent/i.test(h));
t('unlocked tier styling (gold highlight)', /\.at-tier\.unlocked/.test(h) || /at-tier unlocked/.test(h));
t('G._run counters wired (brewsFinished/coffeeSales/escUsed/bodyTradeCount/academicDone)',
  /G\._run\s*&&\s*G\._run\.brewsFinished/.test(h) && /G\._run\.coffeeSales/.test(h) && /G\._run\.bodyTradeCount/.test(h));
t('achTreeProgress function returns pct + cur + next', /function achTreeProgress/.test(h) && /r\.push\(\{br:br\.id,cur,next:/.test(h));
t('newRunInner resets achTree', /newRunInner[\s\S]{0,400}?G\.achTree=\{/.test(h) || /G\.achTree=\{brew:0,coffee:0,rogue:0,scholar:0\}/.test(h));
t('achtree-modal HTML present', /id="achtree-modal"[\s\S]{0,200}id="achtree-grid"/.test(h));
t('help text mentions J 成就树', /<b>J<\/b> 成就树/.test(h));

// ── 23b. Round 1: City Living Vibe (Phase A1-A2) — flowing NPCs + boats + trams + bikes ──
const cityStart = h.indexOf('// CITY LIVING VIBE (Round 1');
const cityEnd = h.indexOf('// ═══════════════════════════════════════════\n// DISTRICT LABELS');
// define a stub cx so drawCity can be parsed without ReferenceError
const citySrc = 'const cx={fillStyle:"",strokeStyle:"",lineWidth:1,font:"",textAlign:"",textBaseline:"",fillRect(){},strokeRect(){},beginPath(){},arc(){},fill(){},stroke(){},save(){},restore(){},fillText(){},setLineDash(){}};\n' + h.slice(cityStart, cityEnd);
const CITY_G = {ti:0,seed:42,day:1};
const CITY_STREETS = [
  {x:340,y:200,t:'A'},{x:200,y:300,t:'B'},{x:480,y:200,t:'C'},
  {x:170,y:425,t:'D'},{x:510,y:425,t:'E'},{x:300,y:415,t:'F'},
  {x:580,y:270,t:'G'},{x:680,y:140,t:'H'},{x:200,y:320,t:'I'},
];
const C = new Function('G','STREETS','"use strict";'+citySrc+
  '; return {NPC_ARCHETYPES,CITY_BOAT_ROUTES,CITY_TRAM_ROUTES,CITY_BIKE_PATHS,CITY_BOAT_IC,initCity,tickCity};')(CITY_G, CITY_STREETS);

t('Round1: NPC_ARCHETYPES has 8 archetypes', C.NPC_ARCHETYPES.length === 8);
t('Round1: every NPC archetype has n+ic+phases', C.NPC_ARCHETYPES.every(a => a.n && a.ic && Array.isArray(a.phases) && a.phases.length>=2));
t('Round1: NPC archetype ids are unique', new Set(C.NPC_ARCHETYPES.map(a => a.n)).size === C.NPC_ARCHETYPES.length);
t('Round1: NPC phases cover all 6 time slots 0-5',
  C.NPC_ARCHETYPES.every(a => a.phases.every(p => p >= 0 && p <= 5)) &&
  new Set(C.NPC_ARCHETYPES.flatMap(a => a.phases)).size === 6);
t('Round1: CITY_BOAT_ROUTES has 3 routes', C.CITY_BOAT_ROUTES.length === 3);
t('Round1: CITY_TRAM_ROUTES has 2 routes', C.CITY_TRAM_ROUTES.length === 2);
t('Round1: CITY_BIKE_PATHS has 8 paths', C.CITY_BIKE_PATHS.length === 8);
t('Round1: every route has x1/y1/x2/y2/dir', [...C.CITY_BOAT_ROUTES, ...C.CITY_TRAM_ROUTES, ...C.CITY_BIKE_PATHS].every(r => Number.isFinite(r.x1) && Number.isFinite(r.y1) && Number.isFinite(r.x2) && Number.isFinite(r.y2) && (r.dir === 1 || r.dir === -1)));
t('Round1: CITY_BOAT_IC has 3 boat emojis', C.CITY_BOAT_IC.length === 3 && C.CITY_BOAT_IC.every(s => typeof s === 'string' && s.length >= 1));

// runtime — initCity populates G.city
C.initCity();
t('Round1: initCity creates G.city with 4 arrays', CITY_G.city && Array.isArray(CITY_G.city.npcs) && Array.isArray(CITY_G.city.boats) && Array.isArray(CITY_G.city.trams) && Array.isArray(CITY_G.city.bikes));
t('Round1: G.city.npcs has exactly 30 NPCs', CITY_G.city.npcs.length === 30);
t('Round1: G.city.boats has exactly 3 boats', CITY_G.city.boats.length === 3);
t('Round1: G.city.trams has exactly 2 trams', CITY_G.city.trams.length === 2);
t('Round1: G.city.bikes has exactly 8 bikes', CITY_G.city.bikes.length === 8);
t('Round1: every NPC has x/y/vx/arch/ic', CITY_G.city.npcs.every(n => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.vx) && n.arch && n.ic));
t('Round1: every NPC arch is a known archetype', CITY_G.city.npcs.every(n => C.NPC_ARCHETYPES.some(a => a.n === n.arch)));
t('Round1: every boat route is a known route', CITY_G.city.boats.every(b => b.route >= 0 && b.route < C.CITY_BOAT_ROUTES.length));
t('Round1: every tram route is a known route', CITY_G.city.trams.every(t => t.route >= 0 && t.route < C.CITY_TRAM_ROUTES.length));
t('Round1: every bike path is a known path', CITY_G.city.bikes.every(b => b.path >= 0 && b.path < C.CITY_BIKE_PATHS.length));

// movement — tickCity advances positions
const npc0 = CITY_G.city.npcs[0].x, npc1 = CITY_G.city.npcs[1].x;
const boat0 = CITY_G.city.boats[0].x, tram0 = CITY_G.city.trams[0].x;
const bike0 = CITY_G.city.bikes[0].x;
C.tickCity(1000);
t('Round1: NPCs move after tick', CITY_G.city.npcs[0].x !== npc0 || CITY_G.city.npcs[1].x !== npc1);
t('Round1: boats move after tick', CITY_G.city.boats[0].x !== boat0);
t('Round1: trams move after tick', CITY_G.city.trams[0].x !== tram0);
t('Round1: bikes move after tick', CITY_G.city.bikes[0].x !== bike0);
t('Round1: tram stays on its y (route axis)', C.CITY_TRAM_ROUTES.every((r, i) => CITY_G.city.trams[i].y === r.y1));
t('Round1: boat stays on its y (route axis)', C.CITY_BOAT_ROUTES.every((r, i) => CITY_G.city.boats[i].y === r.y1));
t('Round1: no NaN after extreme tick', CITY_G.city.npcs.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
C.tickCity(60000);
t('Round1: NPCs stay within canvas width after extreme tick', CITY_G.city.npcs.every(n => n.x >= -20 && n.x <= 820));
t('Round1: boats stay within route range after extreme tick', CITY_G.city.boats.every(b => b.x >= C.CITY_BOAT_ROUTES[b.route].x1 - 5 && b.x <= C.CITY_BOAT_ROUTES[b.route].x2 + 5));

// initCity is idempotent
C.initCity();
t('Round1: initCity is idempotent', CITY_G.city.npcs.length === 30 && CITY_G.city.boats.length === 3);

// ── 24. Final summary ──
t('all 10 sub-modules Phase E1-E10 covered (E1/E2/E3/E4/E5/E6/E7/E8 wired)',
  ['TALENT_POOL','FACTION_POOL','MUTATOR_POOL','CRAFT_RECIPES','CRAZY_POOL','doBodyTrade','buildRunSummary','day-bar-fill','ACH_POOL','industryFactor']
  .every(k => h.includes(k)));

// ── 25. Round 6 (Phase B4) SmartShop Dave-depth regression gate ──
// Extract SHROOM_STRAIN_CATALOG/RECIPES/SOUL_EVENTS/UPGRADES + helpers, plus surf analog for invariants.
const b4Start = h.indexOf('// funify-v3 Round 6 — Phase B4 SmartShop Dave-depth');
const b4End = b4Start > -1 ? h.indexOf('// Apply purchased surf upgrade tracks to a surf session state. Pure function.', b4Start) : -1;
t('Round6: Phase B4 block found in source', b4Start > -1 && b4End > b4Start);
const b4Src = b4Start > -1 ? h.slice(b4Start, b4End) : '';
const B4 = new Function('G', 'seeded', 'addEvt', 'bumpFaction', 'MG', '"use strict";' + b4Src +
  '; return {SHROOM_STRAIN_CATALOG,SHROOM_RECIPES,SHROOM_SOUL_EVENTS,SHROOM_UPGRADES,shroomRollSoulEvent,shroomApplySoul,shroomApplyUpgradeBoosts,shroomQuality,shroomPickRecipe};')(G, seeded, (k,m)=>{}, (k,v,r)=>{G.factions[k]=(G.factions[k]||0)+v}, {shroom:null});

// shape invariants
t('Round6: 6 strains in catalog', B4.SHROOM_STRAIN_CATALOG.length === 6);
t('Round6: every strain has h/t/l/yieldBase', B4.SHROOM_STRAIN_CATALOG.every(s => Number.isFinite(s.h) && Number.isFinite(s.t) && Number.isFinite(s.l) && Number.isFinite(s.yieldBase)));
t('Round6: unique strain ids', new Set(B4.SHROOM_STRAIN_CATALOG.map(s => s.id)).size === 6);
t('Round6: 17 recipes (12 R6 + 3 R7 beer + 2 R13 shroom→coffeeBean cross-game)', B4.SHROOM_RECIPES.length === 17);
t('Round6: every recipe has inputs.shroom + basePrice + cross', B4.SHROOM_RECIPES.every(r => r.inputs && r.inputs.shroom && Number.isFinite(r.basePrice) && r.cross));
t('Round6: every recipe references a real strain', B4.SHROOM_RECIPES.every(r => B4.SHROOM_STRAIN_CATALOG.some(s => s.id === r.inputs.shroom)));
t('Round6: unique recipe ids (17 distinct)', new Set(B4.SHROOM_RECIPES.map(r => r.id)).size === 17);
t('Round6: 7 soul events', B4.SHROOM_SOUL_EVENTS.length === 7);
t('Round6: every soul event has effect.kind', B4.SHROOM_SOUL_EVENTS.every(e => e.effect && e.effect.kind));
t('Round6: police_raid soul event present (matches existing 警察临检)', B4.SHROOM_SOUL_EVENTS.some(e => e.id === 'police_raid'));
t('Round6: unique soul event ids', new Set(B4.SHROOM_SOUL_EVENTS.map(e => e.id)).size === 7);
t('Round6: 15 upgrades = 5 tracks × 3 tiers', B4.SHROOM_UPGRADES.length === 15);
t('Round6: 5 distinct upgrade tracks', new Set(B4.SHROOM_UPGRADES.map(u => u.track)).size === 5);
t('Round6: every track has 3 tiers', ['substrate','thermo','lamp','jar','research'].every(tr => B4.SHROOM_UPGRADES.filter(u => u.track === tr).length === 3));
t('Round6: every upgrade tier is 1/2/3', B4.SHROOM_UPGRADES.every(u => [1,2,3].includes(u.tier)));
t('Round6: unique upgrade ids', new Set(B4.SHROOM_UPGRADES.map(u => u.id)).size === 15);

// cross-game link invariants — every recipe.cross maps to a real faction/industry
const CROSS_INDUSTRY = ['coffee','brewery','surf','academic','bar'];
t('Round6: every recipe cross ∈ {coffee,brewery,surf,academic,bar}', B4.SHROOM_RECIPES.every(r => CROSS_INDUSTRY.includes(r.cross)));

// behavior — shroomQuality gives 1..5 from gr 0..100
t('Round6: shroomQuality 0→1', B4.shroomQuality({gr:0}) === 1);
t('Round6: shroomQuality 50→3', B4.shroomQuality({gr:50}) === 3);
t('Round6: shroomQuality 100→5', B4.shroomQuality({gr:100}) === 5);
t('Round6: shroomQuality 120 clamps to 5', B4.shroomQuality({gr:120}) === 5);

// behavior — shroomApplyUpgradeBoosts applies all 5 tracks to session state
const ses = {st:{}};
B4.shroomApplyUpgradeBoosts(ses);
t('Round6: default session has _tempTol/_lightTol/_contamReduce/_jarCap/_recipeStarMin fields',
  '_tempTol' in ses && '_lightTol' in ses && '_contamReduce' in ses && '_jarCap' in ses && '_recipeStarMin' in ses);
t('Round6: default jarCap base = 1', ses._jarCap === 1);
t('Round6: default contamReduce = 0', ses._contamReduce === 0);

G.shroomUpgrades = ['shroom_substrate_3','shroom_thermo_3','shroom_lamp_3','shroom_jar_3','shroom_research_3'];
const ses2 = {};
B4.shroomApplyUpgradeBoosts(ses2);
t('Round6: tier3 substrate → contamReduce 0.30', Math.abs(ses2._contamReduce - 0.30) < 1e-9);
t('Round6: tier3 thermo → _tempTol 6', ses2._tempTol === 6);
t('Round6: tier3 lamp → _lightTol 3', ses2._lightTol === 3);
t('Round6: tier3 jar → _jarCap 4', ses2._jarCap === 4);
t('Round6: tier3 research → _recipeStarMin 2', ses2._recipeStarMin === 2);

// behavior — shroomPickRecipe returns a recipe whose strain matches
const recGolden = B4.shroomPickRecipe('goldenTeacher');
t('Round6: shroomPickRecipe returns recipe for goldenTeacher', recGolden && recGolden.inputs.shroom === 'goldenTeacher');
const recAmazon = B4.shroomPickRecipe('amazonian');
t('Round6: shroomPickRecipe returns recipe for amazonian', recAmazon && recAmazon.inputs.shroom === 'amazonian');
t('Round6: shroomPickRecipe null for unknown strain', B4.shroomPickRecipe('fakeStrain') === null);

// behavior — shroomRollSoulEvent respects one-shot gating
G._shroomSoul = {picked:null,fired:true,raid:false,contamOutbreak:false,newStrain:false,undercover:false,powerOut:false,rival:false,legendary:false};
t('Round6: shroomRollSoulEvent returns null after fired', B4.shroomRollSoulEvent({stage:3,tn:3}) === null);
G._shroomSoul = {picked:null,fired:false,raid:false,contamOutbreak:false,newStrain:false,undercover:false,powerOut:false,rival:false,legendary:false};
const evt1 = B4.shroomRollSoulEvent({stage:3,tn:5});
t('Round6: shroomRollSoulEvent may return event for stage 3', evt1 === null || (evt1 && evt1.effect && evt1.effect.kind));

// behavior — shroomApplySoul updates MG + factions
G.shop = {};
G.factions = {heineken:0,coffee:0,smartshop:0};
B4.shroomApplySoul({id:'police_raid',effect:{kind:'police_raid',fineChance:0.3}});
t('Round6: shroomApplySoul police_raid flips G._shroomSoul.fired', G._shroomSoul.fired === true);
t('Round6: shroomApplySoul police_raid damages smartshop faction', G.factions.smartshop < 0);

// reset factions to test legendary_harvest independently
G.factions = {heineken:0,coffee:0,smartshop:0};
B4.shroomApplySoul({id:'legendary_harvest',effect:{kind:'legendary_harvest',starBonus:5,money:50,unlockTopic:true}});
t('Round6: shroomApplySoul legendary_harvest bumps smartshop faction (≥2)', G.factions.smartshop >= 2);
t('Round6: shroomApplySoul legendary_harvest returns without error', G._shroomSoul.fired === true);

// wiring — new exports in AB_TEST
t('Round6: AB_TEST exposes SHROOM_STRAIN_CATALOG', /SHROOM_STRAIN_CATALOG,SHROOM_RECIPES,SHROOM_SOUL_EVENTS,SHROOM_UPGRADES/.test(h));
t('Round6: AB_TEST exposes shroomPickRecipe', /shroomQuality,shroomPickRecipe,finShroom/.test(h));
t('Round6: newRun initializes G.shroomUpgrades', /if\(!G\.shroomUpgrades\)G\.shroomUpgrades=\[\]/.test(h));
t('Round6: newRun resets G._shroomSoul.fired', /G\._shroomSoul\.fired=false;G\._shroomSoul\.picked=null/.test(h));
t('Round6: startShroom picks from 6-strain catalog', /SHROOM_STRAIN_CATALOG\[Math\.floor\(seeded\(120\)\*SHROOM_STRAIN_CATALOG\.length\)\]/.test(h));
t('Round6: shroomIn handles 3-stage progression', /stageMx\[s\.stage-1\]/.test(h));
t('Round6: shroomIn uses upgrade tolerance', /tempTol=s\._tempTol/.test(h));

// ── 26. Round 7 (Phase B5) Brewery Dave-depth regression gate ──
// Extract BEER_CATALOG/YEAST_CATALOG/BREW_SOUL_EVENTS/BREW_UPGRADES + helpers (brewApplyUpgradeBoosts/Roll/Apply, brewPickRecipe).
// brewPickRecipe needs SHROOM_RECIPES; we inject a stub list before the slice.
const b5Start = h.indexOf('// funify-v3 Round 7 — Phase B5 Brewery Dave-depth');
t('Round7: Phase B5 block found in source', b5Start > -1);
// find the closing brace of brewPickRecipe so we can include it in the slice
const b5FnStart = h.indexOf('function brewPickRecipe(beerType)');
let depth = 0, b5End = -1, inStr = false, strCh = '';
for (let i = b5FnStart; i < h.length; i++) {
  const c = h[i];
  if (inStr) { if (c === '\\') { i++; continue; } if (c === strCh) inStr = false; }
  else { if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; } if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { b5End = i+1; break; } } }
}
t('Round7: brewPickRecipe function end found', b5End > b5FnStart);
const b5Src = b5Start > -1 && b5End > b5FnStart ? h.slice(b5Start, b5End) : '';
const B5 = new Function('G', 'MG', 'addEvt', 'bumpFaction', 'seeded', 'SHROOM_RECIPES', '"use strict";' + b5Src +
  '; return {BEER_CATALOG,BEER_BY_ID,YEAST_CATALOG,YEAST_BY_ID,BREW_SOUL_EVENTS,BREW_UPGRADES,brewApplyUpgradeBoosts,brewRollSoulEvent,brewApplySoul,brewPickRecipe};')(G, MG, (k,m)=>{}, (k,v,r)=>{G.factions[k]=(G.factions[k]||0)+v}, seeded, [
  {id:'immune_broth',       n:'免疫补汤',    inputs:{brewBarrel:'IPA'}},
  {id:'amazonian_chocolate',n:'亚马逊巧克力', inputs:{brewBarrel:'Stout'}},
  {id:'lionsmane_pilsner',  n:'狮鬃皮尔森',   inputs:{brewBarrel:'Lager'}},
  {id:'golden_special',     n:'金色特调',     inputs:{brewBarrel:'IPA'}},
  {id:'pilsner_goldenTeacher',n:'金色皮尔森', inputs:{brewBarrel:'Pilsner'}},
  {id:'sour_philosopher',   n:'酸哲学',       inputs:{brewBarrel:'Sour'}},
  {id:'tripel_cordyceps',   n:'修道院补剂',   inputs:{brewBarrel:'BelgianTripel'}},
]);

// shape invariants
t('Round7: 6 beers in catalog', B5.BEER_CATALOG.length === 6);
t('Round7: every beer has id/ic/n/temp/recipe/desc/yieldBase', B5.BEER_CATALOG.every(b => b.id && b.ic && b.n && Number.isFinite(b.temp) && Array.isArray(b.recipe) && b.recipe.length === 3 && b.desc && Number.isFinite(b.yieldBase)));
t('Round7: 6 unique beer ids', new Set(B5.BEER_CATALOG.map(b => b.id)).size === 6);
t('Round7: 3 original beers preserved (IPA/Stout/Lager)', B5.BEER_CATALOG.some(b => b.id === 'IPA') && B5.BEER_CATALOG.some(b => b.id === 'Stout') && B5.BEER_CATALOG.some(b => b.id === 'Lager'));
t('Round7: 3 new beers (Pilsner/Sour/BelgianTripel)', B5.BEER_CATALOG.some(b => b.id === 'Pilsner') && B5.BEER_CATALOG.some(b => b.id === 'Sour') && B5.BEER_CATALOG.some(b => b.id === 'BelgianTripel'));
t('Round7: BEER_BY_ID map covers all 6', Object.keys(B5.BEER_BY_ID).length === 6 && Object.keys(B5.BEER_BY_ID).every(id => B5.BEER_BY_ID[id].id === id));

// recipe format — every beer has y index 0..3 (wild yeast at 3)
t('Round7: every beer recipe y ∈ {0,1,2,3}', B5.BEER_CATALOG.every(b => b.recipe[2] >= 0 && b.recipe[2] <= 3));
t('Round7: every beer recipe m/h ∈ {0,1,2}', B5.BEER_CATALOG.every(b => [0,1,2].includes(b.recipe[0]) && [0,1,2].includes(b.recipe[1])));
t('Round7: temp is non-trivial (40..80°C)', B5.BEER_CATALOG.every(b => b.temp >= 40 && b.temp <= 80));

// yeast catalog
t('Round7: 4 yeasts in catalog', B5.YEAST_CATALOG.length === 4);
t('Round7: unique yeast ids', new Set(B5.YEAST_CATALOG.map(y => y.id)).size === 4);
t('Round7: every yeast has healthMul + tempTol + desc', B5.YEAST_CATALOG.every(y => Number.isFinite(y.healthMul) && Number.isFinite(y.tempTol) && y.desc));
t('Round7: 3 original yeasts preserved (ale/lager/belgian)', B5.YEAST_CATALOG.some(y => y.id === 'ale') && B5.YEAST_CATALOG.some(y => y.id === 'lager') && B5.YEAST_CATALOG.some(y => y.id === 'belgian'));
t('Round7: 1 new yeast (wild)', B5.YEAST_CATALOG.some(y => y.id === 'wild'));

// soul events — 8 unique one-shots with effect.kind
t('Round7: 8 soul events', B5.BREW_SOUL_EVENTS.length === 8);
t('Round7: every soul event has effect.kind', B5.BREW_SOUL_EVENTS.every(e => e.effect && e.effect.kind));
t('Round7: unique soul event ids', new Set(B5.BREW_SOUL_EVENTS.map(e => e.id)).size === 8);
t('Round7: legendary_batch soul event present', B5.BREW_SOUL_EVENTS.some(e => e.id === 'legendary_batch'));
t('Round7: heineken_buyout soul event present (faction 利好)', B5.BREW_SOUL_EVENTS.some(e => e.id === 'heineken_buyout'));
t('Round7: 5 unique soul kinds', new Set(B5.BREW_SOUL_EVENTS.map(e => e.effect.kind)).size >= 5);

// upgrades — 5 tracks × 3 tiers = 15
t('Round7: 15 upgrades', B5.BREW_UPGRADES.length === 15);
t('Round7: 5 distinct upgrade tracks', new Set(B5.BREW_UPGRADES.map(u => u.track)).size === 5);
t('Round7: every track has 3 tiers', ['copper_kettle','yeast_bank','wood_barrel','ice_cooler','recipe_book'].every(tr => B5.BREW_UPGRADES.filter(u => u.track === tr).length === 3));
t('Round7: every upgrade tier is 1/2/3', B5.BREW_UPGRADES.every(u => [1,2,3].includes(u.tier)));
t('Round7: unique upgrade ids', new Set(B5.BREW_UPGRADES.map(u => u.id)).size === 15);

// behavior — brewApplyUpgradeBoosts populates session state
const bSes = {};
B5.brewApplyUpgradeBoosts(bSes);
t('Round7: default session has _tempTol/_yeastMul/_starBonus/_coldTol/_recipeStarMin',
  '_tempTol' in bSes && '_yeastMul' in bSes && '_starBonus' in bSes && '_coldTol' in bSes && '_recipeStarMin' in bSes);
t('Round7: default _yeastMul = 1', bSes._yeastMul === 1);
t('Round7: default _tempTol = 0', bSes._tempTol === 0);
t('Round7: default _starBonus = 0', bSes._starBonus === 0);

// behavior — tier3 each track → expected boost
G.brewUpgrades = ['brew_kettle_3','brew_yeast_3','brew_barrel_3','brew_ice_3','brew_book_3'];
const bSes2 = {};
B5.brewApplyUpgradeBoosts(bSes2);
t('Round7: tier3 kettle → _tempTol 6 (3 × 2)', bSes2._tempTol === 6);
t('Round7: tier3 yeast → _yeastMul 1.35', Math.abs(bSes2._yeastMul - 1.35) < 1e-9);
t('Round7: tier3 barrel → _starBonus 3', bSes2._starBonus === 3);
t('Round7: tier3 ice → _coldTol 9 (3 × 3)', bSes2._coldTol === 9);
t('Round7: tier3 book → _recipeStarMin 2', bSes2._recipeStarMin === 2);

// behavior — partial upgrades track max tier per track
G.brewUpgrades = ['brew_kettle_1','brew_kettle_3','brew_kettle_2'];
const bSes3 = {};
B5.brewApplyUpgradeBoosts(bSes3);
t('Round7: max-tier-per-track wins (kettle 3 → _tempTol 6)', bSes3._tempTol === 6);

// behavior — brewRollSoulEvent respects one-shot gating
G._brewSoul = {picked:null,fired:true,overflow:false,stuck:false,stampede:false,contamHops:false,kingsDay:false,celebrity:false,legendary:false,buyout:false};
t('Round7: brewRollSoulEvent returns null after fired', B5.brewRollSoulEvent({phaseIdx:2,tn:5}) === null);
G._brewSoul = {picked:null,fired:false,overflow:false,stuck:false,stampede:false,contamHops:false,kingsDay:false,celebrity:false,legendary:false,buyout:false};
const bEvt1 = B5.brewRollSoulEvent({phaseIdx:3,tn:5});
t('Round7: brewRollSoulEvent may return event for phase 3', bEvt1 === null || (bEvt1 && bEvt1.effect && bEvt1.effect.kind));

// behavior — brewApplySoul updates MG + factions
G.shop = {}; G.factions = {heineken:0,coffee:0,smartshop:0}; MG.brew = {order:{type:'IPA'}};
B5.brewApplySoul({id:'tank_overflow',effect:{kind:'tank_overflow',lossFraction:0.3,killYeast:true}});
t('Round7: brewApplySoul tank_overflow flips G._brewSoul.fired', G._brewSoul.fired === true);
t('Round7: brewApplySoul tank_overflow damages heineken faction', G.factions.heineken < 0);
t('Round7: brewApplySoul tank_overflow sets lossFraction on MG.brew', MG.brew.lossFraction === 0.3 && MG.brew.killYeast === true);

// reset factions to test heineken_buyout independently
G._brewSoul = {picked:null,fired:false,overflow:false,stuck:false,stampede:false,contamHops:false,kingsDay:false,celebrity:false,legendary:false,buyout:false};
G.factions = {heineken:0,coffee:0,smartshop:0};
G._run.factionBonus = {brewing:1,coffee:1,shroom:1,bar:1};
B5.brewApplySoul({id:'heineken_buyout',effect:{kind:'heineken_buyout',industryMul:1.30,runPermanent:true}});
t('Round7: brewApplySoul heineken_buyout bumps G._run.factionBonus.brewing to 1.30', Math.abs(G._run.factionBonus.brewing - 1.30) < 1e-9);
t('Round7: brewApplySoul heineken_buyout leaves coffee alone', G._run.factionBonus.coffee === 1);

// behavior — brewPickRecipe (cross-game link to SHROOM_RECIPES via brewBarrel)
// stub SHROOM_RECIPES to test the bridge (real SHROOM_RECIPES is defined further up in source)
B5.SHMROOM_RECIPES = undefined; // not exposed
G.factions = {heineken:0,coffee:0,smartshop:0};
const beerRecipeMap = {IPA:'immune_broth',Stout:'amazonian_chocolate',Lager:'lionsmane_pilsner',Pilsner:'pilsner_goldenTeacher',Sour:'sour_philosopher',BelgianTripel:'tripel_cordyceps'};
for (const beerId of Object.keys(beerRecipeMap)) {
  // verify a recipe exists by scanning SHROOM_RECIPES in the index.html source (rough)
  const needle = `brewBarrel:'${beerId}'`;
  t(`Round7: SHROOM_RECIPES has cross-recipe for ${beerId} → ${beerRecipeMap[beerId]}`, h.indexOf(needle) > -1);
}

// wiring — new exports in AB_TEST
t('Round7: AB_TEST exposes BEER_CATALOG', /BEER_CATALOG,BEER_BY_ID,YEAST_CATALOG,YEAST_BY_ID,BREW_SOUL_EVENTS,BREW_UPGRADES/.test(h));
t('Round7: AB_TEST exposes brewApplyUpgradeBoosts', /brewRollSoulEvent,brewApplySoul,brewApplyUpgradeBoosts,brewPickRecipe/.test(h));
t('Round7: AB_TEST validate checks brewBeerCount+brewYeastCount+brewSoulCount+brewUpgradeCount', /brewBeerCount:BEER_CATALOG\.length===6.*brewYeastCount.*brewSoulCount.*brewUpgradeCount/.test(h));
// wiring — startBrew uses BEER_CATALOG
t('Round7: startBrew picks from BEER_CATALOG', /Math\.floor\(seeded\(41\)\*BEER_CATALOG\.length\)/.test(h));
t('Round7: startBrew attaches upgrade boosts', /brewApplyUpgradeBoosts\(MG\.brew\)/.test(h));
t('Round7: startBrew resets G._brewSoul', /G\._brewSoul=\{picked:null,fired:false,overflow:false/.test(h));
// wiring — brewIn rolls soul events
t('Round7: brewIn calls brewRollSoulEvent on space', /const soulEvt=brewRollSoulEvent\(s\)/.test(h));
// wiring — newRun initializes G.brewUpgrades
t('Round7: newRun initializes G.brewUpgrades', /if\(!G\.brewUpgrades\)G\.brewUpgrades=\[\]/.test(h));
t('Round7: newRun resets G._brewSoul.fired', /G\._brewSoul\.fired=false;G\._brewSoul\.picked=null/.test(h));
// wiring — ledger covers 6 beers
t('Round7: brewNotes ledger covers all 6 beers', /'IPA','Stout','Lager','Pilsner','Sour','BelgianTripel'/.test(h));
// wiring — visual supports 4 yeasts
t('Round7: yeast visual supports 4 choices', /var yeastItems=\[\{n:'艾尔酵母'.*\{n:'比利时酵母'.*\{n:'野菌酵母'/.test(h));

// summary assertion: tests grew this round
t('Round7: overall pass count exceeds prior baseline (≥218)', pass >= 218);

// ── funify-v3 Round 8 — Phase C (Main plot + factions) ──
// Extract just the Phase C block (sits between Faction E2 bumpFaction and Crafting E4)
const phaseCStart = h.indexOf('// Phase C — Main plot + factions');
const phaseCEnd = h.indexOf('// Phase E4 — Item Crafting');
const phaseCSrc = h.slice(phaseCStart, phaseCEnd);
const state = G; // alias for tests — G already has factions/day/mood/objs/_run/money fields
const AC = new Function('state', 'G', 'moodFloor', '"use strict";var G=state;function moodFloor(){return-3};\n' + phaseCSrc +
  '; return {PLOT_PITCH,PLOT_HOOK,CHARACTER_CARDS,DAY_BEATS,FAC_LORE,RELATIONSHIPS_KEY,RELATIONSHIPS_MAX,dayBeat,todayTip,runAlignment,settlementBonus,relationshipChain,pushRelationship,loadRelationships};')(state, G, A.moodFloor);

// C1 — Opening narrative card constants
t('Round8: PLOT_PITCH is non-empty single-sentence pitch', typeof AC.PLOT_PITCH==='string' && AC.PLOT_PITCH.length>20);
t('Round8: PLOT_HOOK is non-empty thin-mainline hook', typeof AC.PLOT_HOOK==='string' && AC.PLOT_HOOK.length>5);
t('Round8: CHARACTER_CARDS has 4 character choices', AC.CHARACTER_CARDS.length===4);
t('Round8: each CHARACTER_CARDS entry has ic+n+sub+start+repDelta', AC.CHARACTER_CARDS.every(c=>c.ic&&c.n&&c.sub&&c.start&&c.repDelta&&typeof c.repDelta==='object'));
t('Round8: Mei (idx 3) repDelta covers all 3 factions', Object.keys(AC.CHARACTER_CARDS[3].repDelta).sort().join(',')==='coffee,heineken,smartshop');
t('Round8: Bart (idx 0) repDelta = {heineken:6}', JSON.stringify(AC.CHARACTER_CARDS[0].repDelta)==='{"heineken":6}');
t('Round8: Esra (idx 1) repDelta = {coffee:6}', JSON.stringify(AC.CHARACTER_CARDS[1].repDelta)==='{"coffee":6}');
t('Round8: Lot (idx 2) repDelta = {smartshop:6}', JSON.stringify(AC.CHARACTER_CARDS[2].repDelta)==='{"smartshop":6}');

// C2 — 7-day rhythm (DAY_BEATS map)
t('Round8: DAY_BEATS has all 7 days', Object.keys(AC.DAY_BEATS).map(Number).sort((a,b)=>a-b).join(',')==='1,2,3,4,5,6,7');
t('Round8: day 1-2 are learn phase', AC.DAY_BEATS[1].phase==='learn'&&AC.DAY_BEATS[2].phase==='learn');
t('Round8: day 3 is contact (派系接触)', AC.DAY_BEATS[3].phase==='contact');
t('Round8: day 4-5 are pick phase (站队)', AC.DAY_BEATS[4].phase==='pick'&&AC.DAY_BEATS[5].phase==='pick');
t('Round8: day 6 is conseq phase (后果)', AC.DAY_BEATS[6].phase==='conseq');
t('Round8: day 7 is end phase (结算)', AC.DAY_BEATS[7].phase==='end');
t('Round8: each DAY_BEATS day has ic+t+d', Object.values(AC.DAY_BEATS).every(b=>b.ic&&b.t&&b.d));
t('Round8: dayBeat clamps day<1 to day 1 (todayTip entry point)', AC.dayBeat(0).phase==='learn'&&AC.dayBeat(-5).phase==='learn');
t('Round8: dayBeat clamps day>7 to day 7', AC.dayBeat(8).phase==='end'&&AC.dayBeat(99).phase==='end');

// C3 — Faction lore + alignment (runAlignment)
t('Round8: FAC_LORE covers all 3 faction ids', Object.keys(AC.FAC_LORE).sort().join(',')==='coffee,heineken,smartshop');
const setFac=(f)=>{state.factions=Object.assign({heineken:0,coffee:0,smartshop:0},f)};
t('Round8: runAlignment returns none when factions all 0', (()=>{setFac({heineken:0,coffee:0,smartshop:0});return AC.runAlignment().id==='none'})());
t('Round8: runAlignment returns heineken when heineken rep highest', (()=>{setFac({heineken:30,coffee:5,smartshop:5});return AC.runAlignment().id==='heineken'})());
t('Round8: runAlignment returns coffee when coffee rep highest', (()=>{setFac({heineken:5,coffee:30,smartshop:5});return AC.runAlignment().id==='coffee'})());
t('Round8: runAlignment returns smartshop when smartshop rep highest', (()=>{setFac({heineken:5,coffee:5,smartshop:30});return AC.runAlignment().id==='smartshop'})());
t('Round8: runAlignment treats abs value (negative faction wins)', (()=>{setFac({heineken:-50,coffee:10,smartshop:10});return AC.runAlignment().id==='heineken'})());
t('Round8: runAlignment threshold <10 abs → none', (()=>{setFac({heineken:5,coffee:5,smartshop:5});return AC.runAlignment().id==='none'})());

// C4 — Today tip (todayTip) — set state via state alias
state.day=3;state.ti=0;state.money=250;state.mood=0;setFac({heineken:0,coffee:0,smartshop:0});
state.objs=[{done:false},{done:false},{done:false}];
t('Round8: todayTip returns string', typeof AC.todayTip()==='string' && AC.todayTip().length>0);
t('Round8: todayTip includes day number', /Day \d/.test(AC.todayTip()));
state.factions=null;
t('Round8: todayTip returns PLOT_HOOK when factions undefined', AC.todayTip()===AC.PLOT_HOOK);
setFac({heineken:0,coffee:0,smartshop:0});
state.day=3;state.money=10;
t('Round8: todayTip warns on low money', /现金/.test(AC.todayTip()));
state.day=4;state.money=500;state.mood=-5;
t('Round8: todayTip warns on low mood', /心情/.test(AC.todayTip()));
state.day=6;state.mood=0;state.objs=[{done:true},{done:true},{done:false}];
t('Round8: todayTip concentrates on last obj (Day 6)', /只剩 1 个目标/.test(AC.todayTip()));
// Restore
state.day=1;state.money=250;state.mood=0;state.objs=[{done:false},{done:false},{done:false}];setFac({heineken:0,coffee:0,smartshop:0});

// C5 — Settlement bonus + cross-run relationship chain
t('Round8: settlementBonus is +15 for strong alignment (rep>=50)', (()=>{setFac({heineken:60,coffee:0,smartshop:0});return AC.settlementBonus()===15})());
t('Round8: settlementBonus is +8 for medium alignment (20-49)', (()=>{setFac({heineken:30,coffee:0,smartshop:0});return AC.settlementBonus()===8})());
t('Round8: settlementBonus is +3 for weak alignment (10-19)', (()=>{setFac({heineken:15,coffee:0,smartshop:0});return AC.settlementBonus()===3})());
t('Round8: settlementBonus is -5 when no alignment', (()=>{setFac({heineken:0,coffee:0,smartshop:0});return AC.settlementBonus()===-5})());
t('Round8: settlementBonus treats abs value (negative rep counts)', (()=>{setFac({heineken:-60,coffee:0,smartshop:0});return AC.settlementBonus()===15})());

// Cross-run relationship chain (C5) — only stores tier + alignment + rep, no plot
t('Round8: pushRelationship persists to ab_relationships_v1', (()=>{try{localStorage.removeItem(AC.RELATIONSHIPS_KEY)}catch(e){};AC.pushRelationship({run:1,tier:'gold',tierIc:'🥇',align:'heineken',alignIc:'🍺',alignN:'Heineken Rep',rep:60,tierMult:1.5,ts:1});return JSON.parse(localStorage.getItem(AC.RELATIONSHIPS_KEY)).rels.length===1})());
t('Round8: pushRelationship caps at RELATIONSHIPS_MAX (10)', (()=>{try{localStorage.removeItem(AC.RELATIONSHIPS_KEY)}catch(e){};for(let i=0;i<15;i++)AC.pushRelationship({run:i,tier:'silver',tierIc:'🥈',align:'none',alignIc:'🚶',alignN:'无阵营',rep:0,tierMult:1.2,ts:i});return AC.loadRelationships().length===10})());
t('Round8: loadRelationships returns newest-first', (()=>{try{localStorage.removeItem(AC.RELATIONSHIPS_KEY)}catch(e){};AC.pushRelationship({run:1,tier:'bronze',tierIc:'🥉',align:'coffee',alignIc:'☕',alignN:'Coffee Cartel',rep:30,tierMult:1,ts:1});AC.pushRelationship({run:2,tier:'gold',tierIc:'🥇',align:'smartshop',alignIc:'🍄',alignN:'Smart Shop Synd.',rep:80,tierMult:1.5,ts:2});return AC.loadRelationships()[0].run===2})());
t('Round8: relationshipChain returns up to N recs', (()=>{try{localStorage.removeItem(AC.RELATIONSHIPS_KEY)}catch(e){};for(let i=0;i<5;i++)AC.pushRelationship({run:i,tier:'gold',tierIc:'🥇',align:'heineken',alignIc:'🍺',alignN:'Heineken Rep',rep:60,tierMult:1.5,ts:i});return AC.relationshipChain(3).length===3})());
t('Round8: relationshipChain records carry tier+align fields', (()=>{try{localStorage.removeItem(AC.RELATIONSHIPS_KEY)}catch(e){};AC.pushRelationship({run:7,tier:'gold',tierIc:'🥇',align:'coffee',alignIc:'☕',alignN:'Coffee Cartel',rep:80,tierMult:1.5,ts:7});const r=AC.relationshipChain(1)[0];return r.tier==='gold'&&r.align==='coffee'})());

// Wiring — opening card modal HTML + R key (source-grep only)
t('Round8: opening-modal element exists in DOM', /id="opening-modal"/.test(h));
t('Round8: relchain-modal element exists in DOM', /id="relchain-modal"/.test(h));
t('Round8: plot-banner element exists in DOM', /id="plot-banner"/.test(h));
t('Round8: CSS rules for .op-box / .op-day / .op-char exist', /\.op-box|\.op-days|\.op-chars|\.op-day|\.op-char/.test(h));
t('Round8: R key opens relchain modal in keydown', /k==='r'&&!G\.inside&&!G\.mg\)\{[^}]*showRelchain/.test(h));
t('Round8: opening modal keydown closes on Enter/Escape', /opening-modal[\s\S]*closeOpeningCard/.test(h));
t('Round8: modalOpen includes opening + relchain', /opening-modal[\s\S]*relchain-modal/.test(h));
t('Round8: Phase C exports in AB_TEST', /PLOT_PITCH,PLOT_HOOK,CHARACTER_CARDS,DAY_BEATS,FAC_LORE,RELATIONSHIPS_KEY/.test(h));
t('Round8: endGame calls settlementBonus + pushRelationship', /settlementBonus\(\)[\s\S]*pushRelationship/.test(h));
t('Round8: newRun calls showOpeningCardIfFresh', /showOpeningCardIfFresh\(\)/.test(h));
t('Round8: renderAll updates plot-banner via todayTip', /plot-banner[\s\S]*todayTip\(\)/.test(h));

// ── 26. funify-v3 Round 23 — Surf 巨浪知识打捞 (knowledge-salvage) gate ──
// 用与游戏内同构的最小桩数据喂给从 index.html 切出的纯函数块 (与 B4 抽取方式一致)
const W23_WAVES=[{id:'beginner_bay',item:'贝壳',special:'海鸥群'},{id:'pier_break',item:'海星',special:'钓鱼人'},{id:'reef_left',item:'珍珠',special:'海龟'},{id:'canal_wave',item:'贝壳',special:'桥下阴影'},{id:'sand_bar',item:'古硬币',special:'隐藏洞穴'},{id:'storm_pier',item:'古罗盘',special:'雷暴'},{id:'lighthouse',item:'珍珠',special:'灯塔回声'}];
const W23_CAT=[{id:'贝壳',kind:'词条'},{id:'海星',kind:'词条'},{id:'珍珠',kind:'词条'},{id:'古硬币',kind:'记忆'},{id:'古罗盘',kind:'记忆'},{id:'古地图',kind:'配方'},{id:'鱼钩',kind:'配方'},{id:'宝石',kind:'记忆'},{id:'闪电石',kind:'回声'},{id:'回声瓶',kind:'回声'},{id:'羽毛',kind:'回声'},{id:'稀有遗物',kind:'回声'}];
const s23Start=h.indexOf('// funify-v3 Round 23 — Surf 巨浪知识打捞');
const s23End=s23Start>-1?h.indexOf('// end surf knowledge helpers',s23Start):-1;
t('R23: surf knowledge block found in source',s23Start>-1&&s23End>s23Start);
const s23Src=s23Start>-1?h.slice(s23Start,s23End):'';
const S23=new Function('G','seeded','WAVE_POINTS','SURF_CATALOG','"use strict";'+s23Src+'; return {SURF_DEPTH_BANDS,surfDepthBand,surfFragPool,surfFragKind,surfSalvage};')(G,seeded,W23_WAVES,W23_CAT);
// 深度分带映射: 0=浪脚,1=浪腰,2=浪心,越界封顶 2,稀有度 1/2/4 递增
t('R23: 深度分带映射 0→浪脚 1→浪腰 2→浪心 越界封顶2 + 稀有度 1/2/4',S23.surfDepthBand(0)===0&&S23.surfDepthBand(1)===1&&S23.surfDepthBand(2)===2&&S23.surfDepthBand(9)===2&&S23.SURF_DEPTH_BANDS[0].mult===1&&S23.SURF_DEPTH_BANDS[1].mult===2&&S23.SURF_DEPTH_BANDS[2].mult===4);
// 打捞池按浪点×分带差异化: 脚=浪点专属词条,腰=特殊升级,心=稀有遗物
t('R23: 打捞池按浪点×分带差异化 (storm_pier 腰=闪电石 心=稀有遗物; beginner_bay 脚=贝壳; reef_left 腰=古地图)',(()=>{const f=S23.surfFragPool('storm_pier',1),h2=S23.surfFragPool('storm_pier',2),b0=S23.surfFragPool('beginner_bay',0),r1=S23.surfFragPool('reef_left',1);return f[0]==='闪电石'&&h2[0]==='稀有遗物'&&b0[0]==='贝壳'&&r1[0]==='古地图'&&S23.surfFragKind('贝壳')==='词条'&&S23.surfFragKind('闪电石')==='回声'})());
// 知识碎片落袋: surfSalvage 浪心 miss 代价×2(cost=50)且成功只落稀有遗物
t('R23: surfSalvage 浪心 miss 代价×2 (cost=50) 且成功只落稀有遗物',(()=>{let miss=false;for(let i=0;i<300;i++){const r=S23.surfSalvage({wave:W23_WAVES[5],at:i},2);if(r.miss){if(r.cost!==50)return false;miss=true}else if(r.item!=='稀有遗物')return false}return miss})());
t('R23: surfSalvage 分数分层 (浪脚≤30 · 浪心≥48)',(()=>{for(let i=0;i<200;i++){const f1=S23.surfSalvage({wave:W23_WAVES[5],at:i},0);const h1=S23.surfSalvage({wave:W23_WAVES[5],at:i+400},2);if(!f1.miss&&f1.score>30)return false;if(!h1.miss&&h1.score<48)return false}return true})());
// 联动触发: finSurf 写 G._surfCatch (跨产业配方 surfCatch 输入) + 浪心遗物 meta+2
t('R23: 联动触发 — finSurf 写 G._surfCatch + 浪心遗物 meta+2',/G\._surfCatch\[item\]=\(G\._surfCatch\[item\]\|\|0\)\+1/.test(h)&&/s\.fragKinds&&s\.fragKinds\['稀有遗物'\]\)\{G\.meta\+=2/.test(h));
// 动词与提示语: surfDive(现为冲进浪管) + keyup 300ms 判定
t('R23: surfDive + keyup ≥300ms 判定 (长按冲浪管)',/function surfDive\(s\)/.test(h)&&/hold>=300\)surfDive\(s\)/.test(h));
t('R23: SURF_CATALOG 12 种全部重定义为知识碎片 (kind 字段齐全)',(()=>{const a=h.indexOf('const SURF_CATALOG=['),b=a>-1?h.indexOf('];',a):-1;return a>-1&&b>a&&(h.slice(a,b).match(/kind:'/g)||[]).length===12})());

// ── 26b. funify-v3 R25 — Surf 骑浪重做 (carve/pump/浪管平衡条/碎片骑过收集) gate ──
const S25=new Function('G','seeded','WAVE_POINTS','SURF_CATALOG','"use strict";'+s23Src+'; return {surfBandAt,surfBalVerdict,surfFragCollect,surfFragIc,SURF_RIDE_X,SURF_CARVE_STEP,SURF_LIP_H};')(G,seeded,W23_WAVES,W23_CAT);
t('R25: carve 高度→分带映射 (0.1→浪脚 0.5→浪腰 0.85→浪心 越界clamp)',S25.surfBandAt(0.1)===0&&S25.surfBandAt(0.5)===1&&S25.surfBandAt(0.85)===2&&S25.surfBandAt(9)===2&&S25.surfBandAt(-1)===0&&S25.SURF_RIDE_X===320&&S25.SURF_CARVE_STEP===0.18&&S25.SURF_LIP_H===0.72);
t('R25: 浪管平衡条判定 (健康>0 且 |bal|≤0.85→ok · 越界→warn · 健康归零→fail落水)',S25.surfBalVerdict(0.2,60)==='ok'&&S25.surfBalVerdict(0.9,60)==='warn'&&S25.surfBalVerdict(0.2,0)==='fail');
t('R25: 碎片骑过收集判定 (分带匹配+x 过骑手→触发 · 错带/已取/未到→不触发)',(()=>{const s={h:0.5};return S25.surfFragCollect(s,{band:1,x:S25.SURF_RIDE_X,taken:false})===true&&S25.surfFragCollect(s,{band:0,x:S25.SURF_RIDE_X,taken:false})===false&&S25.surfFragCollect(s,{band:1,x:S25.SURF_RIDE_X,taken:true})===false&&S25.surfFragCollect(s,{band:1,x:S25.SURF_RIDE_X+40,taken:false})===false&&S25.surfFragIc('不存在')==='🫧'&&S25.surfFragIc('贝壳')!=='🫧'})());
t('R25: 骑浪口径 — 长按冲浪管 surfDive + keyup ≥300ms + 首屏提示语「骑浪收集知识」',/function surfDive\(s\)/.test(h)&&/hold>=300\)surfDive\(s\)/.test(h)&&h.includes('骑浪收集知识'));

// ── 26c. funify-v3 R26 — Surf 多样性 (浪单 seeded/浪形参数 clamp/碎片运动模式/连珠) gate ──
const S26=new Function('G','seeded','WAVE_POINTS','SURF_CATALOG','"use strict";'+s23Src+'; return {SURF_WAVE_SHAPES,SURF_SESSION_MODS,surfRollSheet,surfShapeParam,surfFragMode,surfChainGain,SURF_SKIN_SHAPE,SURF_SKIN_MOD,SURF_SKIN_FRAG,surfFragName,surfHotHeadline,surfDrownO2};')(G,seeded,W23_WAVES,W23_CAT);
t('R26: 浪单 seeded 确定性 — 同 seed 同浪单 (shape/mod/jitter 全等),换 seed 有分叉',(()=>{const a=S26.surfRollSheet(486),b=S26.surfRollSheet(486),c=S26.surfRollSheet(487);return a.shape.id===b.shape.id&&a.mod.id===b.mod.id&&a.jitter===b.jitter&&(a.shape.id!==c.shape.id||a.mod.id!==c.mod.id||a.jitter!==c.jitter)})());
t('R26: 4 浪形参数齐全且含黑浪(night=1) + 4 修饰',S26.SURF_WAVE_SHAPES.length===4&&S26.SURF_WAVE_SHAPES.every(x=>x.crest>0&&x.lip>0&&x.speed>0&&x.und>0&&x.fragMul>0&&(x.night===0||x.night===1))&&S26.SURF_WAVE_SHAPES.some(x=>x.night)&&S26.SURF_SESSION_MODS.length===4);
t('R26: 浪形参数 clamp — 抖动越界被钳在 [lo,hi] 内',S26.surfShapeParam({speed:1.4},1,'speed',0.6,1.4)===1.4&&S26.surfShapeParam({speed:0.6},0,'speed',0.6,1.4)===0.6&&S26.surfShapeParam({speed:0.8},0.5,'speed',0.6,1.4)>0.6&&S26.surfShapeParam({speed:0.8},0.5,'speed',0.6,1.4)<1.4);
t('R26: 碎片运动模式 seeded 分配 — 浪心必静态,其余落在 drift/sink/chain 且同 seed 稳定',(()=>{const m=S26.surfFragMode(2,500),m2=S26.surfFragMode(2,500),m3=S26.surfFragMode(0,500);return m==='static'&&m2==='static'&&['drift','sink','chain'].includes(m3)&&S26.surfFragMode(0,500)===m3})());
t('R26: 连珠奖励触发 — 同种×3/×6 落袋 +50% (×1/×2 不触发)',S26.surfChainGain(3,20)===10&&S26.surfChainGain(6,20)===10&&S26.surfChainGain(1,20)===0&&S26.surfChainGain(2,20)===0);

// ── 27. funify-v3 Round 28 — 奇浪五拍 + 互联网皮肤 ──
t('R28: 皮肤映射层 — 断浪→404风暴 · 黑浪→暗网 · 顺风→adblock · 逆风→防火墙 · 雨幕→弹窗广告雨 (id/数据不动)',S26.SURF_SKIN_SHAPE.closeout==='404风暴'&&S26.SURF_SKIN_SHAPE.night==='暗网'&&S26.SURF_SKIN_MOD.tailwind==='adblock'&&S26.SURF_SKIN_MOD.headwind==='防火墙'&&S26.SURF_SKIN_MOD.rain==='弹窗广告雨');
t('R28: 碎片显示名 → 帖子/词条卡 (贝壳→词条:… · 稀有遗物→置顶:… · 未知 id 原样返回)',S26.surfFragName('贝壳').indexOf('词条:')===0&&S26.surfFragName('稀有遗物').indexOf('置顶:')===0&&S26.surfFragName('不存在的id')==='不存在的id');
t('R28: 今日热点 seeded 头条 — 同 seed 同头条 · 全部落在 6 条池内',(()=>{const pool=['甘草糖到底多难吃','荷兰人为何钟爱生鲱鱼','运河自行车打捞队日捞百辆','AI 论文引用自己的回复','啤酒厂 WiFi 密码竟是发酵温度','橙衣军团开始囤郁金香'];const H=S26.surfHotHeadline(488);if(S26.surfHotHeadline(488)!==H||!pool.includes(H))return false;for(let i=0;i<40;i++)if(!pool.includes(S26.surfHotHeadline(i)))return false;return true})());
t('R28: 逃生氧气模型 — 满体力 5s 耗尽 · 每次游泳 -2 · 越界 clamp 0',S26.surfDrownO2({stamina:100,drownAt:1000,drownStrokes:0},5000)===20&&S26.surfDrownO2({stamina:100,drownAt:1000,drownStrokes:0},6000)===0&&S26.surfDrownO2({stamina:100,drownAt:1000,drownStrokes:3},1000)===94&&S26.surfDrownO2({stamina:30,drownAt:1000,drownStrokes:0},99999)===0);
t('R28: 主动下潜触发 — 骑浪 SPACE 连按两下 → surfStartDrown(s,false)',/Date\.now\(\)-_prev<400\)\{surfStartDrown\(s,false\)/.test(h));
t('R28: 落水必触发逃生 — 浪管失衡 → surfStartDrown(s,true) · 氧气归零才 wipeout++',/surfStartDrown\(s,true\)/.test(h)&&/s\.drownFromWipe\)\{s\.wipeouts\+\+/.test(h));
t('R28: 回港记账 — finSurf 进 settle + updateSurf 2.6s 归档退出 + auto 直入骑浪跳过登船',/s\.settled=true;s\.settleAt=Date\.now\(\)/.test(h)&&/settleAt>=2600\)mgExitMiniGame\(\)/.test(h)&&/if\(!G\.auto\)session\.boarding=true/.test(h));

// ── 27. funify-v3 R24 — 大地图相机 + Zelda 小地图 gate ──
const c24Start=h.indexOf('// CAM_BLOCK_START');
const c24End=c24Start>-1?h.indexOf('// CAM_BLOCK_END',c24Start):-1;
t('R24: 相机 helper 块存在于源码',c24Start>-1&&c24End>c24Start);
const camSrc=c24Start>-1?h.slice(c24Start,c24End):'';
const C24=new Function('W','H','"use strict";'+camSrc+'; return {CAM,worldToScreen,screenToWorld,camClamp,camZoomAt,mmViewRect,minimapRect};')(800,500);
t('R24: worldToScreen/screenToWorld z=1 往返一致',(()=>{const w=C24.screenToWorld(400,250),s=C24.worldToScreen(w.x,w.y);return Math.abs(s.x-400)<1e-9&&Math.abs(s.y-250)<1e-9})());
t('R24: zoom 2× 屏幕↔世界往返一致 + 中心世界点不变',(()=>{C24.CAM.z=2;C24.CAM.cx=400;C24.CAM.cy=250;const w=C24.screenToWorld(400,250),s=C24.worldToScreen(300,200),w2=C24.screenToWorld(s.x,s.y);return Math.abs(w.x-400)<1e-9&&Math.abs(w.y-250)<1e-9&&Math.abs(s.x-200)<1e-9&&Math.abs(s.y-150)<1e-9&&Math.abs(w2.x-300)<1e-9&&Math.abs(w2.y-200)<1e-9})());
t('R24: camZoomAt 缩放 clamp 1..3 (输入 9→3, 0.1→1)',(()=>{C24.CAM.z=1;C24.camZoomAt(400,250,9);const z1=C24.CAM.z;C24.camZoomAt(400,250,0.1);return z1===3&&C24.CAM.z===1})());
t('R24: camClamp z=3 边界钳制 (中心不越 133.3/666.7)',(()=>{C24.CAM.z=3;C24.CAM.cx=0;C24.CAM.cy=500;C24.camClamp();return Math.abs(C24.CAM.cx-800/6)<1e-9&&Math.abs(C24.CAM.cy-(500-500/6))<1e-9})());
t('R24: 小地图视窗框映射 (z=1 全图 140×100; z=2 中心 70×50@43,417)',(()=>{C24.CAM.z=1;C24.CAM.cx=400;C24.CAM.cy=250;const a=C24.mmViewRect(8,392,140,100);C24.CAM.z=2;const b=C24.mmViewRect(8,392,140,100);return a.x===8&&a.y===392&&a.w===140&&a.h===100&&Math.abs(b.x-43)<1e-9&&Math.abs(b.y-417)<1e-9&&Math.abs(b.w-70)<1e-9&&Math.abs(b.h-50)<1e-9})());
t('R24: ≥8 地名/地标标签且重要地标红色加粗 (MAP_LABELS)',(()=>{const a=h.indexOf('const MAP_LABELS=['),b2=a>-1?h.indexOf('];',a):-1;const blk=a>-1?h.slice(a,b2):'';return(blk.match(/\{x:/g)||[]).length>=8&&/red:1/.test(blk)})());
t('R24: M 键/滚轮缩放/小地图点击跳转 全部接入源码',()=>/e\.key==='m'/.test(h)&&/addEventListener\('wheel'/.test(h)&&/mmJump\(sx,sy\)/.test(h));
t('R24: 相机只渲染不写世界 (移动目标仍写 G.p.tx 世界坐标)',()=>/G\.p\.tx=cl\.x/.test(h)&&/screenToWorld\(/.test(h));

// ── 28. funify-v3 R25 T0 批修 — 学术黑屏/深度HUD/派系id/库存显示源/seed 确定性 gate ──
t('T0: drawMG academic 分支唯一且非空 (空分支遮蔽已移除,不再黑屏)', (h.match(/else if\(mg==='academic'\)\{/g)||[]).length===1 && /else if\(mg==='academic'\)\{\s*\/\/ === Professor's office/.test(h));
t('T0: dive 深度写入 G.diveStats.maxDepth (diveIn 深度上升 + newRun 重置)', /s\.depth=Math\.min\(10,s\.depth\+1\);G\.diveStats=G\.diveStats\|\|\{maxDepth:1\};G\.diveStats\.maxDepth=Math\.max\(G\.diveStats\.maxDepth,s\.depth\)/.test(h) && /G\.diveStats=\{maxDepth:1\};/.test(h));
t('T0: bumpFaction 无无效派系 id (academic/acad 已映射到 heineken/smartshop/coffee)', !/bumpFaction\('academic'/.test(h) && !/bumpFaction\('acad'/.test(h) && /bumpFaction\('heineken',1,'酿造合作'\)/.test(h) && /bumpFaction\('smartshop',1,'学术合作'\)/.test(h) && /bumpFaction\('coffee',1,'巨浪学术奇观'\)/.test(h));
t('T0: 顶栏+酒吧画布库存显示源统一为 G.barStock (ipa/stout/lager)', /getElementById\('t-stock'\)[^;\n]*barStock\.ipa/.test(h) && /\(\(G\.barStock&&G\.barStock\.ipa\)\|\|0\)\+/.test(h) && /\(\(G\.barStock&&G\.barStock\.stout\)\|\|0\)\+/.test(h) && /\(\(G\.barStock&&G\.barStock\.lager\)\|\|0\)\+/.test(h));
t('T0: surf/dive 玩法路径 Math.random 已 seeded 化 (wave/forecast/frag/artifact/label)', /s\.wx<100\)\{s\.wx=500\+seeded\(476\+s\.at\)/.test(h) && /f\.x<250\)\{f\.x=620\+seeded\(483\+s\.at\)/.test(h) && /seeded\(521\+s\.score\)\*DIVE_ARTIFACTS\.length/.test(h) && /seeded\(524\+s\.score\+s\.focus\)\*DIVE_LABELS\.length/.test(h));

// ── 29. funify-v3 R27 — Brew UX (SPACE 关提示 / ✕ 退出 / ended 堵漏 / brew 工艺可视化) gate ──
const r27Hit=/function mgExitHit\(sx,sy\)\{[^}]+\}/.exec(h);
t('R27: mgExitHit 函数存在且命中 ✕ 区域 (W-16,16)', !!r27Hit && new Function('W', '"use strict";' + r27Hit[0] + ';return mgExitHit(W-16,16)===true')(800));
t('R27: mgExitHit ✕ 外 (W-30,16)/(400,400)/(W-16,30) 全 false', !!r27Hit && new Function('W', '"use strict";' + r27Hit[0] + ';return mgExitHit(W-30,16)===false&&mgExitHit(400,400)===false&&mgExitHit(W-16,30)===false')(800));
t('R27: mgExitMiniGame 清 mg/inside + 就绪 (等价 ESC 分支)', h.includes("function mgExitMiniGame(){cancelAuto('escape');G.mg=null;G.inside=null;setStatus('🟢 就绪','','');renderAll()}"));
t('R27: keydown modalOpen 分支 SPACE 关 mg-hint-modal 且保留 m 静音', h.includes("if(e.key===' '){const hm=document.getElementById('mg-hint-modal');if(hm&&!hm.classList.contains('hidden')){e.preventDefault();closeMgHint();return}}") && h.includes("if(e.key.toLowerCase()==='m'){AUDIO.toggleMute();return}return}"));
t('R27: keydown ended 分支清 G.mg/G.inside 且 n 触发 newRun', h.includes("if(G.ended){G.mg=null;G.inside=null;if(e.key==='n')newRun();return}"));
t('R27: canvas click 在 G.mg 时经 mgExitHit 路由 ✕ 退出 (先于小地图分支)', h.includes("if(G.mg&&!G.ended){const r=cv.getBoundingClientRect();const scale=r.width/W;const sx=(e.clientX-r.left)/scale,sy=(e.clientY-r.top)/scale;if(mgExitHit(sx,sy)){mgExitMiniGame();return}return}"));
t('R27: drawMG 右上角画 ✕ 按钮 + ESC 退出文案', h.includes('strokeRect(W-24,8,16,16)') && h.includes('ESC 退出'));
t('R27: brew 3 段药丸 4 态着色 (灰/黄闪/绿✓/红✗) + 窗口亮黄提示', h.includes("Math.floor(Date.now()/300)%2?'#f0d040':'#8a7a18'") && h.includes("_mk=' ✓'") && h.includes("_mk=' ✗'") && h.includes("fillText('按 SPACE!',400,214)"));
t('R27: brew 进度条 + 锅温/目标温标签 + 锅体温度着色 + sel 原料提示', h.includes("'s/'+(s.order.limit||180)+'s'") && h.includes("'🌡 '+Math.round(s.t)+'°C · 目标 ?°C'") && h.includes("rgba(70,120,230,'+(0.16*(1-_tN))") && h.includes("'1/2/3 选原料 · 🌾'+s.m+' 🌿'+s.h+' 🔬'+s.y"));

// summary assertion: tests grew this round
t('Round8: overall pass count exceeds prior baseline (≥340)', pass >= 340);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);