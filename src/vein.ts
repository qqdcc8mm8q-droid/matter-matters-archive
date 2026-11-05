import type { VeinBlend, VeinDither, VeinFlow, VeinKind } from './types'

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1,
  33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
]

function hash(n: number): number {
  const x = Math.sin(n) * 43758.5453123
  return x - Math.floor(x)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function noise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const a = hash(x0 * 127.1 + y0 * 311.7 + seed)
  const b = hash((x0 + 1) * 127.1 + y0 * 311.7 + seed)
  const c = hash(x0 * 127.1 + (y0 + 1) * 311.7 + seed)
  const d = hash((x0 + 1) * 127.1 + (y0 + 1) * 311.7 + seed)
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy)
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let value = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i += 1) {
    value += noise2(x * freq, y * freq, seed + i * 19) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return value / norm
}

function parseInk(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  if (value.length !== 6) return [28, 25, 21]
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function mixChannel(a: number, b: number, t: number): number {
  return Math.round(lerp(a, b, clamp01(t)))
}

function blendChannel(base: number, blend: number, mode: VeinBlend): number {
  const a = base / 255
  const b = blend / 255
  let out = b
  if (mode === 'multiply') out = a * b
  else if (mode === 'screen') out = 1 - (1 - a) * (1 - b)
  else if (mode === 'add') out = Math.min(1, a + b * 0.65)
  else if (mode === 'soft-light') out = b < 0.5 ? a - (1 - 2 * b) * a * (1 - a) : a + (2 * b - 1) * (Math.sqrt(a) - a)
  else {
    const overlay = a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b)
    out = overlay
  }
  return Math.round(clamp01(out) * 255)
}

function flowField(x: number, y: number, flow: VeinFlow, scale: number, curve: number, stripes: number, time: number, seed: number): number {
  const s = 0.45 + scale * 1.55
  const warp = 0.35 + curve * 1.4
  const t = time * Math.PI * 2
  let u = x
  let v = y

  if (flow === 'swirl') {
    const dx = x - 0.5
    const dy = y - 0.5
    const ang = Math.atan2(dy, dx) + (fbm(x * s, y * s, seed, 3) - 0.5) * warp * 4 + t * 0.15
    const r = Math.hypot(dx, dy)
    u = 0.5 + Math.cos(ang) * r
    v = 0.5 + Math.sin(ang) * r
  } else if (flow === 'ripple') {
    const r = Math.hypot(x - 0.5, y - 0.5)
    const n = fbm(x * s, y * s, seed, 3)
    return clamp01(0.5 + 0.5 * Math.sin(r * (3.2 + scale * 8) + n * warp * 5 + t))
  } else if (flow === 'drift') {
    u += (fbm(x * 0.55, y * 0.55, seed, 3) - 0.5) * warp * 1.1 + time * 0.28
    v += (fbm(x * 0.55 + 8, y * 0.55, seed + 3, 3) - 0.5) * warp
  } else if (flow === 'breathe') {
    const k = 1 + Math.sin(t) * (0.08 + scale * 0.12)
    u = 0.5 + (x - 0.5) * k
    v = 0.5 + (y - 0.5) * k
  } else if (flow === 'turn') {
    const dx = x - 0.5
    const dy = y - 0.5
    const c = Math.cos(t)
    const sn = Math.sin(t)
    u = 0.5 + dx * c - dy * sn
    v = 0.5 + dx * sn + dy * c
  }

  const n1 = fbm(u * s, v * s, seed, 5)
  const n2 = fbm(u * s + 5.2, v * s + 2.4, seed + 7, 4)
  const qx = u + (n1 - 0.5) * warp
  const qy = v + (n2 - 0.5) * warp
  const marble = fbm(qx * s, qy * s, seed + 11, 5)
  const veins = fbm(qx * s * (0.7 + stripes * 1.4) + qy * stripes * 2.2, qy * s * 0.55, seed + 19, 4)
  return clamp01(lerp(marble, veins, stripes * 0.62))
}

