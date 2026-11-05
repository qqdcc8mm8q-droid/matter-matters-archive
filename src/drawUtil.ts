export function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

export function clamp(value: number, min = 0, max = 255): number {
  return Math.max(min, Math.min(max, value))
}

export function hexRgb(color: string): [number, number, number] {
  const value = color.replace('#', '')
  if (value.length !== 6) return [28, 25, 21]
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = hexRgb(a)
  const pb = hexRgb(b)
  const c = (i: number) =>
    Math.round(pa[i] + (pb[i] - pa[i]) * t)
      .toString(16)
      .padStart(2, '0')
  return `#${c(0)}${c(1)}${c(2)}`
}

export function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function noise(x: number, y: number, seed: number): number {
  return hash(Math.floor(x) * 13.1 + Math.floor(y) * 47.2 + seed)
}

export function fbm(x: number, y: number, seed: number): number {
  return noise(x, y, seed) * 0.5 + noise(x * 2, y * 2, seed + 3) * 0.3 + noise(x * 4, y * 4, seed + 7) * 0.2
}

export function p(params: Record<string, string>, id: string, fallback: string): string {
  return params[id] && params[id].length ? params[id] : fallback
}

export function n(params: Record<string, string>, id: string, fallback: number): number {
  const value = Number(params[id])
  return Number.isFinite(value) ? value : fallback
}

export function hex(params: Record<string, string>, id: string, fallback: string): string {
  const value = p(params, id, fallback)
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

export function on(params: Record<string, string>, id: string): boolean {
  return params[id] === 'on'
}

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

export const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51,
  19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
]

export function bayerAt(x: number, y: number, size: 4 | 8 | 16): number {
  if (size === 4) return (BAYER4[(y % 4) * 4 + (x % 4)] + 0.5) / 16
  if (size === 8) return (BAYER8[(y % 8) * 8 + (x % 8)] + 0.5) / 64
  const qx = Math.floor(x / 8) % 2
  const qy = Math.floor(y / 8) % 2
  return (BAYER8[(y % 8) * 8 + (x % 8)] + (qx + qy * 2) * 64 + 0.5) / 256
}
