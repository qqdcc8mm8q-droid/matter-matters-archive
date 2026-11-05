import type { EffectKind, EffectName, GenKind, GenName } from './types'
import { bayerAt, clamp, fbm, hash, hex, hexRgb, luma, mixHex, n, noise, on, p } from './drawUtil'

const GEN_IDS: GenName[] = [
  'shapes',
  'uji',
  'automata',
  'hypha',
  'dismal',
  'rd',
  'bushes',
  'sampl',
  'stoer',
  'spacetime',
  'pixelbrei',
  'echoes',
  'brutalita',
  'script',
  'taag',
  'titleart',
  'mono',
  'csmoire',
  'typeimage',
  'genfont',
  'svgtype',
  'glitchtype',
  'emoji',
  'rgbkeys',
  'randomizer',
  'moireform',
  'blur',
]

export function isGen(name: string): name is GenName {
  return GEN_IDS.includes(name as GenName)
}

export function isEffect(name: string): name is EffectName {
  return [
    'glitch',
    'rgb',
    'threshold',
    'dither',
    'refract',
    'fragment',
    'slide',
    'distort',
    'blur',
    'ascii',
    'glitchscan',
    'remains',
    'character',
    'elastic',
    'halftone',
    'grainover',
    'glitchimg',
    'grainrad',
  ].includes(name)
}

export function paintGen(ctx: CanvasRenderingContext2D, w: number, h: number, kind: GenKind, source?: ImageData) {
  const params = kind.params
  const ink = hex(params, 'color', '#1c1915')
  const paper = hex(params, 'colorB', '#efeae2')
  if (kind.gen === 'shapes') return bookOfShapes(ctx, w, h, params, ink, paper)
  if (kind.gen === 'uji') return uji(ctx, w, h, params, ink)
  if (kind.gen === 'automata') return automata(ctx, w, h, params, ink)
  if (kind.gen === 'hypha') return hypha(ctx, w, h, params, ink)
  if (kind.gen === 'dismal') return dismal(ctx, w, h, params, ink, paper)
  if (kind.gen === 'rd') return rd(ctx, w, h, params, ink, paper)
  if (kind.gen === 'bushes') return desssign(ctx, w, h, params, ink)
  if (kind.gen === 'sampl') return sampl(ctx, w, h, params, ink, paper)
  if (kind.gen === 'script') return calligrapher(ctx, w, h, params, ink)
  if (kind.gen === 'stoer') return stoer(ctx, w, h, params, ink)
  if (kind.gen === 'spacetime') return spaceType(ctx, w, h, params, ink)
  if (kind.gen === 'pixelbrei') return pixelbrei(ctx, w, h, params)
  if (kind.gen === 'echoes') return echoes(ctx, w, h, params, ink)
  if (kind.gen === 'brutalita') return brutalita(ctx, w, h, params, ink)
  if (kind.gen === 'taag') return taag(ctx, w, h, params, ink)
  if (kind.gen === 'titleart') return titleArt(ctx, w, h, params, ink, paper)
  if (kind.gen === 'mono') return monoTool(ctx, w, h, params)
  if (kind.gen === 'typeimage') return typeOfImage(ctx, w, h, params, ink, paper, source)
  if (kind.gen === 'genfont') return genFont(ctx, w, h, params, ink)
  if (kind.gen === 'svgtype') return svgType(ctx, w, h, params, ink)
  if (kind.gen === 'glitchtype') return glitchType(ctx, w, h, params, ink, paper)
  if (kind.gen === 'emoji') return notMachine(ctx, w, h, params, ink)
  if (kind.gen === 'rgbkeys') return rgbGrid(ctx, w, h, params)
  if (kind.gen === 'randomizer') return minimalier(ctx, w, h, params, ink)
  if (kind.gen === 'moireform') return moireForms(ctx, w, h, params, ink, paper)
  if (kind.gen === 'csmoire') return csMoire(ctx, w, h, params, ink)
  if (kind.gen === 'blur') return typeBlur(ctx, w, h, params, ink, paper, source)
}

export function applyEffect(image: ImageData, kind: EffectKind) {
  const { data, width, height } = image
  const params = kind.params
  const effect = kind.effect
  if (effect === 'dither') return ditherGarden(image, params)
  if (effect === 'grainrad') return grainrad(image, params)
  if (effect === 'refract') return refract(image, params)
  if (effect === 'distort') return imgDistort(image, params)
  if (effect === 'slide') return slide(image, params)
  if (effect === 'fragment') return fragmenter(image, params)
  if (effect === 'elastic') return elastic(image, params)
  if (effect === 'glitchscan') return scanner(image, params)
  if (effect === 'glitchimg') return glitchImage(image, params)
  if (effect === 'character' || effect === 'ascii') return characterOverlay(image, params, effect === 'ascii')
  if (effect === 'blur') return blurImage(image, n(params, 'blur', n(params, 'amount', 0.4) * 20) || 10)
  if (effect === 'halftone') return halftoneLayer(image, params)

  const copy = new Uint8ClampedArray(data)
  const sample = (x: number, y: number): [number, number, number, number] => {
    const sx = ((Math.round(x) % width) + width) % width
    const sy = ((Math.round(y) % height) + height) % height
    const i = (sy * width + sx) * 4
    return [copy[i], copy[i + 1], copy[i + 2], copy[i + 3]]
  }
  const amount = n(params, 'amount', 0.5)
  const seed = n(params, 'seed', 1)
  const rgb = hexRgb(hex(params, 'color', '#1c1915'))
  if (effect === 'glitch') {
    const bands = Math.max(2, Math.round(n(params, 'slices', 12)))
    const bandH = Math.ceil(height / bands)
    const split = n(params, 'rgb', 0)
    for (let band = 0; band < bands; band += 1) {
      const shift = Math.round((hash(band * 13 + seed) - 0.5) * width * n(params, 'amount', 0.45))
      const y0 = band * bandH
      const y1 = Math.min(height, y0 + bandH)
      for (let y = y0; y < y1; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4
          data[i] = sample(x + shift + split, y)[0]
          data[i + 1] = sample(x + shift, y)[1]
          data[i + 2] = sample(x + shift - split, y)[2]
          data[i + 3] = 255
        }
      }
    }
    return
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const r = copy[i]
      const g = copy[i + 1]
      const b = copy[i + 2]
      const l = luma(r, g, b)
      if (effect === 'rgb') {
        data[i] = mix(r, snap(r), amount)
        data[i + 1] = mix(g, snap(g), amount)
        data[i + 2] = mix(b, snap(b), amount)
      } else if (effect === 'threshold') {
        const v = l >= n(params, 'level', 0.45) * 255 ? 255 : 0
        data[i] = v
        data[i + 1] = v
        data[i + 2] = v
      } else if (effect === 'remains') {
        const keep = l < 200 - amount * 90 && noise(x * 0.4, y * 0.4, seed) > 0.18
        data[i] = keep ? r : 239
        data[i + 1] = keep ? g : 234
        data[i + 2] = keep ? b : 226
      } else if (effect === 'grainover') {
        const nse = (hash(i + seed * 17) - 0.5) * amount * 70
        data[i] = clamp(r + nse)
        data[i + 1] = clamp(g + nse)
        data[i + 2] = clamp(b + nse)
      } else {
        data[i] = rgb[0]
        data[i + 1] = rgb[1]
        data[i + 2] = rgb[2]
      }
    }
  }
}

function bookOfShapes(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string, paper: string) {
  const pattern = p(params, 'pattern', 'spiral')
  const cols = Math.round(n(params, 'cols', 30))
  const rows = Math.round(n(params, 'rows', 5))
  const morph = n(params, 'morph', 1)
  const turns = n(params, 'turns', 5.5)
  const radius = n(params, 'radius', 300)
  const noiseAmt = n(params, 'noiseAmt', 0.37)
  const noiseScale = n(params, 'noiseScale', 0)
  const seed = n(params, 'seed', 8)
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = 1.1
  const cx = w / 2
  const cy = h / 2
  if (pattern === 'flow') {
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        let px = (x / cols) * w
        let py = (y / rows) * h
        ctx.beginPath()
        ctx.moveTo(px, py)
        for (let s = 0; s < 18; s += 1) {
          const u = px / w
          const v = py / h
          const ang = Math.cos(Math.cos(v * 6) - u * v * 8) + fbm(u * (2 + noiseScale), v * (2 + noiseScale), seed) * noiseAmt * 4
          px += Math.cos(ang) * 7
          py += Math.sin(ang) * 7
          ctx.lineTo(px, py)
        }
        ctx.stroke()
      }
    }
    return
  }
  if (pattern === 'radial') {
    const rings = rows
    const spokes = cols
    for (let r = 1; r <= rings; r += 1) {
      ctx.beginPath()
      for (let s = 0; s <= spokes; s += 1) {
        const t = s / spokes
        const nse = fbm(t * (4 + noiseScale), r * 0.2, seed) * noiseAmt * 40
        const rad = (r / rings) * radius * 0.9 + nse
        const a = t * Math.PI * 2
        const x = cx + Math.cos(a) * rad
        const y = cy + Math.sin(a) * rad
        if (s === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    return
  }
  if (pattern === 'iso') {
    const step = Math.max(10, w / cols)
    ctx.strokeStyle = mixHex(ink, paper, 0.15)
    for (let y = -h; y < h * 2; y += step) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y + w * 0.58)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y - w * 0.58)
      ctx.stroke()
    }
    ctx.fillStyle = ink
    for (let i = 0; i < cols; i += 1) {
      const x = hash(i + seed) * w
      const y = hash(i + 9 + seed) * h
      const s = 8 + hash(i + 3) * 18
      ctx.beginPath()
      ctx.moveTo(x, y - s)
      ctx.lineTo(x + s * 0.86, y - s * 0.2)
      ctx.lineTo(x, y + s * 0.5)
      ctx.lineTo(x - s * 0.86, y - s * 0.2)
      ctx.closePath()
      ctx.globalAlpha = 0.55
      ctx.fill()
    }
    ctx.globalAlpha = 1
    return
  }
  if (pattern === 'grid') {
    const cw = w / cols
    const ch = h / rows
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const nse = fbm(x * 0.2 * (1 + noiseScale), y * 0.2, seed)
        if (nse < 0.28) continue
        const s = Math.min(cw, ch) * (0.25 + nse * 0.45)
        ctx.save()
        ctx.translate((x + 0.5) * cw, (y + 0.5) * ch)
        ctx.rotate(nse * morph * 1.2)
        ctx.strokeRect(-s / 2, -s / 2, s, s)
        ctx.restore()
      }
    }
    return
  }
  const count = cols * rows
  for (let i = 0; i < count; i += 1) {
    const gx = i % cols
    const gy = Math.floor(i / cols)
    const u = count <= 1 ? 0 : i / (count - 1)
    const theta = u * turns * Math.PI * 2
    const r = (u * radius * Math.min(w, h)) / 360
    const sx = cx + Math.cos(theta) * r
    const sy = cy + Math.sin(theta) * r
    const gxPos = ((gx + 0.5) / cols) * w
    const gyPos = ((gy + 0.5) / rows) * h
    const nse = fbm(gx * (0.15 + noiseScale * 0.1), gy * 0.15, seed)
    const t = Math.min(1, Math.max(0, morph + (nse - 0.5) * noiseAmt * 2))
    const x = gxPos + (sx - gxPos) * t
    const y = gyPos + (sy - gyPos) * t
    ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4)
  }
}

