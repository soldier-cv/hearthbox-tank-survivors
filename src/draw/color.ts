/**
 * 颜色工具。
 *
 * 用途：从车体主色派生明暗层次，避免为每台坦克手写 4 个色值。
 * 缓存结果 —— 同一个 hex + 同一个 amount 只算一次，热路径不产生新字符串。
 */

const cache = new Map<string, string>();

function parseHex(hex: string): [number, number, number] | null {
  const h = hex.trim();
  if (h.length !== 7 || h[0] !== '#') return null;
  const n = Number.parseInt(h.slice(1), 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((clamp(r) << 16) | (clamp(g) << 8) | clamp(b)).toString(16).padStart(6, '0')}`;
}

/**
 * 调明暗。
 *
 * @param hex    源色，必须是 `#rrggbb`
 * @param amount -1（全黑）… 1（全白）。0.2 是略亮，-0.3 是明显暗部。
 */
export function shade(hex: string, amount: number): string {
  const key = `${hex}|${amount}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const rgb = parseHex(hex);
  if (!rgb) return hex;

  const [r, g, b] = rgb;
  let out: string;
  if (amount >= 0) {
    out = toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
  } else {
    const k = 1 + amount;
    out = toHex(r * k, g * k, b * k);
  }

  cache.set(key, out);
  return out;
}

/** 带透明度的 rgba()。用于辉光，避免每次拼字符串。 */
const rgbaCache = new Map<string, string>();

export function alpha(hex: string, a: number): string {
  const key = `${hex}|${a}`;
  const hit = rgbaCache.get(key);
  if (hit !== undefined) return hit;

  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const out = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  rgbaCache.set(key, out);
  return out;
}
