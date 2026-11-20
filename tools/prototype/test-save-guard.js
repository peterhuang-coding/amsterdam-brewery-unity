'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('./reopening-core.js');
const SG = require('./save-guard.js');

const validate = payload => R.restore(payload && (payload.game || payload));

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: key => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
}

function legacy(game, extra = {}) {
  return JSON.stringify({ version: 1, game, city: null, ...extra });
}

test('legacy saves still load through the strict game validator', () => {
  const game = R.createGame(42);
  const storage = memoryStorage({ [SG.KEYS.primary]: legacy(game) });
  const loaded = SG.load(storage, validate);
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.kind, 'legacy');
  assert.equal(loaded.envelope.game.seed, game.seed);
  assert.equal(loaded.backup.status, 'none');
});

test('writes are checksummed, read back, and rotate the previous valid save into backup', () => {
  const first = R.createGame(42);
  const second = R.createGame(7);
  const storage = memoryStorage();
  const a = SG.write(storage, { game: first, city: null }, 1700000000000);
  assert.equal(a.ok, true);
  const raw = storage.getItem(SG.KEYS.primary);
  assert.equal(SG.classify(raw).kind, 'current');
  assert.equal(JSON.parse(raw).format, 2);
  assert.equal(JSON.parse(raw).game.seed, 42, 'envelope stays flat for existing readers');

  const b = SG.write(storage, { game: second, city: null }, 1700000001000);
  assert.equal(b.ok, true);
  assert.equal(SG.classify(storage.getItem(SG.KEYS.backup)).kind, 'current', 'previous save is a valid backup');
  const loaded = SG.load(storage, validate);
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.envelope.game.seed, 7);
  assert.equal(loaded.backup.status, 'ready');
  assert.equal(loaded.backup.envelope.game.seed, 42);
});

test('checksum and stable key order detect a mutated but syntactically valid save', () => {
  const game = R.createGame(42);
  const storage = memoryStorage();
  const written = SG.write(storage, { game, city: null }, 1700000000000);
  assert.equal(written.ok, true);
  const saved = JSON.parse(storage.getItem(SG.KEYS.primary));
  const mutated = JSON.stringify({ ...saved, game: { ...saved.game, cash: saved.game.cash + 1 } });
  assert.equal(SG.classify(mutated).kind, 'corrupt');
  assert.equal(SG.classify(mutated).reason, 'checksum');

  // The checksum is over a key-sorted body, so a reordered but unchanged body stays valid.
  const reordered = JSON.stringify({ format: saved.format, savedAt: saved.savedAt, checksum: saved.checksum,
    game: saved.game, version: saved.version, city: saved.city, mapTransition: saved.mapTransition,
    brewElapsed: saved.brewElapsed, tutorialSeen: saved.tutorialSeen, sound: saved.sound });
  assert.equal(SG.classify(reordered).kind, 'current');
});

test('a corrupted primary is preserved and the backup is offered instead of being overwritten', () => {
  const first = R.createGame(42);
  const second = R.createGame(7);
  const storage = memoryStorage();
  SG.write(storage, { game: first, city: null }, 1700000000000);
  SG.write(storage, { game: second, city: null }, 1700000001000);
  const backupRaw = storage.getItem(SG.KEYS.backup);
  storage.setItem(SG.KEYS.primary, '{"version":1,"game":');

  const loaded = SG.load(storage, validate);
  assert.equal(loaded.status, 'attention');
  assert.equal(loaded.reason, 'corrupt');
  assert.equal(loaded.preserved, true);
  assert.equal(storage.getItem(SG.KEYS.recovery), '{"version":1,"game":', 'raw corrupt save kept verbatim');
  assert.equal(loaded.backup.status, 'ready');
  assert.equal(loaded.backup.envelope.game.seed, 42);
  assert.equal(storage.getItem(SG.KEYS.backup), backupRaw, 'backup is unchanged by the failed primary');
});