function uji(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const shape = Math.round(n(params, 'shape', 1))
  let rad = n(params, 'radius', 220)
  const iters = Math.round(n(params, 'iters', 80))
  const rot = (n(params, 'rot', 0.8) * Math.PI) / 180
  const expH = n(params, 'expH', 1.012)
  const expV = n(params, 'expV', 1.008)
  const thick = n(params, 'thick', 1)
  const wave = n(params, 'wave', 1.4)
  const jitter = n(params, 'jitter', 0.4)
  ctx.strokeStyle = ink
  ctx.lineWidth = thick
  ctx.lineCap = 'round'
  let ang = 0
  for (let i = 0; i < iters; i += 1) {
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate(ang)
    ctx.scale(expH ** i, expV ** i)
    const jx = (hash(i) - 0.5) * jitter * 8
    const jy = (hash(i + 3) - 0.5) * jitter * 8
    ctx.translate(jx, jy)
    ctx.beginPath()
    if (shape === 2) ctx.strokeRect(-rad, -rad, rad * 2, rad * 2)
    else if (shape === 3) {
      ctx.moveTo(0, -rad)
      ctx.lineTo(rad, rad)
      ctx.lineTo(-rad, rad)
      ctx.closePath()
      ctx.stroke()
    } else if (shape === 4) {
      const amp = Math.sin(i * 0.15) * wave * 6
      ctx.moveTo(-rad, amp)
      ctx.lineTo(rad, -amp)
      ctx.stroke()
    } else {
      ctx.arc(0, 0, rad + Math.sin(i * 0.2) * wave * 4, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (shape === 2) ctx.stroke()
    ctx.restore()
    ang += rot
    rad *= 1
  }
}

function automata(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const cw = Math.max(4, Math.round(n(params, 'cellW', 8)))
  const ch = Math.max(6, Math.round(n(params, 'cellH', 12)))
  const cols = Math.floor(w / cw)
  const rows = Math.floor(h / ch)
  const minScore = n(params, 'minScore', 35) / 100
  const chance = n(params, 'chance', 20) / 100
  const seed = n(params, 'seed', 3)
  const glyphs = ' .:-=+*#%@█▓▒░'
  ctx.fillStyle = ink
  ctx.font = `${ch}px "IBM Plex Mono", monospace`
  ctx.textBaseline = 'top'
  const grid: number[] = new Array(cols * rows).fill(-1)
  const start = Math.floor(hash(seed) * cols * rows)
  grid[start] = Math.floor(hash(seed + 1) * glyphs.length)
  const growth = p(params, 'growth', 'scan')
  const order: number[] = []
  for (let i = 0; i < cols * rows; i += 1) order.push(i)
  if (growth === 'random') order.sort((a, b) => hash(a + seed) - hash(b + seed * 2))
  if (growth === 'depth') order.sort((a, b) => Math.abs(a - start) - Math.abs(b - start))
  for (const i of order) {
    if (grid[i] >= 0) continue
    const x = i % cols
    const y = Math.floor(i / cols)
    let score = 0
    let votes = 0
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      ...(on(params, 'diag')
        ? [
            [1, 1],
            [-1, 1],
            [1, -1],
            [-1, -1],
          ]
        : []),
    ]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const v = grid[ny * cols + nx]
      if (v < 0) continue
      votes += 1
      score += 1 - Math.abs(v - (grid[start] % glyphs.length)) / glyphs.length
    }
    const s = votes ? score / votes : 0
    if (s < minScore && hash(i + seed) > chance) continue
    grid[i] = Math.floor((s + hash(i * 3 + seed)) * (glyphs.length - 1)) % glyphs.length
  }
  for (let i = 0; i < grid.length; i += 1) {
    if (grid[i] < 0) continue
    ctx.fillText(glyphs[grid[i]], (i % cols) * cw, Math.floor(i / cols) * ch)
  }
}

function hypha(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const text = p(params, 'text', 'HYPHA')
  const size = 96
  ctx.font = `600 ${size}px "Outfit", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const mutation = p(params, 'mutation', 'wild')
  const wild = mutation === 'overgrown' ? 1 : mutation === 'wild' ? 0.6 : 0.25
  const growth = n(params, 'growth', 0.7)
  const seed = n(params, 'seed', 7)
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  if (p(params, 'mycelium', 'on') === 'on') {
    ctx.lineWidth = 0.8
    const branches = 30 + Math.round(growth * 70)
    for (let i = 0; i < branches; i += 1) {
      let x = w * (0.2 + hash(i + seed) * 0.6)
      let y = h * (0.25 + hash(i + 4 + seed) * 0.5)
      ctx.beginPath()
      ctx.moveTo(x, y)
      const steps = 12 + Math.round(growth * 40)
      for (let s = 0; s < steps; s += 1) {
        const ang = (hash(i * 17 + s + seed) - 0.5) * wild * 3.6
        x += Math.cos(ang) * 6
        y += Math.sin(ang) * 6
        ctx.lineTo(x, y)
      }
      ctx.globalAlpha = 0.45
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  ctx.fillText(text, w / 2, h * 0.46)
  if (p(params, 'fruit', 'on') === 'on') {
    for (let i = 0; i < 10 + wild * 16; i += 1) {
      ctx.beginPath()
      ctx.arc(w * hash(i + seed + 9), h * hash(i + 2 + seed), 2 + n(params, 'surface', 0.45) * 7, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function dismal(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string, paper: string) {
  const letter = p(params, 'letter', 'A')
  const limit = Math.round(n(params, 'limit', 520))
  const branch = n(params, 'branch', 0.2)
  const seed = n(params, 'seed', 11)
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const o = off.getContext('2d')
  if (!o) return
  o.fillStyle = '#000'
  o.font = `700 ${Math.min(w, h) * 0.62}px "Outfit", sans-serif`
  o.textAlign = 'center'
  o.textBaseline = 'middle'
  o.fillText(letter, w / 2, h / 2)
  const mask = o.getImageData(0, 0, w, h).data
  const seeds: [number, number][] = []
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      if (mask[(y * w + x) * 4 + 3] > 40 && hash(x + y * 13 + seed) > 0.82) seeds.push([x, y])
    }
  }
  if (!seeds.length) seeds.push([w / 2, h / 2])
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = ink
  const stuck = seeds.slice()
  const max = Math.min(limit, 900)
  for (let i = 0; i < max; i += 1) {
    let x = hash(i + seed) * w
    let y = hash(i + 8 + seed) * h
    for (let step = 0; step < 80; step += 1) {
      x += (hash(i * 3 + step + seed) - 0.5) * 14
      y += (hash(i * 7 + step + seed) - 0.5) * 14
      const hit = stuck.find((s) => Math.hypot(s[0] - x, s[1] - y) < 3 + branch * 6)
      if (hit) {
        stuck.push([x, y])
        ctx.fillRect(x, y, 1.6, 1.6)
        break
      }
    }
  }
  const ow = n(params, 'outlineW', 1)
  if (ow > 0) {
    ctx.strokeStyle = hex(params, 'outline', ink)
    ctx.lineWidth = ow
    ctx.font = `700 ${Math.min(w, h) * 0.62}px "Outfit", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeText(letter, w / 2, h / 2)
  }
}

