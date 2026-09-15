import "server-only";

/**
 * A minimal process-local, single-flight, TTL cache with bounded LRU eviction.
 *
 * This is the reusable core behind the authorization scope caches (see
 * `lib/scope-cache`). It mirrors the proven shape already used by `lib/profile`:
 * state is pinned to `globalThis` so every module copy (HMR reloads, duplicate
 * bundles) shares ONE map, concurrent misses for the same key coalesce into a
 * single load, and entries expire after `ttlMs`.
 *
 * Caveat by design: the cache is per-process. `invalidate()` only reaches the
 * instance it runs on — other instances rely on `ttlMs` as the staleness bound.
 * If cross-instance immediacy is ever required, move to a shared store or add an
 * authorization-version key to the cache key.
 */
/**
 * Cumulative counters for observability (Step 4). All in-memory and near-free.
 * `hits/misses` give the hit rate; `coalesced` shows single-flight savings under
 * concurrency; `evictions` flags an undersized `maxSize`; `invalidations` tracks
 * explicit drops.
 */
export type CacheStats = {
  hits: number;
  misses: number;
  coalesced: number;
  evictions: number;
  invalidations: number;
  size: number;
};

export type TtlCache<T> = {
  /** Cached read; coalesces concurrent misses; never stores when `ttlMs <= 0`. */
  get(key: string): Promise<T>;
  /** Drop `key` and mark any in-flight load for it as non-storable. */
  invalidate(key: string): void;
  /** Drop every entry (used by tests). */
  clear(): void;
  /** Snapshot of cumulative counters + current size. */
  stats(): CacheStats;
};

type Entry<T> = { at: number; value: T };

type Options<T> = {
  /** Stable name — also the `globalThis` key suffix, so it must be unique. */
  name: string;
  /** Time-to-live in ms. `<= 0` disables caching entirely (load every call). */
  ttlMs: number;
  /** Max distinct keys retained; least-recently-used keys are evicted first. */
  maxSize: number;
  /** Loader invoked on a miss. Must be pure w.r.t. `key`. */
  load: (key: string) => Promise<T>;
};

export function createTtlCache<T>(opts: Options<T>): TtlCache<T> {
  const g = globalThis as unknown as Record<string, unknown>;
  const storeKey = `__ttlCacheStore_${opts.name}`;
  const inflightKey = `__ttlCacheInflight_${opts.name}`;
  const genKey = `__ttlCacheGen_${opts.name}`;

  const store = (g[storeKey] ??= new Map<string, Entry<T>>()) as Map<string, Entry<T>>;
  const inflight = (g[inflightKey] ??= new Map<string, Promise<T>>()) as Map<string, Promise<T>>;
  // Per-key generation counter. Bumped on invalidate; a load only stores its
  // result if the generation is unchanged since the load began — so an
  // invalidate that races an in-flight load correctly discards the stale value.
  const generation = (g[genKey] ??= new Map<string, number>()) as Map<string, number>;
  const statsKey = `__ttlCacheStats_${opts.name}`;
  const counters = (g[statsKey] ??= { hits: 0, misses: 0, coalesced: 0, evictions: 0, invalidations: 0 }) as Omit<CacheStats, "size">;

  const disabled = opts.ttlMs <= 0;

  const bumpRecency = (key: string, entry: Entry<T>) => {
    // Map preserves insertion order, so delete+set moves the key to newest.
    store.delete(key);
    store.set(key, entry);
    while (store.size > opts.maxSize) {
      const oldest = store.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      store.delete(oldest);
      counters.evictions++;
    }
  };

  return {
    get(key) {
      if (!disabled) {
        const hit = store.get(key);
        if (hit && Date.now() - hit.at < opts.ttlMs) {
          counters.hits++;
          bumpRecency(key, hit); // refresh LRU recency, not the TTL clock
          return Promise.resolve(hit.value);
        }
      }

      const pending = inflight.get(key);
      if (pending) {
        counters.coalesced++;
        return pending;
      }

      counters.misses++;
      const startGen = generation.get(key) ?? 0;
      const p = opts
        .load(key)
        .then((value) => {
          // Only cache if no invalidate arrived while this load was in flight.
          if (!disabled && (generation.get(key) ?? 0) === startGen) {
            bumpRecency(key, { at: Date.now(), value });
          }
          return value;
        })
        .finally(() => {
          if (inflight.get(key) === p) inflight.delete(key);
        });
      inflight.set(key, p);
      return p;
    },
    invalidate(key) {
      store.delete(key);
      generation.set(key, (generation.get(key) ?? 0) + 1);
      counters.invalidations++;
    },
    clear() {
      store.clear();
    },
    stats() {
      return { ...counters, size: store.size };
    },
  };
}
