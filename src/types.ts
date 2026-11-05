import type { Node } from '@xyflow/react'

export const PLATE_ID = 'plate'

export type Category = 'Color' | 'Type' | 'Pattern' | 'Image'

export type PortKind = 'color' | 'text' | 'layer'

export type BlendMode = 'source-over' | 'multiply' | 'screen' | 'difference'

export type ParamKind = 'color' | 'text' | 'number' | 'select'

export type ParamSpec = {
  id: string
  label: string
  kind: ParamKind
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
}

export type PortSpec = {
  id: string
  label: string
  kind: PortKind
}

export type ToolDef = {
  id: string
  name: string
  category: Category
  summary: string
  inputs: PortSpec[]
  outputs: PortSpec[]
  params: ParamSpec[]
  defaults: Record<string, string>
}

export type ToolData = {
  toolId: string
  params: Record<string, string>
}

export type ToolNode = Node<ToolData, 'tool'>

export type LayerEdit = {
  name: string
  visible: boolean
  opacity: number
  blend: BlendMode
}

export type VeinFlow = 'marble' | 'swirl' | 'ripple' | 'drift' | 'breathe' | 'turn'
export type VeinDither = 'off' | 'bayer8' | 'bayer4' | 'noise'
export type VeinBlend = 'overlay' | 'add' | 'soft-light' | 'multiply' | 'screen'

export type VeinKind = {
  type: 'vein'
  variation: number
  flow: VeinFlow
  scale: number
  curve: number
  levels: number
  stripes: number
  edges: number
  stars: number
  tints: number
  runs: number
  animate: boolean
  time: number
  dither: VeinDither
  grain: boolean
  blend: VeinBlend
  amount: number
  grainSize: number
  specks: number
  vignette: number
  inks: string[]
}

export type EffectName =
  | 'glitch'
  | 'rgb'
  | 'threshold'
  | 'dither'
  | 'refract'
  | 'fragment'
  | 'slide'
  | 'distort'
  | 'blur'
  | 'ascii'
  | 'glitchscan'
  | 'remains'
  | 'character'
  | 'elastic'
  | 'halftone'
  | 'grainover'
  | 'glitchimg'
  | 'grainrad'

export type GenName =
  | 'shapes'
  | 'uji'
  | 'automata'
  | 'hypha'
  | 'dismal'
  | 'rd'
  | 'bushes'
  | 'sampl'
  | 'stoer'
  | 'spacetime'
  | 'pixelbrei'
  | 'echoes'
  | 'brutalita'
  | 'script'
  | 'taag'
  | 'titleart'
  | 'blur'
  | 'mono'
  | 'csmoire'
  | 'typeimage'
  | 'genfont'
  | 'svgtype'
  | 'glitchtype'
  | 'emoji'
  | 'rgbkeys'
  | 'randomizer'
  | 'moireform'

export type GenKind = {
  type: 'gen'
  gen: GenName
  params: Record<string, string>
  source?: LayerKind
}

export type EffectKind = {
  type: 'effect'
  effect: EffectName
  params: Record<string, string>
  source: LayerKind
}

export type MergeKind = {
  type: 'merge'
  a: LayerKind
  b: LayerKind
  blend: BlendMode
  amount: number
}

export type LayerKind =
  | { type: 'fill'; color: string }
  | { type: 'gradient'; a: string; b: string; c: string; angle: number; grain: boolean; overprint: boolean }
  | { type: 'text'; text: string; size: number; font: 'serif' | 'sans'; color: string }
  | { type: 'grid'; color: string; columns: number; rows: number; weight: number }
  | { type: 'moire'; pattern: string; color: string; colorB: string; spacing: number; angle: number; offset: number; weight: number; blend: BlendMode }
  | { type: 'grain'; amount: number; seed: number }
  | { type: 'halftone'; color: string; colorB: string; cells: number; grid: string; shape: string; angle: number }
  | { type: 'mark'; color: string; radius: number }
  | VeinKind
  | GenKind
  | EffectKind
  | MergeKind

export type PlateLayer = {
  id: string
  name: string
  kind: LayerKind
}