function rd(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string, paper: string) {
  const cols = 160
  const rows = 200
  const f = n(params, 'feed', 0.055)
  const k = n(params, 'kill', 0.062)
  const steps = Math.round(n(params, 'steps', 90))
  const scale = n(params, 'scale', 1)
  const flow = n(params, 'flow', 0)
  const seed = n(params, 'seed', 14)
  const a = new Float32Array(cols * rows).fill(1)
  const b = new Float32Array(cols * rows)
  const cx = cols / 2
  const cy = rows / 2
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (Math.hypot(x - cx, y - cy) < 6 + hash(x + y + seed) * 8) b[y * cols + x] = 1
    }
  }
  const lap = (grid: Float32Array, x: number, y: number) => {
    const i = y * cols + x
    const xm = (x + cols - 1) % cols
    const xp = (x + 1) % cols
    const ym = (y + rows - 1) % rows
    const yp = (y + 1) % rows
    return (
      grid[i] * -1 +
      grid[y * cols + xm] * 0.2 +
      grid[y * cols + xp] * 0.2 +
      grid[ym * cols + x] * 0.2 +
      grid[yp * cols + x] * 0.2 +
      grid[ym * cols + xm] * 0.05 +
      grid[ym * cols + xp] * 0.05 +
      grid[yp * cols + xm] * 0.05 +
      grid[yp * cols + xp] * 0.05
    )
  }
  const an = new Float32Array(cols * rows)
  const bn = new Float32Array(cols * rows)
  for (let s = 0; s < steps; s += 1) {
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x
        const aa = a[i]
        const bb = b[i]
        const abb = aa * bb * bb
        const fx = ((x / cols - 0.5) * flow * 2 + 0.5) * cols
        const src = Math.round(fx)
        const si = y * cols + ((src % cols) + cols) % cols
        const av = flow > 0 ? a[si] : aa
        const bv = flow > 0 ? b[si] : bb
        an[i] = av + (1.0 * lap(a, x, y) - abb + f * (1 - av)) * 1
        bn[i] = bv + (0.5 * lap(b, x, y) + abb - (k + f) * bv) * 1
      }
    }
    a.set(an)
    b.set(bn)
  }
  const ir = hexRgb(ink)
  const pr = hexRgb(paper)
  const image = ctx.createImageData(w, h)
  const invert = on(params, 'invert')
  const emboss = on(params, 'emboss')
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const gx = Math.floor(((x / w) * cols) / scale) % cols
      const gy = Math.floor(((y / h) * rows) / scale) % rows
      let v = b[(((gy + rows) % rows) * cols + (gx + cols) % cols)]
      if (emboss) {
        const nx = b[(((gy + rows) % rows) * cols + (gx + 1 + cols) % cols)]
        v = clamp((v - nx) * 4 + 0.5, 0, 1)
      }
      if (invert) v = 1 - v
      const i = (y * w + x) * 4
      image.data[i] = pr[0] + (ir[0] - pr[0]) * v
      image.data[i + 1] = pr[1] + (ir[1] - pr[1]) * v
      image.data[i + 2] = pr[2] + (ir[2] - pr[2]) * v
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

function desssign(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const brush = p(params, 'brush', 'ceramic')
  const width = n(params, 'width', 10)
  const speed = n(params, 'speed', 0.45)
  const relief = n(params, 'relief', 0.55)
  const grain = n(params, 'grain', 0.4)
  const light = (n(params, 'light', 40) * Math.PI) / 180
  const paths = Math.round(n(params, 'paths', 3))
  const seed = n(params, 'seed', 12)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let pth = 0; pth < paths; pth += 1) {
    let x = w * (0.15 + hash(pth + seed) * 0.7)
    let y = h * (0.15 + hash(pth + 5 + seed) * 0.7)
    const pts: [number, number, number][] = []
    for (let s = 0; s < 80; s += 1) {
      const ang = (hash(pth * 9 + s + seed) - 0.5) * 2.4 + pth * 0.4
      const vel = 3 + hash(s + seed) * 10 * speed
      x += Math.cos(ang) * vel
      y += Math.sin(ang) * vel
      pts.push([x, y, vel])
    }
    for (let i = 1; i < pts.length; i += 1) {
      const [, , vel] = pts[i]
      const thick = width * (0.4 + (1 - Math.min(1, vel / 12)) * speed + relief * 0.4)
      const shade = 0.35 + Math.cos(light - Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])) * relief * 0.4
      ctx.strokeStyle = mixHex(ink, '#ffffff', Math.min(0.6, Math.max(0, shade)))
      ctx.globalAlpha = 0.85
      ctx.lineWidth = Math.max(0.6, thick)
      ctx.beginPath()
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1])
      ctx.lineTo(pts[i][0], pts[i][1])
      ctx.stroke()
      if (brush === 'thorns' || brush === 'wire') {
        if (i % 5 === 0) {
          const ang = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(pts[i][0], pts[i][1])
          ctx.lineTo(pts[i][0] + Math.cos(ang + 1.2) * 10, pts[i][1] + Math.sin(ang + 1.2) * 10)
          ctx.stroke()
        }
      }
      if ((brush === 'sand' || brush === 'stipple' || brush === 'foam') && hash(i + seed) < grain) {
        ctx.fillStyle = ink
        ctx.beginPath()
        ctx.arc(pts[i][0] + (hash(i) - 0.5) * 8, pts[i][1], 1 + grain * 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.globalAlpha = 1
}

function sampl(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string, paper: string) {
  const text = p(params, 'text', 'TEST')
  const size = n(params, 'size', 140)
  const leading = n(params, 'leading', 80)
  const tracking = n(params, 'tracking', 8)
  const sample = n(params, 'sample', 0.3)
  const shape = p(params, 'shape', 'ellipse')
  const contour = n(params, 'contour', 0.75)
  const modifier = n(params, 'modifier', 0)
  const sides = Math.round(n(params, 'sides', 5))
  const fillType = p(params, 'fillType', 'color')
  const mod = p(params, 'mod', 'sin')
  const freq = n(params, 'freq', 2)
  const seed = n(params, 'seed', 3)
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const o = off.getContext('2d')
  if (!o) return
  o.fillStyle = '#000'
  o.font = `600 ${size}px "Outfit", sans-serif`
  o.textBaseline = 'top'
  o.letterSpacing = `${tracking}px`
  text.split('\n').forEach((line, i) => o.fillText(line, w * 0.08, h * 0.28 + i * (size + leading * 0.2)))
  const mask = o.getImageData(0, 0, w, h).data
  const step = Math.max(3, Math.round(10 * (1.05 - sample)))
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = 1
  let idx = 0
  for (let y = 2; y < h - 2; y += step) {
    for (let x = 2; x < w - 2; x += step) {
      const a = mask[(y * w + x) * 4 + 3]
      if (a < 40) continue
      const edge = mask[(y * w + x - step) * 4 + 3] < 40 || mask[(y * w + x + step) * 4 + 3] < 40 || mask[((y - step) * w + x) * 4 + 3] < 40
      if (!edge && sample < 0.85) continue
      idx += 1
      const wave = mod === 'none' ? 1 : mod === 'sin' ? 0.55 + Math.sin(idx * freq * 0.15) * 0.45 : 0.4 + fbm(x * 0.02, y * 0.02, seed) * 0.8
      const r = (4 + contour * 10 + modifier * 8) * wave
      ctx.save()
      ctx.translate(x, y)
      if (fillType === 'palette') ctx.fillStyle = mixHex(ink, paper, hash(idx + seed))
      if (fillType === 'none') ctx.fillStyle = 'transparent'
      ctx.beginPath()
      if (shape === 'rect') ctx.rect(-r, -r, r * 2, r * 2)
      else if (shape === 'triangle') {
        ctx.moveTo(0, -r)
        ctx.lineTo(r, r)
        ctx.lineTo(-r, r)
        ctx.closePath()
      } else if (shape === 'polygon') {
        for (let s = 0; s < sides; s += 1) {
          const a2 = (s / sides) * Math.PI * 2 - Math.PI / 2
          const px = Math.cos(a2) * r
          const py = Math.sin(a2) * r
          if (s === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
      } else ctx.arc(0, 0, r, 0, Math.PI * 2)
      if (fillType === 'none') ctx.stroke()
      else ctx.fill()
      ctx.restore()
    }
  }
}

function calligrapher(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const text = p(params, 'text', 'as written').slice(0, 50)
  const style = Math.round(n(params, 'style', 3))
  const legibility = n(params, 'legibility', 0.75)
  const width = n(params, 'width', 0.75)
  const seed = n(params, 'seed', 5) + style * 17
  ctx.strokeStyle = ink
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  let x = w * 0.1
  let y = h * 0.48
  const temp = 1.3 - Math.min(1.2, legibility) * 0.5
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i)
    if (text[i] === ' ') {
      x += 18 + width * 10
      continue
    }
    const lean = (hash(ch + seed) - 0.5) * temp * 18
    const rise = (hash(ch + 3 + seed) - 0.5) * temp * 22
    const loop = 10 + hash(ch + 7 + seed) * 16 * (0.4 + width)
    ctx.lineWidth = 1.2 + width * 4 * (0.6 + hash(i + seed) * 0.8)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + 8 + lean, y - loop + rise, x + 16 - lean, y + loop * 0.3, x + 22 + hash(i) * 8, y + rise * 0.2)
    ctx.stroke()
    if (hash(ch + 11 + seed) > 0.55) {
      ctx.beginPath()
      ctx.moveTo(x + 10, y - loop * 0.4)
      ctx.quadraticCurveTo(x + 14, y - loop, x + 20, y - 4)
      ctx.stroke()
    }
    x += 20 + width * 8 + (hash(i + 2) - 0.5) * temp * 8
    y = h * 0.48 + Math.sin(i * 0.4 + seed) * temp * 10
    if (x > w * 0.9) {
      x = w * 0.1
      y += 54
    }
  }
}

