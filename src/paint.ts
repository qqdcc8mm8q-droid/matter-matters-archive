import type { BlendMode, LayerEdit, LayerKind, PlateLayer } from './types'
import { applyEffect, paintGen } from './visuals'
import { paintVein } from './vein'

export const PLATE_W = 720
export const PLATE_H = 900

export function reconcileOrder(order: string[], ids: string[]): string[] {
  const keep = order.filter((id) => ids.includes(id))
  const extra = ids.filter((id) => !keep.includes(id))
  return [...keep, ...extra]
}

export function orderedLayers(layers: PlateLayer[], order: string[], edits: Record<string, LayerEdit>): PlateLayer[] {
  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  return reconcileOrder(order, layers.map((layer) => layer.id))
    .map((id) => byId.get(id))
    .filter((layer): layer is PlateLayer => Boolean(layer))
    .map((layer) => ({ ...layer, name: edits[layer.id]?.name || layer.name }))
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

function drawKind(ctx: CanvasRenderingContext2D, kind: LayerKind, w: number, h: number) {
  if (kind.type === 'fill') {
    ctx.fillStyle = kind.color
    ctx.fillRect(0, 0, w, h)
    return
  }
  if (kind.type === 'gradient') {
    const rad = (kind.angle * Math.PI) / 180
    const cx = w / 2
    const cy = h / 2
    const len = Math.abs(cx * Math.cos(rad)) + Math.abs(cy * Math.sin(rad))
    const gradient = ctx.createLinearGradient(cx - Math.cos(rad) * len, cy - Math.sin(rad) * len, cx + Math.cos(rad) * len, cy + Math.sin(rad) * len)
    gradient.addColorStop(0, kind.a)
    gradient.addColorStop(0.5, kind.c)
    gradient.addColorStop(1, kind.b)
    ctx.fillStyle = gradient
    ctx.globalCompositeOperation = kind.overprint ? 'multiply' : 'source-over'
    ctx.fillRect(0, 0, w, h)
    if (kind.grain) {
      const image = ctx.getImageData(0, 0, w, h)
      for (let i = 0; i < image.data.length; i += 4) {
        const nse = (hash(i + 9) - 0.5) * 28
        image.data[i] = Math.max(0, Math.min(255, image.data[i] + nse))
        image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + nse))
        image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + nse))
      }
      ctx.putImageData(image, 0, 0)
    }
    ctx.globalCompositeOperation = 'source-over'
    return
  }
  if (kind.type === 'text') {
    ctx.fillStyle = kind.color
    ctx.font = `${kind.font === 'serif' ? 400 : 500} ${kind.size}px ${kind.font === 'serif' ? '"Instrument Serif", serif' : '"Outfit", sans-serif'}`
    ctx.textBaseline = 'top'
    const lines = kind.text.split('\n')
    const pad = w * 0.08
    let y = h * 0.62
    const lineHeight = kind.size * 0.92
    for (const line of lines) {
      ctx.fillText(line, pad, y)
      y += lineHeight
    }
    return
  }
  if (kind.type === 'grid') {
    ctx.strokeStyle = kind.color
    ctx.lineWidth = kind.weight
    ctx.beginPath()
    const columns = Math.max(2, Math.round(kind.columns))
    const rows = Math.max(2, Math.round(kind.rows))
    for (let i = 0; i <= columns; i += 1) {
      const x = (w / columns) * i
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
    }
    for (let i = 0; i <= rows; i += 1) {
      const y = (h / rows) * i
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
    }
    ctx.stroke()
    return
  }
  if (kind.type === 'moire') {
    ctx.fillStyle = kind.colorB
    ctx.fillRect(0, 0, w, h)
    const draw = (angle: number, offset: number) => {
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.rotate((angle * Math.PI) / 180)
      ctx.translate(-w / 2 + offset, -h / 2)
      ctx.strokeStyle = kind.color
      ctx.lineWidth = kind.weight
      ctx.globalCompositeOperation = kind.blend
      if (kind.pattern === 'circles') {
        for (let r = kind.spacing; r < Math.hypot(w, h); r += kind.spacing) {
          ctx.beginPath()
          ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2)
          ctx.stroke()
        }
      } else if (kind.pattern === 'sine') {
        ctx.beginPath()
        for (let x = 0; x < w; x += 1) {
          const y = h / 2 + Math.sin(x / kind.spacing) * 40
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      } else {
        const vertical = kind.pattern === 'v'
        const diag = kind.pattern === 'd'
        for (let i = -h; i < (vertical ? w : h) * 2; i += kind.spacing) {
          ctx.beginPath()
          if (vertical) {
            ctx.moveTo(i, -h)
            ctx.lineTo(i, h * 2)
          } else {
            ctx.moveTo(-w, i + (diag ? i * 0.3 : 0))
            ctx.lineTo(w * 2, i + (diag ? i * 0.3 : 0))
          }
          ctx.stroke()
        }
        if (kind.pattern === 'grid') {
          for (let i = -w; i < w * 2; i += kind.spacing) {
            ctx.beginPath()
            ctx.moveTo(i, -h)
            ctx.lineTo(i, h * 2)
            ctx.stroke()
          }
        }
      }
      ctx.restore()
    }
    draw(0, 0)
    draw(kind.angle, kind.offset)
    ctx.globalCompositeOperation = 'source-over'
    return
  }
  if (kind.type === 'grain') {
    stampRaster(ctx, w, h, (data) => {
      for (let i = 0; i < data.length; i += 4) {
        const n = (hash(i + kind.seed * 17) - 0.5) * kind.amount * 255
        data[i] = 30
        data[i + 1] = 28
        data[i + 2] = 24
        data[i + 3] = Math.min(255, Math.abs(n) * 3)
      }
    })
    return
  }
  if (kind.type === 'halftone') {
    ctx.fillStyle = kind.colorB
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = kind.color
    const step = Math.max(6, kind.cells)
    const rad = (kind.angle * Math.PI) / 180
    for (let y = step / 2; y < h + step; y += kind.grid === 'hex' ? step * 0.86 : step) {
      const row = Math.round(y / step)
      for (let x = step / 2; x < w + step; x += step) {
        const px = x + (kind.grid === 'hex' && row % 2 ? step / 2 : 0)
        ctx.save()
        ctx.translate(px, y)
        ctx.rotate(rad)
        ctx.beginPath()
        if (kind.shape === 'square') ctx.rect(-step * 0.22, -step * 0.22, step * 0.44, step * 0.44)
        else if (kind.shape === 'line') ctx.rect(-step * 0.4, -step * 0.08, step * 0.8, step * 0.16)
        else ctx.arc(0, 0, step * 0.22, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }
    return
  }
  if (kind.type === 'mark') {
    ctx.fillStyle = kind.color
    ctx.strokeStyle = kind.color
    ctx.lineWidth = Math.max(4, w * 0.012)
    const r = Math.min(w, h) * kind.radius
    ctx.beginPath()
    ctx.arc(w * 0.46, h * 0.42, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(w * 0.58, h * 0.42, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(w * 0.4, h * 0.42 - ctx.lineWidth / 2, w * 0.24, ctx.lineWidth)
    return
  }
  if (kind.type === 'vein') {
    stampRaster(ctx, w, h, (data) => paintVein(data, w, h, kind))
    return
  }
  if (kind.type === 'gen') {
    let source: ImageData | undefined
    if (kind.source) {
      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const octx = off.getContext('2d')
      if (octx) {
        drawKind(octx, kind.source, w, h)
        source = octx.getImageData(0, 0, w, h)
      }
    }
    paintGen(ctx, w, h, kind, source)
    return
  }
  if (kind.type === 'merge') {
    drawKind(ctx, kind.a, w, h)
    ctx.save()
    ctx.globalAlpha = kind.amount
    ctx.globalCompositeOperation = kind.blend
    drawKind(ctx, kind.b, w, h)
    ctx.restore()
    return
  }
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const octx = off.getContext('2d')
  if (!octx) return
  drawKind(octx, kind.source, w, h)
  const image = octx.getImageData(0, 0, w, h)
  applyEffect(image, kind)
  octx.putImageData(image, 0, 0)
  ctx.drawImage(off, 0, 0)
}

function stampRaster(ctx: CanvasRenderingContext2D, w: number, h: number, paint: (data: Uint8ClampedArray) => void) {
  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const octx = off.getContext('2d')
  if (!octx) return
  const image = octx.getImageData(0, 0, w, h)
  paint(image.data)
  octx.putImageData(image, 0, 0)
  ctx.drawImage(off, 0, 0)
}

export function paintPlate(
  canvas: HTMLCanvasElement,
  layers: PlateLayer[],
  edits: Record<string, LayerEdit>,
  order: string[],
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#d9d2c6'
  ctx.fillRect(0, 0, w, h)
  for (const layer of orderedLayers(layers, order, edits)) {
    const edit = edits[layer.id]
    if (edit && !edit.visible) continue
    ctx.save()
    ctx.globalAlpha = edit?.opacity ?? 1
    ctx.globalCompositeOperation = edit?.blend ?? 'source-over'
    drawKind(ctx, layer.kind, w, h)
    ctx.restore()
  }
}

export function renderSvg(layers: PlateLayer[], edits: Record<string, LayerEdit>, order: string[]): string {
  const w = PLATE_W
  const h = PLATE_H
  const parts: string[] = []
  for (const layer of orderedLayers(layers, order, edits)) {
    const edit = edits[layer.id]
    if (edit && !edit.visible) continue
    const opacity = edit?.opacity ?? 1
    const blend = edit?.blend ?? 'source-over'
    const body = svgFor(layer.kind, w, h)
    parts.push(`<g opacity="${opacity}" style="mix-blend-mode:${blendMode(blend)}">${body}</g>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n<rect width="100%" height="100%" fill="#d9d2c6"/>\n${parts.join('\n')}\n</svg>\n`
}

function blendMode(blend: BlendMode): string {
  if (blend === 'source-over') return 'normal'
  return blend
}

function svgFor(kind: LayerKind, w: number, h: number): string {
  if (kind.type === 'fill') return `<rect width="${w}" height="${h}" fill="${kind.color}"/>`
  if (kind.type === 'gradient') {
    const id = `g${Math.abs(kind.angle)}`
    return `<defs><linearGradient id="${id}" gradientTransform="rotate(${kind.angle} 0.5 0.5)"><stop offset="0" stop-color="${kind.a}"/><stop offset="0.5" stop-color="${kind.c}"/><stop offset="1" stop-color="${kind.b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`
  }
  if (kind.type === 'text') {
    const lines = kind.text.split('\n')
    const size = kind.size
    const family = kind.font === 'serif' ? 'Instrument Serif, serif' : 'Outfit, sans-serif'
    const tspans = lines
      .map((line, index) => `<tspan x="${w * 0.08}" dy="${index === 0 ? 0 : size * 0.92}">${escapeXml(line)}</tspan>`)
      .join('')
    return `<text x="${w * 0.08}" y="${h * 0.62}" fill="${kind.color}" font-family="${family}" font-size="${size}">${tspans}</text>`
  }
  if (kind.type === 'grid') {
    const lines: string[] = []
    const columns = Math.max(2, Math.round(kind.columns))
    const rows = Math.max(2, Math.round(kind.rows))
    for (let i = 0; i <= columns; i += 1) {
      const x = (w / columns) * i
      lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}"/>`)
    }
    for (let i = 0; i <= rows; i += 1) {
      const y = (h / rows) * i
      lines.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}"/>`)
    }
    return `<g stroke="${kind.color}" stroke-width="${kind.weight}" fill="none">${lines.join('')}</g>`
  }
  if (kind.type === 'halftone') {
    const cells = Math.max(4, Math.round(kind.cells))
    const step = Math.max(6, cells)
    const radius = step * 0.22
    const dots: string[] = []
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) dots.push(`<circle cx="${x}" cy="${y}" r="${radius}"/>`)
    }
    return `<g fill="${kind.color}">${dots.join('')}</g>`
  }
  if (kind.type === 'mark') {
    const r = Math.min(w, h) * kind.radius
    const stroke = Math.max(4, w * 0.012)
    return `<g fill="${kind.color}" stroke="${kind.color}" stroke-width="${stroke}"><circle cx="${w * 0.46}" cy="${h * 0.42}" r="${r}" fill="none"/><circle cx="${w * 0.58}" cy="${h * 0.42}" r="${r}" stroke="none"/><rect x="${w * 0.4}" y="${h * 0.42 - stroke / 2}" width="${w * 0.24}" height="${stroke}" stroke="none"/></g>`
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  drawKind(ctx, kind, w, h)
  return `<image href="${canvas.toDataURL('image/png')}" width="${w}" height="${h}"/>`
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function paintContact(layers: PlateLayer[], edits: Record<string, LayerEdit>, order: string[]): HTMLCanvasElement {
  const visible = orderedLayers(layers, order, edits).filter((layer) => edits[layer.id]?.visible !== false)
  const cellW = 360
  const cellH = 450
  const canvas = document.createElement('canvas')
  canvas.width = cellW
  canvas.height = Math.max(cellH, cellH * visible.length)
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = '#e7e1d6'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  visible.forEach((layer, index) => {
    const plate = document.createElement('canvas')
    plate.width = PLATE_W
    plate.height = PLATE_H
    paintPlate(plate, [layer], { [layer.id]: { name: layer.name, visible: true, opacity: edits[layer.id]?.opacity ?? 1, blend: 'source-over' } }, [layer.id])
    const y = index * cellH
    ctx.fillStyle = '#1c1915'
    ctx.font = '16px "IBM Plex Mono", monospace'
    ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${edits[layer.id]?.name || layer.name}`, 16, y + 28)
    ctx.drawImage(plate, 16, y + 40, cellW - 32, cellH - 64)
  })
  return canvas
}
