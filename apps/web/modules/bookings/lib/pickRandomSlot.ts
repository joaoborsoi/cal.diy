/**
 * Picks one slot at random from `pool`. When `exclude` is given and the pool has
 * more than one option, the excluded slot is never returned -- this is what makes
 * re-rolling from the "Pick for me" button visibly change something instead of
 * occasionally landing back on the same slot.
 */
export function pickRandomSlotFromPool(pool: string[], exclude?: string | null): string | null {
  if (pool.length === 0) {
    return null;
  }

  const candidates = exclude && pool.length > 1 ? pool.filter((slot) => slot !== exclude) : pool;
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
}
