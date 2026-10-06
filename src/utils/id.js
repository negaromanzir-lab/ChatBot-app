/**
 * Stable id generation.
 *
 * Wraps `crypto.randomUUID` because it is available in every browser that
 * supports this app's build target, but falls back for insecure contexts (plain
 * http on a LAN address) where it is undefined. The fallback is not
 * cryptographically strong, which is fine: these ids only need to be unique
 * within one browser's local storage.
 */

export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}