function stoer(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const text = p(params, 'text', 'STOER')
  const size = n(params, 'size', 160)
  const track = n(params, 'track', 12)
  const disturb = n(params, 'disturb', 25) / 100
  const diamond = n(params, 'diamond', 0) / 100
  const circle = n(params, 'circle', 0) / 100
  const line = n(params, 'line', 0) / 100
  const diagonal = n(params, 'diagonal', 0) / 100
  const shear = (n(params, 'shear', 0) * Math.PI) / 180
  const seed = n(params, 'seed', 4)
  ctx.fillStyle = ink
  ctx.strokeStyle = ink
  ctx.font = `600 ${size}px "IBM Plex Mono", monospace`
  ctx.textBaseline = 'middle'
  let x = w * 0.08
  const y = h * 0.45
  for (let i = 0; i < text.length; i += 1) {
    ctx.save()
    ctx.translate(x, y)
    ctx.transform(1, 0, Math.tan(shear), 1, 0, 0)
    const jx = (hash(i + seed) - 0.5) * disturb * 40
    const jy = (hash(i + 3 + seed) - 0.5) * disturb * 30
    ctx.translate(jx, jy)
    if (n(params, 'outlineW', 0) > 0) {
      ctx.lineWidth = n(params, 'outlineW', 0)
      ctx.strokeText(text[i], 0, 0)
    } else ctx.fillText(text[i], 0, 0)
    if (diamond > 0) {
      ctx.globalAlpha = diamond
      ctx.beginPath()
      ctx.moveTo(size * 0.2, -size * 0.4)
      ctx.lineTo(size * 0.45, 0)
      ctx.lineTo(size * 0.2, size * 0.4)
      ctx.lineTo(-0.05, 0)
      ctx.closePath()
      ctx.stroke()
    }
    if (circle > 0) {
      ctx.globalAlpha = circle
      ctx.beginPath()
      ctx.arc(size * 0.22, 0, size * 0.28, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (line > 0) {
      ctx.globalAlpha = line
      ctx.beginPath()
      ctx.moveTo(-4, size * 0.2)
      ctx.lineTo(size * 0.5, size * 0.2)
      ctx.stroke()
    }
    if (diagonal > 0) {
      ctx.globalAlpha = diagonal
      ctx.beginPath()
      ctx.moveTo(0, -size * 0.3)
      ctx.lineTo(size * 0.4, size * 0.3)
      ctx.stroke()
    }
    ctx.restore()
    x += size * 0.55 + track
  }
}

function spaceType(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const text = p(params, 'text', 'I-TRY-ALL-THINGS')
  const form = p(params, 'form', 'cylinder')
  const radius = n(params, 'radius', 180)
  const count = Math.round(n(params, 'count', 3))
  const rotate = n(params, 'rotate', -5)
  const waves = n(params, 'waves', 2)
  const lat = n(params, 'lat', 12)
  const ripple = n(params, 'ripple', 8)
  const zoom = n(params, 'zoom', 0)
  const tilt = (n(params, 'tilt', 15) * Math.PI) / 180
  ctx.fillStyle = ink
  ctx.font = `500 ${18 + n(params, 'radius', 180) / 14}px "IBM Plex Mono", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const chars = text.split('')
  for (let ring = 0; ring < count; ring += 1) {
    for (let i = 0; i < chars.length; i += 1) {
      const t = i / Math.max(1, chars.length)
      const a = t * Math.PI * 2 + (rotate * ring) / 20
      const wave = Math.sin(t * waves * Math.PI * 2 + ring) * lat
      let x = w / 2
      let y = h / 2
      let z = 0
      if (form === 'field') {
        x = w * 0.12 + t * w * 0.76
        y = h * 0.25 + ring * 48 + Math.sin(t * 8) * ripple
      } else if (form === 'coil') {
        x = w / 2 + Math.cos(a * 3) * (radius * 0.4 + ring * 10)
        y = h * 0.18 + t * h * 0.64
      } else if (form === 'flag') {
        x = w * 0.16 + t * w * 0.68
        y = h * 0.4 + ring * 22 + Math.sin(t * 10 + ring) * ripple
      } else if (form === 'ribbon') {
        x = w / 2 + Math.cos(a) * radius * 0.3
        y = h * 0.2 + t * h * 0.6 + ring * 8
      } else {
        z = Math.sin(a) * radius
        x = w / 2 + Math.cos(a) * (radius + wave)
        y = h / 2 + (ring - count / 2) * 36 + Math.sin(a * 2) * ripple + z * Math.sin(tilt) * 0.2
      }
      const scale = 1 + zoom / 500 + (form === 'cylinder' ? Math.cos(a) * 0.25 : 0)
      ctx.save()
      ctx.translate(x, y)
      ctx.scale(scale, scale)
      ctx.rotate(form === 'cylinder' ? a + Math.PI / 2 : 0)
      ctx.fillText(chars[i], 0, 0)
      ctx.restore()
    }
  }
}

function pixelbrei(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>) {
  const text = p(params, 'text', 'PIXEL')
  const size = n(params, 'size', 80)
  const style = p(params, 'style', 'style1')
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const o = off.getContext('2d')
  if (!o) return
  o.fillStyle = '#fff'
  o.fillRect(0, 0, w, h)
  o.fillStyle = '#000'
  o.font = `700 ${size}px "Outfit", sans-serif`
  o.textAlign = 'center'
  o.textBaseline = 'middle'
  o.fillText(text, w / 2, h / 2)
  const src = o.getImageData(0, 0, w, h).data
  const cells = [
    ['#e23', n(params, 'red', 8)],
    ['#2c6', n(params, 'green', 8)],
    ['#28d', n(params, 'blue', 20)],
  ] as const
  ctx.fillStyle = hex(params, 'colorB', '#efeae2')
  ctx.fillRect(0, 0, w, h)
  cells.forEach(([color, cell], channel) => {
    const step = Math.max(4, cell + (style === 'style2' ? 4 : 0))
    ctx.fillStyle = color
    ctx.globalAlpha = 0.7
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step + (style === 'style2' ? (channel % 2) * 3 : 0)) {
        const i = (y * w + x) * 4
        if (src[i] < 80) ctx.fillRect(x, y, step - 1, step - 1)
      }
    }
  })
  ctx.globalAlpha = 1
}

function echoes(ctx: CanvasRenderingContext2D, w: number, _h: number, params: Record<string, string>, ink: string) {
  const a = p(params, 'wordA', 'VISUAL')
  const b = p(params, 'wordB', 'ECHOES')
  const size = n(params, 'size', 90)
  const leading = n(params, 'leading', 60)
  const rows = Math.round(n(params, 'rows', 4))
  const faces = ['"Outfit", sans-serif', '"Instrument Serif", serif', '"IBM Plex Mono", monospace']
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let r = 0; r < rows * 4; r += 1) {
    ctx.font = `600 ${size}px ${faces[r % faces.length]}`
    ctx.fillText(r % 2 === 0 ? a : b, w / 2, 40 + r * leading)
  }
}

const BRUT: Record<string, [number, number][]> = {
  A: [[0, 4], [1, 0], [2, 4], [0.4, 2.4], [1.6, 2.4]],
  B: [[0, 0], [0, 4], [1.6, 4], [2, 3], [1.6, 2], [0, 2], [1.6, 2], [2, 1], [1.6, 0], [0, 0]],
  R: [[0, 4], [0, 0], [1.5, 0], [2, 1], [1.5, 2], [0, 2], [2, 4]],
  U: [[0, 0], [0, 3.2], [1, 4], [2, 3.2], [2, 0]],
  T: [[0, 0], [2, 0], [1, 0], [1, 4]],
  L: [[0, 0], [0, 4], [2, 4]],
  I: [[1, 0], [1, 4]],
  E: [[2, 0], [0, 0], [0, 4], [2, 4], [0, 2], [1.5, 2]],
}

function brutalita(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const text = p(params, 'text', 'BRUT').toUpperCase()
  const size = n(params, 'size', 140)
  const weight = n(params, 'weight', 8)
  ctx.strokeStyle = ink
  ctx.lineWidth = weight
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const unit = size / 4
  let x = w * 0.1
  const y = h * 0.38
  for (const ch of text) {
    const pts = BRUT[ch]
    if (pts) {
      ctx.beginPath()
      pts.forEach((pt, i) => {
        const px = x + pt[0] * unit
        const py = y + pt[1] * unit
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
    }
    x += size * 0.7
  }
}

function taag(ctx: CanvasRenderingContext2D, _w: number, h: number, params: Record<string, string>, ink: string) {
  const text = p(params, 'text', 'Hello').toUpperCase()
  const face = p(params, 'face', 'standard')
  const rainbow = p(params, 'filter', 'none') === 'rainbow'
  const flip = p(params, 'filter', 'none') === 'flip'
  ctx.font = `${face === 'small' ? 10 : 13}px "IBM Plex Mono", monospace`
  ctx.textBaseline = 'top'
  const glyphs: Record<string, string[]> = {
    A: ['  ##  ', ' #  # ', '######', '#    #', '#    #'],
    B: ['##### ', '#    #', '##### ', '#    #', '##### '],
    E: ['######', '#     ', '##### ', '#     ', '######'],
    H: ['#    #', '#    #', '######', '#    #', '#    #'],
    L: ['#     ', '#     ', '#     ', '#     ', '######'],
    O: [' #### ', '#    #', '#    #', '#    #', ' #### '],
    T: ['######', '  ##  ', '  ##  ', '  ##  ', '  ##  '],
  }
  const rows = 5
  const colW = face === 'block' ? 16 : face === 'banner' ? 14 : 11
  let x0 = 16
  const y0 = h * 0.28
  for (const ch of text) {
    if (ch === ' ') {
      x0 += colW * 2
      continue
    }
    let rowsG = glyphs[ch] ?? ['######', '#    #', '#    #', '#    #', '######']
    if (flip) rowsG = [...rowsG].reverse()
    rowsG.forEach((row, yi) => {
      row.split('').forEach((cell, xi) => {
        if (cell === ' ') return
        ctx.fillStyle = rainbow ? `hsl(${(xi + yi) * 28} 80% 40%)` : ink
        const x = x0 + xi * (face === 'slant' ? 9 : 8) + (face === 'slant' ? (rows - yi) * 3 : 0)
        const y = y0 + yi * 14
        if (face === 'block') ctx.fillRect(x, y, 12, 12)
        else ctx.fillText(face === 'banner' ? '#' : cell, x, y)
      })
    })
    x0 += colW * 4
  }
}

function titleArt(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string, paper: string) {
  const text = p(params, 'text', 'WordArt')
  const shape = p(params, 'shape', 'slantUp')
  const size = n(params, 'size', 140)
  const fill = p(params, 'fill', 'gradient')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${size}px "Outfit", sans-serif`
  if (fill === 'gradient') {
    const g = ctx.createLinearGradient(w * 0.2, h * 0.3, w * 0.8, h * 0.6)
    g.addColorStop(0, ink)
    g.addColorStop(1, hex(params, 'colorC', paper))
    ctx.fillStyle = g
  } else ctx.fillStyle = ink
  const letters = text.split('')
  const total = letters.length
  letters.forEach((ch, i) => {
    const t = total <= 1 ? 0.5 : i / (total - 1)
    const x = w * 0.18 + t * w * 0.64
    let y = h * 0.45
    let rot = 0
    let sc = 1
    if (shape === 'slantUp') y -= t * 50
    if (shape === 'slantDown') y += t * 50
    if (shape === 'arch') y -= Math.sin(t * Math.PI) * 70
    if (shape === 'wave') y += Math.sin(t * Math.PI * 2) * 28
    if (shape === 'inflate') sc = 0.75 + Math.sin(t * Math.PI) * 0.5
    if (shape === 'perspective') sc = 0.55 + t * 0.7
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.scale(sc, sc)
    ctx.fillText(ch, 0, 0)
    ctx.restore()
  })
}

function monoTool(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>) {
  const bgBri = n(params, 'bgBri', 95)
  const bgHue = n(params, 'bgHue', 0)
  ctx.fillStyle = `hsl(${bgHue} 8% ${bgBri}%)`
  ctx.fillRect(0, 0, w, h)
  const count = Math.round(n(params, 'count', 16))
  const seed = n(params, 'seed', 5)
  const mode = p(params, 'mode', 'spike')
  const gHue = n(params, 'gHue', 360)
  const gSat = n(params, 'gSat', 80)
  const cols = 8
  const rows = 10
  const cw = w / cols
  const ch = h / rows
  for (let i = 0; i < count; i += 1) {
    const gx = Math.floor(hash(i + seed) * cols)
    const gy = Math.floor(hash(i + 4 + seed) * rows)
    const x = gx * cw
    const y = gy * ch
    if (mode === 'gradient') {
      const g = ctx.createLinearGradient(x, y, x + cw, y + ch)
      g.addColorStop(0, `hsl(${gHue} ${gSat}% 60%)`)
      g.addColorStop(1, `hsl(${gHue} ${gSat}% 12%)`)
      ctx.fillStyle = g
      ctx.fillRect(x, y, cw, ch)
    } else {
      ctx.fillStyle = `hsl(${gHue} ${mode === 'roehr' ? 10 : gSat}% ${20 + hash(i) * 40}%)`
      ctx.beginPath()
      ctx.moveTo(x + cw / 2, y + 4)
      ctx.lineTo(x + cw - 4, y + ch - 4)
      ctx.lineTo(x + 4, y + ch - 4)
      ctx.closePath()
      ctx.fill()
    }
  }
}

function typeOfImage(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string, paper: string, source?: ImageData) {
  const text = p(params, 'text', 'IMAGE')
  const size = n(params, 'size', 220)
  const leading = n(params, 'leading', 220)
  const gap = n(params, 'gap', 4)
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const o = off.getContext('2d')
  if (!o) return
  o.fillStyle = '#000'
  o.font = `800 ${size}px "Outfit", sans-serif`
  o.textBaseline = 'middle'
  o.textAlign = p(params, 'align', 'left') as CanvasTextAlign
  const x0 = p(params, 'align', 'left') === 'center' ? w / 2 : p(params, 'align', 'left') === 'right' ? w * 0.92 : w * 0.08
  text.split('\n').forEach((line, i) => o.fillText(line, x0, h * 0.42 + i * leading * 0.35))
  const mask = o.getImageData(0, 0, w, h).data
  const tLow = n(params, 'tLow', 30)
  const tHigh = n(params, 'tHigh', 240)
  const sDark = n(params, 'sDark', 30)
  const sMid = n(params, 'sMid', 30)
  const sBright = n(params, 'sBright', 30)
  const sample = p(params, 'sample', 'light')
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, w, h)
  for (let y = gap; y < h; y += gap + 2) {
    for (let x = gap; x < w; x += gap + 2) {
      if (mask[(y * w + x) * 4 + 3] < 40) continue
      let l = 180
      let cr = 28
      let cg = 25
      let cb = 21
      if (source) {
        const i = (y * w + x) * 4
        cr = source.data[i]
        cg = source.data[i + 1]
        cb = source.data[i + 2]
        l = luma(cr, cg, cb)
      }
      let rad = sMid * 0.12
      if (sample === 'auto') rad = (1 - l / 255) * (n(params, 'contrast', 100) / 100) * gap
      else if (l < tLow) rad = sDark * 0.12
      else if (l > tHigh) rad = sBright * 0.08
      ctx.fillStyle = p(params, 'colorize', 'color') === 'gray' ? `rgb(${l},${l},${l})` : source ? `rgb(${cr},${cg},${cb})` : ink
      ctx.beginPath()
      if (p(params, 'dot', 'ellipse') === 'rect') ctx.rect(x - rad, y - rad, rad * 2, rad * 2)
      else ctx.arc(x, y, Math.max(0.4, rad), 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function genFont(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const text = p(params, 'text', 'GEN')
  const size = n(params, 'size', 120)
  const face = p(params, 'face', 'glitch')
  const shift = n(params, 'shift', 28)
  const slice = Math.max(2, n(params, 'slice', 5))
  const seed = n(params, 'seed', 6)
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const o = off.getContext('2d')
  if (!o) return
  o.fillStyle = ink
  o.font = `700 ${size}px "Outfit", sans-serif`
  o.textBaseline = 'middle'
  o.fillText(text, w * 0.1, h * 0.45)
  if (face === 'pixels') {
    const src = o.getImageData(0, 0, w, h)
    ctx.fillStyle = ink
    const cell = 6
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        if (src.data[(y * w + x) * 4 + 3] > 40) ctx.fillRect(x, y, cell - 1, cell - 1)
      }
    }
    return
  }
  if (face === 'lines' || face === 'hatch') {
    ctx.strokeStyle = ink
    ctx.lineWidth = 1
    const src = o.getImageData(0, 0, w, h).data
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 6) {
        if (src[(y * w + x) * 4 + 3] < 40) continue
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + (face === 'hatch' ? 5 : 8), y + (face === 'hatch' ? 5 : 0))
        ctx.stroke()
      }
    }
    return
  }
  ctx.drawImage(off, 0, 0)
  if (face === 'glitch' || face === 'broken') {
    const src = ctx.getImageData(0, 0, w, h)
    const out = ctx.createImageData(w, h)
    for (let y = 0; y < h; y += 1) {
      const band = Math.floor(y / slice)
      const dx = Math.round((hash(band + seed) - 0.5) * shift)
      for (let x = 0; x < w; x += 1) {
        const sx = Math.min(w - 1, Math.max(0, x + dx))
        const i = (y * w + x) * 4
        const si = (y * w + sx) * 4
        out.data[i] = src.data[si]
        out.data[i + 1] = src.data[si + 1]
        out.data[i + 2] = src.data[si + 2]
        out.data[i + 3] = src.data[si + 3]
      }
    }
    ctx.putImageData(out, 0, 0)
  }
  if (face === 'goo' || face === 'dirt') {
    ctx.globalAlpha = 0.35
    for (let i = 0; i < 40; i += 1) {
      ctx.beginPath()
      ctx.arc(w * hash(i + seed), h * 0.45 + (hash(i + 2) - 0.5) * size, 4 + hash(i) * 14, 0, Math.PI * 2)
      ctx.fillStyle = ink
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
}

function svgType(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const a = p(params, 'text', 'Hello')
  const b = p(params, 'textB', 'World')
  const morph = n(params, 'morph', 0) / 100
  const text = morph > 0.5 ? b : a
  const size = n(params, 'size', 160)
  const space = n(params, 'space', 1)
  const density = n(params, 'density', 12)
  const mark = n(params, 'markSize', 3)
  const marker = p(params, 'marker', 'dot')
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = n(params, 'strokeW', 2)
  ctx.font = `${p(params, 'font', 'hershey') === 'script' ? 'italic ' : ''}${size}px "${p(params, 'font', 'hershey') === 'gothic' ? 'Instrument Serif' : 'Outfit'}", sans-serif`
  ctx.textBaseline = 'middle'
  ctx.strokeText(text, w * 0.08, h * 0.42)
  const width = ctx.measureText(text).width * space
  const count = Math.max(4, Math.round(width / Math.max(4, 40 / density)))
  for (let i = 0; i < count; i += 1) {
    const t = i / count
    const x = w * 0.08 + t * width
    const y = h * 0.42 + Math.sin(t * 8) * (n(params, 'pull', 0) / 8)
    if (marker === 'cross') {
      ctx.beginPath()
      ctx.moveTo(x - mark, y)
      ctx.lineTo(x + mark, y)
      ctx.moveTo(x, y - mark)
      ctx.lineTo(x, y + mark)
      ctx.stroke()
    } else if (marker === 'square') ctx.fillRect(x - mark, y - mark, mark * 2, mark * 2)
    else if (marker === 'nib') {
      ctx.beginPath()
      ctx.moveTo(x, y - mark)
      ctx.lineTo(x + mark, y)
      ctx.lineTo(x, y + mark)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, mark, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function glitchType(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string, paper: string) {
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = ink
  ctx.font = `600 ${n(params, 'size', 100)}px "Instrument Serif", serif`
  ctx.textAlign = p(params, 'align', 'center') as CanvasTextAlign
  ctx.textBaseline = 'middle'
  const x = p(params, 'align', 'center') === 'left' ? w * 0.08 : p(params, 'align', 'center') === 'right' ? w * 0.92 : w / 2
  if (on(params, 'strokeOn') || p(params, 'strokeOn', 'on') === 'on') {
    ctx.strokeStyle = hex(params, 'stroke', '#ffffff')
    ctx.lineWidth = n(params, 'strokeW', 1)
    ctx.strokeText(p(params, 'text', 'GLITCH'), x, h / 2)
  }
  ctx.fillText(p(params, 'text', 'GLITCH'), x, h / 2)
  if (p(params, 'effect', 'on') !== 'on') return
  const chunk = Math.max(5, n(params, 'chunk', 50))
  const seed = n(params, 'seed', 2)
  const src = ctx.getImageData(0, 0, w, h)
  const out = ctx.createImageData(w, h)
  out.data.set(src.data)
  for (let y = 0; y < h; y += chunk) {
    for (let x0 = 0; x0 < w; x0 += chunk) {
      const dx = Math.round((hash(x0 + y + seed) - 0.5) * chunk)
      const dy = Math.round((hash(x0 * 2 + y + seed) - 0.5) * chunk * 0.4)
      for (let yy = 0; yy < chunk; yy += 1) {
        for (let xx = 0; xx < chunk; xx += 1) {
          const sy = Math.min(h - 1, Math.max(0, y + yy))
          const sx = Math.min(w - 1, Math.max(0, x0 + xx))
          const dy2 = Math.min(h - 1, Math.max(0, sy + dy))
          const dx2 = Math.min(w - 1, Math.max(0, sx + dx))
          const i = (dy2 * w + dx2) * 4
          const si = (sy * w + sx) * 4
          out.data[i] = src.data[si]
          out.data[i + 1] = src.data[si + 1]
          out.data[i + 2] = src.data[si + 2]
          out.data[i + 3] = src.data[si + 3]
        }
      }
    }
  }
  ctx.putImageData(out, 0, 0)
}

function notMachine(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const density = n(params, 'density', 0.55)
  const mark = n(params, 'mark', 14)
  const seed = n(params, 'seed', 6)
  const motion = p(params, 'motion', 'none')
  ctx.font = `800 ${h * 0.28}px "Outfit", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const o = off.getContext('2d')
  if (!o) return
  o.font = ctx.font
  o.textAlign = 'center'
  o.textBaseline = 'middle'
  o.fillText('NOT', w / 2, h / 2)
  const mask = o.getImageData(0, 0, w, h).data
  ctx.fillStyle = ink
  for (let y = 8; y < h; y += 18) {
    for (let x = 8; x < w; x += 16) {
      if (mask[(y * w + x) * 4 + 3] < 40 || hash(x + y + seed) > density) continue
      const ang = motion === 'rotate' ? hash(x + seed) * 6 : motion === 'orbit' ? (x + y) * 0.01 : motion === 'swing' ? Math.sin(x * 0.05) : 0
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(ang)
      ctx.fillRect(-mark / 2, -2, mark, 4)
      ctx.restore()
    }
  }
}

function rgbGrid(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>) {
  const cols = 40
  const rows = 30
  const cw = w / cols
  const ch = h / rows
  const fill = n(params, 'fill', 0.35)
  const seed = n(params, 'seed', 2)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (hash(x * 9 + y * 13 + seed) > fill) continue
      const r = snap(hash(x + seed) * 255)
      const g = snap(hash(y + seed) * 255)
      const b = snap(hash(x + y + seed) * 255)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(x * cw, y * ch, cw, ch)
    }
  }
  if (on(params, 'gridOn') || p(params, 'gridOn', 'off') === 'on') {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 1
    for (let x = 0; x <= cols; x += 1) {
      ctx.beginPath()
      ctx.moveTo(x * cw, 0)
      ctx.lineTo(x * cw, h)
      ctx.stroke()
    }
  }
}

function minimalier(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  const strokes = Math.round(n(params, 'strokes', 6))
  const agents = Math.round(n(params, 'agents', 80))
  const seed = n(params, 'seed', 17)
  ctx.strokeStyle = ink
  ctx.lineWidth = 0.8
  for (let s = 0; s < strokes; s += 1) {
    const x0 = hash(s + seed) * w
    const y0 = hash(s + 4 + seed) * h
    const x1 = hash(s + 8 + seed) * w
    const y1 = hash(s + 12 + seed) * h
    for (let a = 0; a < agents / strokes; a += 1) {
      const t = a / Math.max(1, agents / strokes)
      const jx = (hash(s * 20 + a + seed) - 0.5) * 40
      const jy = (hash(s * 21 + a + seed) - 0.5) * 40
      ctx.globalAlpha = 0.35
      ctx.beginPath()
      ctx.moveTo(x0 + jx, y0 + jy)
      ctx.lineTo(x1 + jx * 0.3, y1 + jy * 0.3)
      ctx.stroke()
      if (t > 0.7) {
        ctx.fillStyle = ink
        ctx.fillRect(x1 + jx, y1 + jy, 1.5, 1.5)
      }
    }
  }
  ctx.globalAlpha = 1
}

function moireForms(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string, paper: string) {
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, w, h)
  const pattern = p(params, 'pattern', 'lines')
  const spacing = n(params, 'spacing', 8)
  const weight = n(params, 'weight', 1)
  const opacity = n(params, 'opacity', 0.5)
  const draw = (angle: number) => {
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate((angle * Math.PI) / 180)
    ctx.translate(-w / 2, -h / 2)
    ctx.strokeStyle = ink
    ctx.fillStyle = ink
    ctx.globalAlpha = opacity
    ctx.lineWidth = weight
    if (pattern === 'circles') {
      for (let r = spacing; r < Math.hypot(w, h); r += spacing) {
        ctx.beginPath()
        ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2)
        ctx.stroke()
      }
    } else if (pattern === 'dots') {
      for (let y = 0; y < h; y += spacing) {
        for (let x = 0; x < w; x += spacing) {
          ctx.beginPath()
          ctx.arc(x, y, weight, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    } else if (pattern === 'grid') {
      for (let x = 0; x < w; x += spacing) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      for (let y = 0; y < h; y += spacing) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
    } else {
      for (let y = -h; y < h * 2; y += spacing) {
        ctx.beginPath()
        ctx.moveTo(-w, y)
        ctx.lineTo(w * 2, y)
        ctx.stroke()
      }
    }
    ctx.restore()
  }
  draw(n(params, 'angleA', 0))
  draw(n(params, 'angleB', 3))
  ctx.globalAlpha = 1
}

function csMoire(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string) {
  let x = w / 2
  let y = h / 2
  let heading = (n(params, 'heading', 20) * Math.PI) / 180
  const thrust = n(params, 'thrust', 0.7)
  const turn = n(params, 'turn', 0.35)
  const steps = Math.round(n(params, 'steps', 180))
  ctx.strokeStyle = ink
  ctx.lineWidth = 1.2
  ctx.lineCap = 'round'
  let vx = Math.cos(heading) * thrust * 4
  let vy = Math.sin(heading) * thrust * 4
  for (let i = 0; i < steps; i += 1) {
    heading += turn * 0.04
    vx += Math.cos(heading) * thrust * 0.18
    vy += Math.sin(heading) * thrust * 0.18
    const speed = Math.hypot(vx, vy)
    if (speed > 4) {
      vx = (vx / speed) * 4
      vy = (vy / speed) * 4
    }
    x = (x + vx + w) % w
    y = (y + vy + h) % h
    const left = heading + 2.6
    const right = heading - 2.6
    const len = Math.hypot(w, h) * 0.22
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(left) * len, y + Math.sin(left) * len)
    ctx.lineTo(x, y)
    ctx.lineTo(x + Math.cos(right) * len, y + Math.sin(right) * len)
    ctx.globalAlpha = 0.18
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function typeBlur(ctx: CanvasRenderingContext2D, w: number, h: number, params: Record<string, string>, ink: string, paper: string, source?: ImageData) {
  if (source) {
    ctx.putImageData(source, 0, 0)
  } else {
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = ink
    ctx.font = `${p(params, 'italic', 'off') === 'on' ? 'italic ' : ''}800 ${n(params, 'size', 220)}px "Outfit", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.letterSpacing = `${n(params, 'tracking', -20)}px`
    ctx.fillText(p(params, 'text', 'OAK'), w / 2, h / 2)
  }
  const image = ctx.getImageData(0, 0, w, h)
  blurImage(image, n(params, 'blur', 10))
  if (on(params, 'invert')) {
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = 255 - image.data[i]
      image.data[i + 1] = 255 - image.data[i + 1]
      image.data[i + 2] = 255 - image.data[i + 2]
    }
  }
  ctx.putImageData(image, 0, 0)
}

function ditherGarden(image: ImageData, params: Record<string, string>) {
  const { data, width, height } = image
  const algorithm = p(params, 'algorithm', 'atkinson')
  const mode = p(params, 'mode', 'mono')
  const pixel = Math.max(1, Math.round(n(params, 'pixel', 3)))
  const brightness = n(params, 'brightness', 0) / 100
  const contrast = 1 + n(params, 'contrast', 0) / 100
  const gamma = n(params, 'gamma', 1)
  const invert = on(params, 'invert')
  const shadow = hexRgb(hex(params, 'shadow', '#000000'))
  const mid = hexRgb(hex(params, 'mid', '#808080'))
  const high = hexRgb(hex(params, 'high', '#ffffff'))
  const copy = new Float32Array(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      let r = data[i] / 255
      let g = data[i + 1] / 255
      let b = data[i + 2] / 255
      r = ((r - 0.5) * contrast + 0.5 + brightness) ** (1 / gamma)
      g = ((g - 0.5) * contrast + 0.5 + brightness) ** (1 / gamma)
      b = ((b - 0.5) * contrast + 0.5 + brightness) ** (1 / gamma)
      if (invert) {
        r = 1 - r
        g = 1 - g
        b = 1 - b
      }
      copy[(y * width + x) * 3] = clamp(r * 255)
      copy[(y * width + x) * 3 + 1] = clamp(g * 255)
      copy[(y * width + x) * 3 + 2] = clamp(b * 255)
    }
  }
  const kernel =
    algorithm === 'floyd'
      ? [
          [1, 0, 7 / 16],
          [-1, 1, 3 / 16],
          [0, 1, 5 / 16],
          [1, 1, 1 / 16],
        ]
      : algorithm === 'stucki'
        ? [
            [1, 0, 8 / 42],
            [2, 0, 4 / 42],
            [-2, 1, 2 / 42],
            [-1, 1, 4 / 42],
            [0, 1, 8 / 42],
            [1, 1, 4 / 42],
            [2, 1, 2 / 42],
          ]
        : algorithm === 'jarvis'
          ? [
              [1, 0, 7 / 48],
              [2, 0, 5 / 48],
              [-2, 1, 3 / 48],
              [-1, 1, 5 / 48],
              [0, 1, 7 / 48],
              [1, 1, 5 / 48],
              [2, 1, 3 / 48],
            ]
          : [
              [1, 0, 1 / 8],
              [2, 0, 1 / 8],
              [-1, 1, 1 / 8],
              [0, 1, 1 / 8],
              [1, 1, 1 / 8],
            ]
  const asciiRamp = p(params, 'asciiSet', 'shades') === 'blocks' ? ' ░▒▓█' : p(params, 'asciiSet', 'shades') === 'binary' ? ' 01' : ' .:-=+*#%@'
  for (let y = 0; y < height; y += pixel) {
    for (let x = 0; x < width; x += pixel) {
      const i = (y * width + x) * 3
      const r = copy[i]
      const g = copy[i + 1]
      const b = copy[i + 2]
      const l = luma(r, g, b)
      let nr = r
      let ng = g
      let nb = b
      if (algorithm.startsWith('bayer')) {
        const size = algorithm === 'bayer16' ? 16 : algorithm === 'bayer8' ? 8 : 4
        const t = bayerAt(x / pixel, y / pixel, size as 4 | 8 | 16)
        const onPix = l / 255 > t
        nr = ng = nb = onPix ? 255 : 0
      } else if (algorithm === 'threshold') {
        nr = ng = nb = l > 128 ? 255 : 0
      } else if (algorithm === 'bluenoise') {
        nr = ng = nb = l / 255 > hash(x * 13 + y * 47) ? 255 : 0
      } else if (algorithm === 'blocky') {
        nr = ng = nb = Math.round(l / 64) * 64
      } else if (algorithm === 'ascii') {
        nr = ng = nb = l
      } else {
        if (mode === 'rgb') {
          nr = r > 127 ? 255 : 0
          ng = g > 127 ? 255 : 0
          nb = b > 127 ? 255 : 0
        } else {
          nr = ng = nb = l > 127 ? 255 : 0
        }
        kernel.forEach(([dx, dy, wgt]) => {
          const xx = x + dx * pixel
          const yy = y + dy * pixel
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) return
          const ni = (yy * width + xx) * 3
          copy[ni] += (r - nr) * wgt
          copy[ni + 1] += (g - ng) * wgt
          copy[ni + 2] += (b - nb) * wgt
        })
      }
      let cr = nr
      let cg = ng
      let cb = nb
      if (mode === 'duo' || mode === 'tri') {
        const t = (nr + ng + nb) / 765
        const a = mode === 'tri' && t > 0.33 && t < 0.66 ? mid : t < 0.5 ? shadow : high
        cr = a[0]
        cg = a[1]
        cb = a[2]
      } else if (mode === 'mono') {
        const onPix = nr > 127
        cr = onPix ? high[0] : shadow[0]
        cg = onPix ? high[1] : shadow[1]
        cb = onPix ? high[2] : shadow[2]
      }
      if (algorithm === 'ascii') {
        const ch = asciiRamp[Math.min(asciiRamp.length - 1, Math.floor((1 - l / 255) * asciiRamp.length))]
        cr = ch === ' ' ? high[0] : shadow[0]
        cg = ch === ' ' ? high[1] : shadow[1]
        cb = ch === ' ' ? high[2] : shadow[2]
      }
      for (let oy = 0; oy < pixel; oy += 1) {
        for (let ox = 0; ox < pixel; ox += 1) {
          if (x + ox >= width || y + oy >= height) continue
          const di = ((y + oy) * width + (x + ox)) * 4
          data[di] = cr
          data[di + 1] = cg
          data[di + 2] = cb
          data[di + 3] = 255
        }
      }
    }
  }
}

function grainrad(image: ImageData, params: Record<string, string>) {
  const effect = p(params, 'effect', 'ascii')
  if (effect === 'dither') {
    ditherGarden(image, { ...params, algorithm: 'bayer8', mode: 'mono', pixel: String(Math.max(1, n(params, 'scale', 8) / 4)) })
    return
  }
  if (effect === 'threshold') {
    const level = 0.5
    for (let i = 0; i < image.data.length; i += 4) {
      const v = luma(image.data[i], image.data[i + 1], image.data[i + 2]) > level * 255 ? 255 : 0
      image.data[i] = v
      image.data[i + 1] = v
      image.data[i + 2] = v
    }
    return
  }
  characterOverlay(image, { ...params, cell: String(n(params, 'scale', 8)), set: p(params, 'charset', 'standard') }, effect === 'ascii' || effect === 'dots' || effect === 'crosshatch' || effect === 'contour' || effect === 'blockify' || effect === 'halftone')
}

function refract(image: ImageData, params: Record<string, string>) {
  const { data, width, height } = image
  const copy = new Uint8ClampedArray(data)
  const amount = n(params, 'amount', 0.42)
  const refr = n(params, 'refract', 0.55)
  const scale = n(params, 'scale', 1.8)
  const ior = n(params, 'ior', 1.45)
  const seed = n(params, 'seed', 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = fbm(x * 0.01 * scale, y * 0.01 * scale, seed)
      const ny = fbm(x * 0.01 * scale + 9, y * 0.01 * scale, seed + 2)
      const pull = (ior - 1) * refr * 40
      const sx = x + (nx - 0.5) * amount * 90 + (nx - 0.5) * pull
      const sy = y + (ny - 0.5) * amount * 70 + (ny - 0.5) * pull
      const i = (y * width + x) * 4
      const si = (Math.max(0, Math.min(height - 1, Math.round(sy))) * width + Math.max(0, Math.min(width - 1, Math.round(sx)))) * 4
      data[i] = copy[si]
      data[i + 1] = copy[si + 1]
      data[i + 2] = copy[si + 2]
      data[i + 3] = copy[si + 3]
    }
  }
}

