'use strict';
// Save-protection UI: real reopening-ui + SaveGuard in the real VM harness.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('./reopening-core.js');
const City = require('./reopening-city.js');
const SG = require('./save-guard.js');
const { harness } = require('./district-ui-test-fixture.cjs');
const PRIMARY = SG.KEYS.primary;
const BACKUP = SG.KEYS.backup;

function started(seed = 42) {
  const result = R.act(R.createGame(seed), { type: 'start' });
  assert.ok(result.ok);
  return result.state;
}
function envelope(game, extra = {}) {
  return { version: 1, game, city: City.create(), mapTransition: { pendingReturn: null, travelDeparture: null }, brewElapsed: 0, tutorialSeen: true, sound: false, ...extra };
}
function validRaw(game) {
  const storage = new Map();
  const memory = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  const written = SG.write(memory, { game, city: City.create(), tutorialSeen: true, sound: false }, 1700000000000);
  assert.equal(written.ok, true);
  return storage.get(PRIMARY);
}
function status(h) { return h.els.get('save-status')?.textContent || ''; }
function hasAction(h, text) { return h.dialogActions().includes(text); }

test('a corrupt primary is preserved, and the offered backup restores over it', async () => {
  const saved = started();
  const backupRaw = validRaw(saved);
  const storage = new Map([[PRIMARY, '{"version":1,"game":'], [BACKUP, backupRaw]]);
  const h = await harness(null, { storage });
  assert.equal(h.overlay().hidden, false, 'recovery menu opens instead of silently starting fresh');
  assert.equal(h.dialogTitle(), '上次的存档没能通过校验。');
  assert.ok(hasAction(h, '恢复上一份备份'), 'valid backup is offered');
  assert.ok(hasAction(h, '开始新一局'), 'new game remains possible');
  assert.equal(storage.get(SG.KEYS.recovery), '{"version":1,"game":', 'corrupt bytes kept verbatim');
  assert.equal(storage.get(PRIMARY), '{"version":1,"game":', 'nothing overwrote the corrupt primary before the choice');

  await h.clickModal(0);
  assert.equal(h.overlay().hidden, true);
  const game = h.diagnostics().game;
  assert.equal(game.phase, 'prep');
  assert.equal(game.seed, 42);
  assert.equal(SG.classify(storage.get(PRIMARY)).kind, 'current', 'restored backup becomes the protected primary');
  assert.equal(SG.classify(storage.get(BACKUP)).kind, 'current');
  h.close();
});

test('a corrupt primary without a backup can start fresh only after preserving the bytes', async () => {
  const storage = new Map([[PRIMARY, 'not json']]);
  const h = await harness(null, { storage });
  assert.equal(h.overlay().hidden, false);
  assert.equal(h.dialogTitle(), '上次的存档没能通过校验。');
  assert.ok(hasAction(h, '开始新一局'));
  assert.ok(!hasAction(h, '恢复上一份备份'), 'no fake backup is offered');
  await h.clickModal(0);
  assert.equal(h.overlay().hidden, true);
  assert.equal(storage.get(SG.KEYS.recovery), 'not json', 'raw corrupt save survives the new game');
  assert.equal(SG.classify(storage.get(PRIMARY)).kind, 'current', 'new game writes a protected primary');
  h.close();
});

test('a newer save stays untouched while deferred, and is preserved before an explicit new game', async () => {
  const newerRaw = JSON.stringify({ format: 3, savedAt: 1700000000000, game: R.createGame(42) });
  const storage = new Map([[PRIMARY, newerRaw]]);
  const h = await harness(null, { storage });
  assert.equal(h.overlay().hidden, false);
  assert.equal(h.dialogTitle(), '这个存档来自较新的版本。');
  assert.equal(storage.get(SG.KEYS.future), newerRaw, 'newer bytes are preserved immediately');
  assert.equal(storage.get(PRIMARY), newerRaw, 'newer primary is not overwritten by boot');

  await h.clickModal(1); // 暂不处理
  assert.equal(h.overlay().hidden, true);
  assert.match(status(h), /存档待处理/);
  await h.click({ action: 'start' });
  await h.tick(6000);
  assert.equal(storage.get(PRIMARY), newerRaw, 'blocked autosave does not touch a newer save');
  assert.match(status(h), /存档待处理/);

  await h.click({ action: 'menu' });
  assert.equal(h.dialogTitle(), '运河边的第二次机会。');
  assert.ok(hasAction(h, '处理上次存档'));
  await h.clickModal(1);
  assert.equal(h.dialogTitle(), '这个存档来自较新的版本。');
  await h.clickModal(0); // 保留原存档，开始新一局
  assert.equal(h.overlay().hidden, true);
  assert.equal(storage.get(SG.KEYS.future), newerRaw, 'future copy survives the explicit overwrite');
  assert.equal(SG.classify(storage.get(PRIMARY)).kind, 'current');
  assert.equal(h.diagnostics().game.phase, 'prep', 'the new run actually started');
  h.close();
});

test('a failed write reports failure and leaves the previous save intact', async () => {
  const saved = envelope(started());
  const original = JSON.stringify(saved);
  const storage = new Map([[PRIMARY, original]]);
  const h = await harness(null, { storage, failWrites: [PRIMARY] });
  assert.match(status(h), /保存失败/, 'boot save failure is visible');
  assert.equal(storage.get(PRIMARY), original, 'primary is unchanged');

  h.key('p');
  assert.equal(h.overlay().hidden, false);
  assert.match(h.dialogBody(), /上次保存失败/);
  await h.clickModal(1); // 保存进度
  assert.equal(h.overlay().hidden, false, 'pause reopens after a failed manual save');
  assert.match(h.dialogBody(), /保存失败/);
  assert.equal(storage.get(PRIMARY), original);
  await h.clickModal(0);
  h.close();
});

test('manual save and save-to-menu are real, keyboard-reachable menu actions', async () => {
  const saved = envelope(started());
  const h = await harness(null, { storage: new Map([[PRIMARY, JSON.stringify(saved)]]) });
  await h.click({ action: 'menu' });
  assert.equal(h.dialogTitle(), '运河边的第二次机会。');
  assert.ok(hasAction(h, '手动保存'));
  assert.ok(hasAction(h, '保存并回到主菜单') === false, 'save-and-exit lives in the pause menu');

  await h.clickModal(1); // 手动保存
  assert.equal(h.overlay().hidden, false, 'main menu stays open after saving');
  assert.match(status(h), /已保存/);
  await h.clickModal(0); // 继续
  assert.equal(h.overlay().hidden, true);

  h.key('p');
  assert.ok(hasAction(h, '保存并回到主菜单'));
  await h.clickModal(2); // 保存并回到主菜单
  assert.equal(h.dialogTitle(), '运河边的第二次机会。');
  assert.match(status(h), /已保存/);
  await h.clickModal(0);
  assert.equal(h.overlay().hidden, true);
  h.close();
});