test('a save rejected by the game validator is treated as corrupt, not as a new game', () => {
  const game = { ...R.createGame(42), cash: 1000001 };
  const raw = JSON.stringify({ version: 1, game });
  const storage = memoryStorage({ [SG.KEYS.primary]: raw });
  const loaded = SG.load(storage, validate);
  assert.equal(loaded.status, 'attention');
  assert.equal(loaded.reason, 'invalid');
  assert.equal(loaded.preserved, true);
  assert.equal(storage.getItem(SG.KEYS.recovery), raw);
  assert.equal(SG.load(storage, validate).status, 'attention', 'the bad primary is not silently replaced by a fresh save');
});

test('newer envelope formats are quarantined and never overwritten by this build', () => {
  const newerRaw = JSON.stringify({ format: 3, savedAt: 1, game: R.createGame(42) });
  const storage = memoryStorage({ [SG.KEYS.primary]: newerRaw });
  const loaded = SG.load(storage, validate);
  assert.equal(loaded.status, 'attention');
  assert.equal(loaded.reason, 'newer');
  assert.equal(loaded.version, 3);
  assert.equal(loaded.preserved, true);
  assert.equal(storage.getItem(SG.KEYS.future), newerRaw);
  assert.equal(storage.getItem(SG.KEYS.primary), newerRaw, 'newer primary is untouched');
});

test('a newer game version inside a legacy envelope is also protected', () => {
  const newerRaw = JSON.stringify({ version: 1, game: { version: 2, seed: 42 } });
  const storage = memoryStorage({ [SG.KEYS.primary]: newerRaw });
  const loaded = SG.load(storage, validate);
  assert.equal(loaded.status, 'attention');
  assert.equal(loaded.reason, 'newer');
  assert.equal(storage.getItem(SG.KEYS.future), newerRaw);
});

test('write failures and failed read-back report failure and leave the primary intact', () => {
  const game = R.createGame(42);
  const original = legacy(game);
  const storage = memoryStorage({ [SG.KEYS.primary]: original });
  const realSet = storage.setItem;
  storage.setItem = (key, value) => { if (key === SG.KEYS.primary) throw new Error('quota'); else realSet(key, value); };
  const failed = SG.write(storage, { game: R.createGame(7), city: null }, 1700000000000);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'write');
  assert.equal(storage.getItem(SG.KEYS.primary), original);

  const silent = memoryStorage({ [SG.KEYS.primary]: original });
  silent.setItem = (key, value) => { if (key !== SG.KEYS.primary) silent.map.set(key, String(value)); };
  const verified = SG.write(silent, { game, city: null }, 1700000000000);
  assert.equal(verified.ok, false);
  assert.equal(verified.reason, 'verify');
  assert.equal(silent.getItem(SG.KEYS.primary), original);
});

test('an empty primary can still offer a valid backup without auto-resuming it', () => {
  const game = R.createGame(42);
  const storage = memoryStorage();
  SG.write(storage, { game, city: null }, 1700000000000);
  SG.write(storage, { game, city: null }, 1700000001000);
  storage.removeItem(SG.KEYS.primary);
  const loaded = SG.load(storage, validate);
  assert.equal(loaded.status, 'empty');
  assert.equal(loaded.backup.status, 'ready');
  assert.equal(loaded.backup.envelope.game.seed, 42);
});

test('repeated corrupt saves rotate the older recovery copy instead of losing it', () => {
  const storage = memoryStorage({ [SG.KEYS.primary]: 'first-corrupt' });
  const first = SG.load(storage, validate);
  assert.equal(first.preserved, true);
  storage.setItem(SG.KEYS.primary, 'second-corrupt');
  const second = SG.load(storage, validate);
  assert.equal(second.preserved, true);
  assert.equal(storage.getItem(SG.KEYS.recoveryPrev), 'first-corrupt');
  assert.equal(storage.getItem(SG.KEYS.recovery), 'second-corrupt');
});