function imgDistort(image: ImageData, params: Record<string, string>) {
  const { data, width, height } = image
  const copy = new Uint8ClampedArray(data)
  const multiplier = n(params, 'multiplier', 110) / 100
  const frequency = n(params, 'frequency', 5)
  const amplitude = n(params, 'amplitude', 20)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = x + Math.sin((y / height) * frequency * Math.PI * 2) * amplitude * multiplier
      const sy = y + Math.cos((x / width) * frequency * Math.PI * 2) * amplitude * 0.45 * multiplier
      const i = (y * width + x) * 4
      const si = (Math.max(0, Math.min(height - 1, Math.round(sy))) * width + Math.max(0, Math.min(width - 1, Math.round(sx)))) * 4
      data[i] = copy[si]
      data[i + 1] = copy[si + 1]
      data[i + 2] = copy[si + 2]
      data[i + 3] = copy[si + 3]
    }
  }
}

function slide(image: ImageData, params: Record<string, string>) {
  const { data, width, height } = image
  const copy = new Uint8ClampedArray(data)
  const cuts = Math.max(1, Math.round(n(params, 'cuts', 3)))
  const extra = n(params, 'extra', 200)
  const spread = n(params, 'spread', 0.45)
  const seed = n(params, 'seed', 3)
  const xs = [0]
  for (let i = 1; i <= cuts; i += 1) xs.push(Math.round((i / (cuts + 1) + (hash(i + seed) - 0.5) * spread * 0.2) * width))
  xs.push(width)
  xs.sort((a, b) => a - b)
  const stretch = extra / Math.max(1, cuts)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let srcX = x
      for (let c = 1; c < xs.length; c += 1) {
        if (x >= xs[c]) srcX = Math.min(width - 1, xs[c] - 1)
      }
      const i = (y * width + x) * 4
      const si = (y * width + Math.max(0, Math.min(width - 1, Math.round(srcX - (x / width) * stretch * 0.2)))) * 4
      data[i] = copy[si]
      data[i + 1] = copy[si + 1]
      data[i + 2] = copy[si + 2]
      data[i + 3] = copy[si + 3]
    }
  }
}

