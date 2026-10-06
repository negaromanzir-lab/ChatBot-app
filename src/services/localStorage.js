/**
 * Guarded `localStorage` JSON access.
 *
 * Storage can be entirely absent (SSR, privacy mode, disabled cookies) and a
 * stored payload can be corrupt or from an older shape. Every helper here
 * degrades to a default instead of throwing, because losing a persisted
 * conversation is a recoverable annoyance while a crash on boot is not.
 */

function getStore() {
  try {
    // Touching `localStorage` itself can throw a SecurityError when cookies are
    // blocked, so even the lookup has to be guarded.
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readJson(key, fallback) {
  const store = getStore();
  if (!store) return fallback;

  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    // Corrupt payload. Drop it so it cannot fail again on every read.
    try {
      store.removeItem(key);
    } catch {
      /* Nothing more to do. */
    }
    return fallback;
  }
}

export function writeJson(key, value) {
  const store = getStore();
  if (!store) return false;

  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // QuotaExceededError, or storage disabled mid-session.
    return false;
  }
}

export function removeKey(key) {
  const store = getStore();
  if (!store) return;

  try {
    store.removeItem(key);
  } catch {
    /* Nothing more to do. */
  }
}