export function createStrikeTracker({ maxStrikes = 5 } = {}) {
  const strikes = new Map();
  return {
    add(key, reason = 'invalid_input') {
      const next = (strikes.get(key)?.count ?? 0) + 1;
      const entry = { count: next, reason, updatedAt: Date.now() };
      strikes.set(key, entry);
      return { ...entry, kicked: next >= maxStrikes };
    },
    get(key) {
      return strikes.get(key) ?? { count: 0, reason: null, updatedAt: 0 };
    },
    reset(key) {
      strikes.delete(key);
    },
  };
}
