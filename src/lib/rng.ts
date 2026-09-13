/**
 * Deterministic pseudo-random numbers.
 *
 * The entire catalog, ninety days of sales history and every vendor receipt come
 * from here with a fixed seed. Two people opening the console see the same
 * numbers, a screenshot stays accurate, and a test can assert that the worst
 * stockout risk in the dataset is a specific SKU. Math.random would cost all
 * three.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller. Demand noise needs real tails. */
export function gaussian(next: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = next();
  while (v === 0) v = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pick<T>(items: readonly T[], next: () => number): T {
  const index = Math.floor(next() * items.length);
  // The caller always passes a non-empty list; the fallback keeps the return
  // type honest without forcing every call site to handle undefined.
  return items[Math.min(index, items.length - 1)] as T;
}

/** Uniform integer in [min, max]. */
export function intBetween(next: () => number, min: number, max: number): number {
  return Math.floor(next() * (max - min + 1)) + min;
}

/** Uniform float in [min, max), rounded to `places`. */
export function between(
  next: () => number,
  min: number,
  max: number,
  places = 2,
): number {
  const value = next() * (max - min) + min;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Poisson draw by Knuth's method.
 *
 * Daily unit sales are counts, not continuous quantities. A rounded gaussian
 * produces negative days and the wrong variance at low volume, which would make
 * the slow-moving half of the catalog behave nothing like real slow movers.
 */
export function poisson(next: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  // Knuth's algorithm underflows past roughly lambda 700; nothing here gets
  // close, but the normal approximation is correct anyway at that scale.
  if (lambda > 60) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussian(next)));

  const limit = Math.exp(-lambda);
  let k = 0;
  let product = 1;
  do {
    k += 1;
    product *= next();
  } while (product > limit);
  return k - 1;
}