function ditherGate(x: number, y: number, dither: VeinDither, seed: number): number {
  if (dither === 'bayer4') return (BAYER4[(y % 4) * 4 + (x % 4)] + 0.5) / 16
  if (dither === 'bayer8') return (BAYER8[(y % 8) * 8 + (x % 8)] + 0.5) / 64
  if (dither === 'noise') return hash(x * 12.9898 + y * 78.233 + seed)
  return 0.5
}

export function paintVein(data: Uint8ClampedArray, w: number, h: number, kind: VeinKind) {
  const inks = kind.inks.map(parseInk)
  const count = Math.max(2, inks.length)
  const levels = Math.max(2, Math.round(kind.levels))
  const seed = kind.variation * 0.137
  const time = kind.animate ? kind.time : kind.flow === 'breathe' || kind.flow === 'turn' || kind.flow === 'drift' ? kind.time : 0
  const runA = Math.cos(0.35 + kind.runs * 1.8)
  const runB = Math.sin(0.35 + kind.runs * 1.8)

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = x / w
      const v = y / h
      const stretch = kind.runs * 0.42
      const px = u + runA * (v - 0.5) * stretch
      const py = v + runB * (u - 0.5) * stretch
      const field = flowField(px, py, kind.flow, kind.scale, kind.curve, kind.stripes, time, seed)
      const stepped = field * (levels - 0.0001)
      const index = Math.min(count - 1, Math.floor((stepped / levels) * count))
      const next = Math.min(count - 1, index + 1)
      const inner = stepped - Math.floor(stepped)
      const edge = Math.pow(1 - Math.abs(inner - 0.5) * 2, 1.6)
      const mixT = clamp01((inner - 0.5 + kind.tints * 0.45) / Math.max(0.04, 1 - kind.curve * 0.7))
      const gate = ditherGate(x, y, kind.dither, seed)
      const pick = kind.dither === 'off' ? mixT : mixT > gate ? 1 : 0

      let r = inks[index][0]
      let g = inks[index][1]
      let b = inks[index][2]
      const br = blendChannel(r, inks[next][0], kind.blend)
      const bg = blendChannel(g, inks[next][1], kind.blend)
      const bb = blendChannel(b, inks[next][2], kind.blend)
      const amt = kind.amount * pick
      r = mixChannel(r, br, amt)
      g = mixChannel(g, bg, amt)
      b = mixChannel(b, bb, amt)

      if (kind.edges > 0) {
        const shade = 1 - edge * kind.edges * 0.55
        r = Math.round(r * shade)
        g = Math.round(g * shade)
        b = Math.round(b * shade)
      }

      const n = hash(x * 0.37 + y * 1.91 + seed)
      if (kind.stars > 0 && n < kind.stars * 0.0048) {
        const spark = 180 + n * 75
        r = mixChannel(r, spark, 0.85)
        g = mixChannel(g, spark, 0.85)
        b = mixChannel(b, spark, 0.82)
      }

      if (kind.grain) {
        const grainFreq = 0.8 + kind.grainSize * 3.4
        const gn = (noise2(x * grainFreq * 0.08, y * grainFreq * 0.08, seed + 40) - 0.5) * kind.amount * 46
        r = Math.max(0, Math.min(255, r + gn))
        g = Math.max(0, Math.min(255, g + gn))
        b = Math.max(0, Math.min(255, b + gn))
      }

      if (kind.specks > 0 && hash(x * 3.1 + y * 17.7 + seed + 9) < kind.specks * 0.018) {
        const speck = inks[Math.floor(hash(x + y * 13 + seed) * count)]
        r = mixChannel(r, speck[0], 0.7)
        g = mixChannel(g, speck[1], 0.7)
        b = mixChannel(b, speck[2], 0.7)
      }

      if (kind.vignette > 0) {
        const dx = u - 0.5
        const dy = v - 0.5
        const fall = clamp01((Math.hypot(dx, dy) * 1.55 - 0.35) * kind.vignette * 1.6)
        r = Math.round(r * (1 - fall * 0.55))
        g = Math.round(g * (1 - fall * 0.55))
        b = Math.round(b * (1 - fall * 0.55))
      }

      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
}
