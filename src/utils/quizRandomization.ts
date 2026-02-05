function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSeed(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint32Array(2);
    crypto.getRandomValues(bytes);
    return `${bytes[0].toString(16)}${bytes[1].toString(16)}`;
  }
  return Math.random().toString(16).slice(2);
}

export function getSessionSeed(storageKey: string): string {
  if (typeof window === "undefined") {
    return storageKey;
  }
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const next = generateSeed();
    sessionStorage.setItem(storageKey, next);
    return next;
  } catch (error) {
    console.error("Error accessing session storage:", error);
    return storageKey;
  }
}

export function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const copy = items.slice();
  const rng = mulberry32(hashSeed(seed));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
