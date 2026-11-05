import { toolById } from './archive'
import { PLATE_ID, type ToolData, type ToolNode } from './types'

export function createNode(toolId: string, position: { x: number; y: number }, id?: string): ToolNode {
  const tool = toolId === 'plate' ? null : toolById(toolId)
  const params = tool ? { ...tool.defaults } : {}
  const data: ToolData = { toolId, params }
  return {
    id: id ?? `${toolId}-${crypto.randomUUID().slice(0, 8)}`,
    type: 'tool',
    position,
    data,
    deletable: toolId !== 'plate' && id !== PLATE_ID,
  }
}