function fragmenter(image: ImageData, params: Record<string, string>) {
  const { data, width, height } = image
  const frames = Math.round(n(params, 'frames', 40))
  const seed = n(params, 'seed', 6)
  const src = new Uint8ClampedArray(data)
  const out = new Uint8ClampedArray(data)
  for (let f = 0; f < frames; f += 1) {
    const fw = 20 + hash(f + seed) * 120
    const fh = 20 + hash(f + 3 + seed) * 120
    const sx = hash(f + 5 + seed) * (width - fw)
    const sy = hash(f + 7 + seed) * (height - fh)
    const dx = hash(f + 9 + seed) * (width - fw)
    const dy = hash(f + 11 + seed) * (height - fh)
    for (let y = 0; y < fh; y += 1) {
      for (let x = 0; x < fw; x += 1) {
        const si = (Math.floor(sy + y) * width + Math.floor(sx + x)) * 4
        const di = (Math.floor(dy + y) * width + Math.floor(dx + x)) * 4
        if (di < 0 || di >= out.length) continue
        out[di] = src[si]
        out[di + 1] = src[si + 1]
        out[di + 2] = src[si + 2]
        out[di + 3] = 255
      }
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    let r = out[i]
    let g = out[i + 1]
    let b = out[i + 2]
    if (on(params, 'gray')) {
      const l = luma(r, g, b)
      r = g = b = l
    }
    if (on(params, 'sepia')) {
      const rr = r * 0.393 + g * 0.769 + b * 0.189
      const gg = r * 0.349 + g * 0.686 + b * 0.168
      const bb = r * 0.272 + g * 0.534 + b * 0.131
      r = rr
      g = gg
      b = bb
    }
    if (on(params, 'invert')) {
      r = 255 - r
      g = 255 - g
      b = 255 - b
    }
    data[i] = clamp(r)
    data[i + 1] = clamp(g)
    data[i + 2] = clamp(b)
    data[i + 3] = 255
  }
  const pix = n(params, 'pixelate', 0)
  if (pix > 0) {
    const cell = Math.max(2, Math.round(pix * 24))
    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        const i = (y * width + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        for (let oy = 0; oy < cell; oy += 1) {
          for (let ox = 0; ox < cell; ox += 1) {
            if (x + ox >= width || y + oy >= height) continue
            const di = ((y + oy) * width + (x + ox)) * 4
            data[di] = r
            data[di + 1] = g
            data[di + 2] = b
          }
        }
      }
    }
  }
}

