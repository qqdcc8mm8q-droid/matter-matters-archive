import type { Edge } from '@xyflow/react'
import { toolById } from './archive'
import { PLATE_ID, type BlendMode, type LayerKind, type PlateLayer, type ToolNode, type VeinBlend, type VeinDither, type VeinFlow } from './types'
import { isEffect, isGen } from './visuals'

type Value =
  | { type: 'color'; hex: string }
  | { type: 'layer'; name: string; kind: LayerKind }

function num(params: Record<string, string>, id: string, fallback: number): number {
  const value = Number(params[id])
  return Number.isFinite(value) ? value : fallback
}

function hex(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

function incoming(edges: Edge[], target: string, handle: string): string | undefined {
  return edges.find((edge) => edge.target === target && edge.targetHandle === handle)?.source
}

function resolve(id: string, nodes: ToolNode[], edges: Edge[], trail: Set<string>): Value | null {
  if (trail.has(id)) return null
  const node = nodes.find((item) => item.id === id)
  if (!node || node.data.toolId === 'plate') return null
  const next = new Set(trail)
  next.add(id)
  const params = node.data.params
  const name = toolById(node.data.toolId)?.name ?? node.data.toolId

  const colorIn = (handle: string, fallback: string): string => {
    const source = incoming(edges, id, handle)
    if (!source) return fallback
    const value = resolve(source, nodes, edges, next)
    return value?.type === 'color' ? value.hex : fallback
  }

  const layerIn = (handle: string): Value | null => {
    const source = incoming(edges, id, handle)
    if (!source) return null
    const value = resolve(source, nodes, edges, next)
    return value?.type === 'layer' ? value : null
  }

  switch (node.data.toolId) {
    case 'color':
      return { type: 'color', hex: hex(params.color, '#c4502a') }
    case 'mix': {
      const a = colorIn('in:color:a', '#1c1915')
      const b = colorIn('in:color:b', '#c4502a')
      return { type: 'color', hex: mixHex(a, b, num(params, 'amount', 0.5)) }
    }
    case 'type':
      return {
        type: 'layer',
        name,
        kind: {
          type: 'text',
          text: params.text ?? '',
          size: num(params, 'size', 64),
          font: params.font === 'sans' ? 'sans' : 'serif',
          color: colorIn('in:color', hex(params.color, '#1c1915')),
        },
      }
    case 'fill':
      return { type: 'layer', name, kind: { type: 'fill', color: colorIn('in:color', hex(params.color, '#efeae2')) } }
    case 'gradient':
      return {
        type: 'layer',
        name,
        kind: {
          type: 'gradient',
          a: colorIn('in:color:a', hex(params.a, '#4982CF')),
          c: hex(params.c, '#B44B65'),
          b: colorIn('in:color:b', hex(params.b, '#5EC8E5')),
          angle: num(params, 'angle', 0),
          grain: params.grain === 'on',
          overprint: params.overprint === 'on',
        },
      }
    case 'grid':
      return {
        type: 'layer',
        name,
        kind: {
          type: 'grid',
          color: colorIn('in:color', hex(params.color, '#1c1915')),
          columns: num(params, 'columns', 12),
          rows: num(params, 'rows', 16),
          weight: num(params, 'weight', 1),
        },
      }
    case 'moire': {
      const blends: BlendMode[] = ['source-over', 'multiply', 'screen', 'difference']
      return {
        type: 'layer',
        name,
        kind: {
          type: 'moire',
          pattern: params.pattern ?? 'h',
          color: colorIn('in:color', hex(params.color, '#000000')),
          colorB: hex(params.colorB, '#ffffff'),
          spacing: num(params, 'spacing', 10),
          angle: num(params, 'angle', 3),
          offset: num(params, 'offset', 0),
          weight: num(params, 'weight', 1),
          blend: blends.find((item) => item === params.blend) ?? 'multiply',
        },
      }
    }
    case 'grain': {
      const source = layerIn('in:layer')
      if (source?.type === 'layer') {
        return {
          type: 'layer',
          name,
          kind: { type: 'effect', effect: 'grainover', params, source: source.kind },
        }
      }
      return {
        type: 'layer',
        name,
        kind: { type: 'grain', amount: num(params, 'amount', 0.35), seed: num(params, 'seed', 4) },
      }
    }
    case 'halftone': {
      const source = layerIn('in:layer')
      if (source?.type === 'layer') {
        return {
          type: 'layer',
          name,
          kind: {
            type: 'effect',
            effect: 'halftone',
            params: { ...params, color: colorIn('in:color', hex(params.color, '#c4502a')) },
            source: source.kind,
          },
        }
      }
      return {
        type: 'layer',
        name,
        kind: {
          type: 'halftone',
          color: colorIn('in:color', hex(params.color, '#c4502a')),
          colorB: hex(params.colorB, '#efeae2'),
          cells: num(params, 'spacing', 18),
          grid: params.grid ?? 'square',
          shape: params.shape ?? 'circle',
          angle: num(params, 'angle', 0),
        },
      }
    }
    case 'mark':
      return {
        type: 'layer',
        name,
        kind: {
          type: 'mark',
          color: colorIn('in:color', hex(params.color, '#c4502a')),
          radius: num(params, 'radius', 0.22),
        },
      }
    case 'vein': {
      const count = Math.min(7, Math.max(2, Math.round(num(params, 'inks', 7))))
      const rotate = Math.round(num(params, 'rotate', 0))
      const fallbacks = ['#0a2e21', '#b00765', '#7bf4f6', '#ffc1c7', '#90cfff', '#fa8939', '#818cea']
      const palette = fallbacks.map((fallback, index) => colorIn(`in:color:${index + 1}`, hex(params[`ink${index + 1}`], fallback)))
      const inks = palette.map((_, index) => palette[(index + rotate) % palette.length]).slice(0, count)
      const flows: VeinFlow[] = ['marble', 'swirl', 'ripple', 'drift', 'breathe', 'turn']
      const dithers: VeinDither[] = ['off', 'bayer8', 'bayer4', 'noise']
      const blends: VeinBlend[] = ['overlay', 'add', 'soft-light', 'multiply', 'screen']
      const flow = flows.find((item) => item === params.flow) ?? 'marble'
      const dither = dithers.find((item) => item === params.dither) ?? 'off'
      const blend = blends.find((item) => item === params.blend) ?? 'overlay'
      return {
        type: 'layer',
        name,
        kind: {
          type: 'vein',
          variation: num(params, 'variation', 71442),
          flow,
          scale: num(params, 'scale', 0.53),
          curve: num(params, 'curve', 0.64),
          levels: num(params, 'levels', 7),
          stripes: num(params, 'stripes', 0.72),
          edges: num(params, 'edges', 0.3),
          stars: num(params, 'stars', 0.73),
          tints: num(params, 'tints', 0.76),
          runs: num(params, 'runs', 0.31),
          animate: params.animate === 'on',
          time: num(params, 'time', 0),
          dither,
          grain: params.grain !== 'off',
          blend,
          amount: num(params, 'amount', 0.4),
          grainSize: num(params, 'grainSize', 1),
          specks: num(params, 'specks', 0.4),
          vignette: num(params, 'vignette', 0.25),
          inks,
        },
      }
    }
    case 'merge': {
      const a = layerIn('in:layer:a')
      const b = layerIn('in:layer:b')
      if (!a || a.type !== 'layer') return b?.type === 'layer' ? { type: 'layer', name, kind: b.kind } : null
      if (!b || b.type !== 'layer') return { type: 'layer', name, kind: a.kind }
      const blends: BlendMode[] = ['source-over', 'multiply', 'screen', 'difference']
      return {
        type: 'layer',
        name,
        kind: {
          type: 'merge',
          a: a.kind,
          b: b.kind,
          blend: blends.find((item) => item === params.blend) ?? 'multiply',
          amount: num(params, 'amount', 0.8),
        },
      }
    }
    default: {
      const source = layerIn('in:layer')
      const fallback: LayerKind = { type: 'fill', color: '#efeae2' }
      const wired = { ...params, color: colorIn('in:color', hex(params.color, '#1c1915')), colorB: hex(params.colorB, '#efeae2') }
      if (node.data.toolId === 'blur') {
        if (source?.type === 'layer') {
          return { type: 'layer', name, kind: { type: 'effect', effect: 'blur', params: wired, source: source.kind } }
        }
        return { type: 'layer', name, kind: { type: 'gen', gen: 'blur', params: wired } }
      }
      if (isEffect(node.data.toolId) || node.data.toolId === 'rgbsnap') {
        const effect = node.data.toolId === 'rgbsnap' ? 'rgb' : node.data.toolId
        if (!isEffect(effect)) return null
        return {
          type: 'layer',
          name,
          kind: {
            type: 'effect',
            effect,
            params: wired,
            source: source?.type === 'layer' ? source.kind : fallback,
          },
        }
      }
      if (!isGen(node.data.toolId)) return null
      return {
        type: 'layer',
        name,
        kind: {
          type: 'gen',
          gen: node.data.toolId,
          params: wired,
          source: source?.type === 'layer' ? source.kind : undefined,
        },
      }
    }
  }
}

function mixHex(a: string, b: string, t: number): string {
  const amount = Math.min(1, Math.max(0, t))
  const pa = parseHex(a)
  const pb = parseHex(b)
  const channel = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * amount)
  return `#${[channel(0), channel(1), channel(2)].map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

function parseHex(hexColor: string): [number, number, number] {
  const value = hexColor.replace('#', '')
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
}

export function plateLayers(nodes: ToolNode[], edges: Edge[]): PlateLayer[] {
  const plate = nodes.find((node) => node.id === PLATE_ID)
  if (!plate) return []
  return edges
    .filter((edge) => edge.target === PLATE_ID)
    .map((edge) => ({ edge, node: nodes.find((node) => node.id === edge.source) }))
    .filter((item): item is { edge: Edge; node: ToolNode } => Boolean(item.node))
    .sort((a, b) => a.node.position.y - b.node.position.y || a.node.position.x - b.node.position.x)
    .map((item) => {
      const value = resolve(item.node.id, nodes, edges, new Set([PLATE_ID]))
      if (!value || value.type !== 'layer') return null
      return { id: item.node.id, name: value.name, kind: value.kind }
    })
    .filter((layer): layer is PlateLayer => Boolean(layer))
}

export function portKind(handle: string | null | undefined): string | null {
  if (!handle) return null
  const [, kind] = handle.split(':')
  return kind ?? null
}
