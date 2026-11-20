(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SaveGuard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The game validates the contents (Reopening.restore); this layer protects the
  // container around it: last-known-good backup, corrupt/newer-save quarantine,
  // read-back verification and an explicit write result for the UI.
  const FORMAT = 2;
  const GAME_VERSION = 1;
  const KEYS = Object.freeze({
    primary: 'ab_reopening_v1',
    backup: 'ab_reopening_v1_backup',
    recovery: 'ab_reopening_v1_recovery',
    recoveryPrev: 'ab_reopening_v1_recovery_prev',
    future: 'ab_reopening_v1_future',
    futurePrev: 'ab_reopening_v1_future_prev'
  });
  const MAX_RAW = 1024 * 1024;

  function stableStringify(value) {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') {
      return typeof value === 'number' && !Number.isFinite(value) ? 'null' : JSON.stringify(value);
    }
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().filter(key => value[key] !== undefined)
      .map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }

  function checksum(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function envelopeBody(data) {
    const body = {};
    for (const key of Object.keys(data)) {
      if (key !== 'format' && key !== 'savedAt' && key !== 'checksum') body[key] = data[key];
    }
    return body;
  }

  function gameVersionOf(envelope) {
    const game = envelope && typeof envelope === 'object' ? envelope.game : null;
    return Number.isInteger(game && game.version) ? game.version : null;
  }

  function normalize(data) {
    if (data && typeof data === 'object' && !Array.isArray(data) && data.game) return data;
    return { version: GAME_VERSION, game: data };
  }

  function classify(raw) {
    if (raw === null || raw === undefined || raw === '') return { kind: 'empty' };
    if (typeof raw !== 'string') return { kind: 'corrupt', reason: 'type' };
    if (raw.length > MAX_RAW) return { kind: 'corrupt', reason: 'oversized' };
    let data;
    try { data = JSON.parse(raw); } catch (_) { return { kind: 'corrupt', reason: 'json' }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { kind: 'corrupt', reason: 'shape' };

    if (Number.isInteger(data.format) && data.format > FORMAT) {
      return { kind: 'newer', reason: 'format', version: data.format };
    }
    if (data.format !== FORMAT && !data.game && Number.isInteger(data.version) && data.version > GAME_VERSION) {
      return { kind: 'newer', reason: 'version', version: data.version };
    }
    if (data.format === FORMAT) {
      if (typeof data.checksum !== 'string' || data.checksum.length !== 8) return { kind: 'corrupt', reason: 'checksum-missing' };
      const body = envelopeBody(data);
      if (!Object.prototype.hasOwnProperty.call(body, 'game')) return { kind: 'corrupt', reason: 'payload' };
      if (checksum(stableStringify(body)) !== data.checksum) return { kind: 'corrupt', reason: 'checksum' };
      if (!Number.isFinite(data.savedAt)) return { kind: 'corrupt', reason: 'savedAt' };
      return { kind: 'current', data, payload: body, savedAt: data.savedAt, version: FORMAT };
    }
    // Version 1 (or an unwrapped bare game state) predates the checksummed
    // envelope. It still goes through the strict game validator before use.
    const payload = normalize(data);
    const version = gameVersionOf(payload);
    if (version !== null && version > GAME_VERSION) return { kind: 'newer', reason: 'game-version', version };
    if (version !== GAME_VERSION) return { kind: 'corrupt', reason: 'version' };
    return { kind: 'legacy', data, payload, version: GAME_VERSION };
  }

  function readRaw(storage, key) {
    try { return { ok: true, raw: storage.getItem(key) }; }
    catch (error) { return { ok: false, error }; }
  }

  function preserve(storage, kind, raw) {
    const base = kind === 'newer' ? KEYS.future : KEYS.recovery;
    const previous = kind === 'newer' ? KEYS.futurePrev : KEYS.recoveryPrev;
    try {
      const existing = storage.getItem(base);
      if (existing === raw) return { ok: true, key: base, existing: true };
      if (existing !== null && existing !== undefined) {
        storage.setItem(previous, existing);
        if (storage.getItem(previous) !== existing) return { ok: false, reason: 'previous-verify', key: base };
      }
      storage.setItem(base, raw);
      if (storage.getItem(base) !== raw) return { ok: false, reason: 'verify', key: base };
      return { ok: true, key: base };
    } catch (error) {
      return { ok: false, reason: 'write', error, key: base };
    }
  }

  function inspect(storage, key, validate) {
    const read = readRaw(storage, key);
    if (!read.ok) return { status: 'unavailable', error: read.error };
    const classification = classify(read.raw);
    if (classification.kind === 'empty') return { status: 'empty' };
    if (classification.kind === 'corrupt') return { status: 'corrupt', raw: read.raw, reason: classification.reason };
    if (classification.kind === 'newer') return { status: 'newer', raw: read.raw, version: classification.version, reason: classification.reason };
    const restored = validate ? validate(classification.payload) : null;
    if (!restored) return { status: 'invalid', raw: read.raw, reason: 'game', payload: classification.payload };
    return { status: 'ready', raw: read.raw, kind: classification.kind, envelope: classification.payload, restored, savedAt: classification.savedAt || null };
  }

  function loadBackup(storage, validate) {
    const result = inspect(storage, KEYS.backup, validate);
    if (result.status === 'ready') return result;
    return { status: result.status === 'unavailable' ? 'unavailable' : 'none' };
  }

  function load(storage, validate) {
    if (!storage) return { status: 'unavailable', reason: 'storage' };
    let primary;
    try { primary = inspect(storage, KEYS.primary, validate); }
    catch (error) { return { status: 'unavailable', reason: 'storage', error }; }

    if (primary.status === 'ready') {
      return { status: 'ready', kind: primary.kind, envelope: primary.envelope, restored: primary.restored, savedAt: primary.savedAt, backup: loadBackup(storage, validate) };
    }
    if (primary.status === 'unavailable') {
      return { status: 'unavailable', reason: 'storage', error: primary.error };
    }
    if (primary.status === 'empty') {
      const backup = loadBackup(storage, validate);
      return { status: 'empty', backup: backup.status === 'ready' ? backup : null };
    }

    const reason = primary.status === 'newer' ? 'newer' : primary.status === 'invalid' ? 'invalid' : 'corrupt';
    const protectedCopy = preserve(storage, reason === 'newer' ? 'newer' : 'corrupt', primary.raw);
    const backup = loadBackup(storage, validate);
    return {
      status: 'attention',
      reason,
      raw: primary.raw,
      preserved: protectedCopy.ok,
      preserveError: protectedCopy.ok ? null : protectedCopy.reason,
      version: primary.version || null,
      backup: backup.status === 'ready' ? backup : null,
      backupStatus: backup.status
    };
  }

  function rotateBackup(storage, primaryRaw) {
    const classification = classify(primaryRaw);
    if (classification.kind !== 'current' && classification.kind !== 'legacy') return { ok: false, reason: 'not-safe' };
    try {
      storage.setItem(KEYS.backup, primaryRaw);
      if (storage.getItem(KEYS.backup) !== primaryRaw) return { ok: false, reason: 'verify' };
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'write', error };
    }
  }

  function write(storage, payload, now) {
    if (!storage) return { ok: false, reason: 'storage' };
    if (!payload || !payload.game) return { ok: false, reason: 'payload' };
    const savedAt = Number.isFinite(now) ? now : Date.now();
    let text;
    try {
      const body = { version: GAME_VERSION, game: payload.game, city: payload.city ?? null,
        mapTransition: payload.mapTransition || { pendingReturn: null, travelDeparture: null },
        brewElapsed: payload.brewElapsed || 0, tutorialSeen: Boolean(payload.tutorialSeen), sound: payload.sound !== false };
      text = JSON.stringify({ format: FORMAT, savedAt, checksum: checksum(stableStringify(body)), ...body });
    } catch (error) {
      return { ok: false, reason: 'serialize', error };
    }

    let previous;
    try { previous = storage.getItem(KEYS.primary); }
    catch (error) { return { ok: false, reason: 'read', error }; }
    const backup = previous === null || previous === undefined ? { ok: null } : rotateBackup(storage, previous);

    try { storage.setItem(KEYS.primary, text); }
    catch (error) { return { ok: false, reason: 'write', error, backup }; }
    try {
      if (storage.getItem(KEYS.primary) !== text) return { ok: false, reason: 'verify', backup };
    } catch (error) {
      return { ok: false, reason: 'verify', error, backup };
    }
    return { ok: true, savedAt, bytes: text.length, backup };
  }

  return Object.freeze({ FORMAT, GAME_VERSION, KEYS, stableStringify, checksum, classify, load, loadBackup, preserve, write, rotateBackup });
});