function elastic(image: ImageData, params: Record<string, string>) {
  const { data, width, height } = image
  const copy = new Uint8ClampedArray(data)
  const cols = Math.max(2, Math.round(n(params, 'cols', 8)))
  const rows = Math.max(2, Math.round(n(params, 'rows', 10)))
  const stretch = n(params, 'stretch', 0.45)
  const radius = n(params, 'radius', 0.55)
  const noiseAmt = n(params, 'noiseAmt', 0.35)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / width
      const v = y / height
      const gx = Math.sin(u * cols * Math.PI) * stretch * 28 * radius
      const gy = Math.cos(v * rows * Math.PI) * stretch * 22 * radius
      const nx = (fbm(u * 4, v * 4, 2) - 0.5) * noiseAmt * 30
      const sx = Math.max(0, Math.min(width - 1, x + gx + nx))
      const sy = Math.max(0, Math.min(height - 1, y + gy + nx * 0.6))
      const i = (y * width + x) * 4
      const si = (Math.round(sy) * width + Math.round(sx)) * 4
      data[i] = copy[si]
      data[i + 1] = copy[si + 1]
      data[i + 2] = copy[si + 2]
      data[i + 3] = copy[si + 3]
    }
  }
}

function scanner(image: ImageData, params: Record<string, string>) {
  const { data, width, height } = image
  const copy = new Uint8ClampedArray(data)
  const speed = p(params, 'speed', 'normal')
  const jitter = n(params, 'jitter', 0.35)
  const seed = n(params, 'seed', 8)
  const lag = speed === 'slow' ? 14 : speed === 'fast' ? 3 : 7
  for (let y = 0; y < height; y += 1) {
    const shift = Math.round((hash(y + seed) - 0.5) * jitter * 24 + Math.sin(y * 0.08) * lag)
    for (let x = 0; x < width; x += 1) {
      const sx = Math.max(0, Math.min(width - 1, x + shift))
      const i = (y * width + x) * 4
      const si = (y * width + sx) * 4
      data[i] = copy[si]
      data[i + 1] = copy[si + 1]
      data[i + 2] = copy[si + 2]
      if (y % 3 === 0) {
        data[i] = clamp(data[i] * 0.82)
        data[i + 1] = clamp(data[i + 1] * 0.82)
        data[i + 2] = clamp(data[i + 2] * 0.82)
      }
    }
  }
}

