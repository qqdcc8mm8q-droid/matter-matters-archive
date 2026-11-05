import type { Edge } from '@xyflow/react'
import { PLATE_ID, type LayerEdit, type ToolNode } from './types'
import { createNode } from './graph'

export const STORAGE_KEY = 'matter-matters.archive.v1'

export function freshGraph(): { nodes: ToolNode[]; edges: Edge[]; edits: Record<string, LayerEdit>; order: string[] } {
  const ground = createNode('color', { x: 24, y: 24 }, 'color-ground')
  ground.data.params.color = '#efeae2'
  const oxide = createNode('color', { x: 24, y: 200 }, 'color-oxide')
  oxide.data.params.color = '#c4502a'
  const ink = createNode('color', { x: 24, y: 376 }, 'color-ink')
  ink.data.params.color = '#1c1915'

  const fill = createNode('fill', { x: 300, y: 24 }, 'layer-fill')
  const mark = createNode('mark', { x: 300, y: 250 }, 'layer-mark')
  const grid = createNode('grid', { x: 300, y: 480 }, 'layer-grid')
  const type = createNode('type', { x: 590, y: 80 }, 'layer-type')
  type.data.params.text = 'Matter holds\nthe form.'
  type.data.params.size = '78'

  const plate = createNode('plate', { x: 900, y: 200 }, PLATE_ID)

  const nodes = [ground, oxide, ink, fill, mark, grid, type, plate]
  const edges: Edge[] = [
    { id: 'e-ground', source: 'color-ground', sourceHandle: 'out:color', target: 'layer-fill', targetHandle: 'in:color' },
    { id: 'e-oxide', source: 'color-oxide', sourceHandle: 'out:color', target: 'layer-mark', targetHandle: 'in:color' },
    { id: 'e-ink', source: 'color-ink', sourceHandle: 'out:color', target: 'layer-grid', targetHandle: 'in:color' },
    { id: 'e-fill', source: 'layer-fill', sourceHandle: 'out:layer', target: PLATE_ID, targetHandle: 'in:layer' },
    { id: 'e-mark', source: 'layer-mark', sourceHandle: 'out:layer', target: PLATE_ID, targetHandle: 'in:layer' },
    { id: 'e-grid', source: 'layer-grid', sourceHandle: 'out:layer', target: PLATE_ID, targetHandle: 'in:layer' },
    { id: 'e-type', source: 'layer-type', sourceHandle: 'out:layer', target: PLATE_ID, targetHandle: 'in:layer' },
  ]
  const edits: Record<string, LayerEdit> = {
    'layer-fill': { name: 'Ground', visible: true, opacity: 1, blend: 'source-over' },
    'layer-grid': { name: 'Grid', visible: true, opacity: 0.28, blend: 'multiply' },
    'layer-mark': { name: 'Mark', visible: true, opacity: 1, blend: 'source-over' },
    'layer-type': { name: 'Headline', visible: true, opacity: 1, blend: 'source-over' },
  }
  return { nodes, edges, edits, order: ['layer-fill', 'layer-grid', 'layer-mark', 'layer-type'] }
}
