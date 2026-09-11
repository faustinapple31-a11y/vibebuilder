const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** URL-safe random id (not cryptographic). Works in browser and Node. */
export function newId(prefix = "", size = 12): string {
  let out = "";
  const cryptoObj = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => void } }).crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(size);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < size; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  } else {
    for (let i = 0; i < size; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return prefix ? `${prefix}_${out}` : out;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Increment "v0.3" → "v0.4". */
export function nextVersion(v: string | undefined): string {
  const m = /^v(\d+)\.(\d+)$/.exec(v ?? "");
  if (!m) return "v0.1";
  return `v${m[1]}.${Number(m[2]) + 1}`;
}