function glitchImage(image: ImageData, params: Record<string, string>) {
  const { data, width, height } = image
  const amount = n(params, 'amount', 60)
  const opacity = n(params, 'opacity', 1)
  const seed = n(params, 'seed', 7)
  const copy = new Uint8ClampedArray(data)
  const bands = Math.max(2, Math.round(amount / 8))
  const bandH = Math.ceil(height / bands)
  for (let band = 0; band < bands; band += 1) {
    const shift = Math.round((hash(band * 9 + seed) - 0.5) * amount)
    const y0 = band * bandH
    for (let y = y0; y < Math.min(height, y0 + bandH); y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sx = (x + shift + width) % width
        const i = (y * width + x) * 4
        const si = (y * width + sx) * 4
        data[i] = mix(copy[i], copy[si], opacity)
        data[i + 1] = mix(copy[i + 1], copy[si + 1], opacity)
        data[i + 2] = mix(copy[i + 2], copy[si + 2], opacity)
      }
    }
  }
}

function characterOverlay(image: ImageData, params: Record<string, string>, asField = true) {
  const { data, width, height } = image
  const cell = Math.max(4, Math.round(n(params, 'cell', 10)))
  const set = p(params, 'set', p(params, 'charset', 'standard'))
  const glyphs = set === 'blocks' ? ' ░▒▓█' : set === 'binary' ? ' 01' : ' .:-=+*#%@'
  const ink = hexRgb(hex(params, 'color', '#1c1915'))
  const paper = hexRgb(hex(params, 'colorB', '#efeae2'))
  const invert = on(params, 'invert')
  const copy = new Uint8ClampedArray(data)
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      let l = 0
      let n = 0
      for (let oy = 0; oy < cell; oy += 1) {
        for (let ox = 0; ox < cell; ox += 1) {
          if (x + ox >= width || y + oy >= height) continue
          const i = ((y + oy) * width + (x + ox)) * 4
          l += luma(copy[i], copy[i + 1], copy[i + 2])
          n += 1
        }
      }
      l /= Math.max(1, n)
      if (invert) l = 255 - l
      const gi = Math.min(glyphs.length - 1, Math.floor((1 - l / 255) * glyphs.length))
      const ch = glyphs[gi]
      for (let oy = 0; oy < cell; oy += 1) {
        for (let ox = 0; ox < cell; ox += 1) {
          if (x + ox >= width || y + oy >= height) continue
          const i = ((y + oy) * width + (x + ox)) * 4
          const onPix = asField && ch !== ' ' && hash(ox * 3 + oy + ch.charCodeAt(0)) > 0.45
          data[i] = onPix ? ink[0] : paper[0]
          data[i + 1] = onPix ? ink[1] : paper[1]
          data[i + 2] = onPix ? ink[2] : paper[2]
          data[i + 3] = 255
        }
      }
    }
  }
}

function blurImage(image: ImageData, radius: number) {
  const { data, width, height } = image
  const r = Math.max(1, Math.round(radius))
  const copy = new Uint8ClampedArray(data)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sr = 0
      let sg = 0
      let sb = 0
      let n = 0
      for (let ox = -r; ox <= r; ox += 1) {
        const xx = Math.max(0, Math.min(width - 1, x + ox))
        const i = (y * width + xx) * 4
        sr += copy[i]
        sg += copy[i + 1]
        sb += copy[i + 2]
        n += 1
      }
      const i = (y * width + x) * 4
      data[i] = sr / n
      data[i + 1] = sg / n
      data[i + 2] = sb / n
    }
  }
}

function halftoneLayer(image: ImageData, params: Record<string, string>) {
  const { data, width, height } = image
  const copy = new Uint8ClampedArray(data)
  const spacing = n(params, 'spacing', n(params, 'cells', 18) ? 720 / n(params, 'cells', 18) : 18)
  const angle = (n(params, 'angle', 0) * Math.PI) / 180
  const ink = hexRgb(hex(params, 'color', '#c4502a'))
  const paper = hexRgb(hex(params, 'colorB', '#efeae2'))
  const shape = p(params, 'shape', 'circle')
  const grid = p(params, 'grid', 'square')
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const xr = (x - width / 2) * Math.cos(angle) - (y - height / 2) * Math.sin(angle) + width / 2
      const yr = (x - width / 2) * Math.sin(angle) + (y - height / 2) * Math.cos(angle) + height / 2
      const stepY = grid === 'hex' ? spacing * 0.86 : spacing
      const cx = Math.floor(xr / spacing) * spacing + spacing / 2 + (grid === 'hex' && Math.floor(yr / stepY) % 2 ? spacing / 2 : 0)
      const cy = Math.floor(yr / stepY) * stepY + stepY / 2
      const si = (Math.max(0, Math.min(height - 1, Math.round(cy))) * width + Math.max(0, Math.min(width - 1, Math.round(cx)))) * 4
      const rad = (1 - luma(copy[si], copy[si + 1], copy[si + 2]) / 255) * spacing * 0.48
      const dx = xr - cx
      const dy = yr - cy
      const onPix = shape === 'square' ? Math.max(Math.abs(dx), Math.abs(dy)) < rad : shape === 'line' ? Math.abs(dy) < Math.max(0.6, rad * 0.35) : Math.hypot(dx, dy) < rad
      const i = (y * width + x) * 4
      data[i] = onPix ? ink[0] : paper[0]
      data[i + 1] = onPix ? ink[1] : paper[1]
      data[i + 2] = onPix ? ink[2] : paper[2]
      data[i + 3] = 255
    }
  }
}

function snap(value: number): number {
  let best = 0
  let bestD = 1e9
  for (const target of [0, 122, 255]) {
    const d = Math.abs(value - target)
    if (d < bestD) {
      bestD = d
      best = target
    }
  }
  return best
}

function mix(from: number, to: number, amount: number): number {
  return Math.round(from + (to - from) * Math.min(1, Math.max(0, amount)))
}
