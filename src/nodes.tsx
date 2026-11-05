import { Handle, Position, useEdges, type NodeProps } from '@xyflow/react'
import { createContext, useContext, useEffect, useState } from 'react'
import { toolById } from './archive'
import type { ParamSpec, ToolNode } from './types'

export type GraphApi = {
  update: (id: string, params: Record<string, string>) => void
  remove: (id: string) => void
}

export const GraphApiContext = createContext<GraphApi | null>(null)

function useGraph(): GraphApi {
  const api = useContext(GraphApiContext)
  if (!api) throw new Error('Graph missing')
  return api
}

function ColorParam({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'
  return (
    <div className="color-field">
      <input aria-label="Pick color" type="color" value={safe} onChange={(event) => onChange(event.target.value)} />
      <input
        aria-label="Hex color"
        value={draft}
        spellCheck={false}
        onChange={(event) => {
          setDraft(event.target.value)
          if (/^#[0-9a-fA-F]{6}$/.test(event.target.value)) onChange(event.target.value)
        }}
      />
    </div>
  )
}

function ParamControl({ spec, value, onChange }: { spec: ParamSpec; value: string; onChange: (value: string) => void }) {
  if (spec.kind === 'color') return <ColorParam value={value} onChange={onChange} />
  if (spec.kind === 'text') {
    return <textarea aria-label={spec.label} rows={3} value={value} spellCheck={false} onChange={(event) => onChange(event.target.value)} />
  }
  if (spec.kind === 'select') {
    return (
      <div className="choices" role="group" aria-label={spec.label}>
        {spec.options?.map((option) => (
          <button key={option.value} type="button" className="choice" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
    )
  }
  return (
    <span className="size-row">
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={Number(value)}
        aria-label={spec.label}
        onChange={(event) => onChange(event.target.value)}
      />
      <em>{value}</em>
    </span>
  )
}

export function ToolNodeView({ id, data }: NodeProps<ToolNode>) {
  const api = useGraph()
  const edges = useEdges()
  const tool = toolById(data.toolId)
  const isPlate = data.toolId === 'plate'
  const inputs = isPlate ? [{ id: 'in:layer', label: 'Layers' }] : (tool?.inputs ?? [])
  const outputs = isPlate ? [] : (tool?.outputs ?? [])
  const wired = (handle: string, end: 'source' | 'target') =>
    edges.some((edge) => (end === 'source' ? edge.source === id && edge.sourceHandle === handle : edge.target === id && edge.targetHandle === handle))

  const setParam = (key: string, value: string) => api.update(id, { ...data.params, [key]: value })

  return (
    <article className={`tool-node ${isPlate ? 'is-plate' : ''} ${data.toolId === 'vein' || (tool?.params.length ?? 0) > 6 ? 'is-dense' : ''}`}>
      {inputs.map((input, index) => (
        <Handle
          key={input.id}
          id={input.id}
          type="target"
          position={Position.Left}
          className={wired(input.id, 'target') ? 'is-wired' : ''}
          style={{ top: `${((index + 1) / (inputs.length + 1)) * 100}%` }}
          aria-label={input.label}
        />
      ))}
      <header className="tool-head">
        <span className="kicker">{isPlate ? 'Output' : tool?.category}</span>
        {!isPlate && (
          <button type="button" className="icon-x nodrag nopan" aria-label={`Remove ${tool?.name ?? 'node'}`} onClick={() => api.remove(id)}>
            ×
          </button>
        )}
      </header>
      <div className="tool-body nodrag nopan">
        <h3>{isPlate ? 'Plate' : tool?.name}</h3>
        {inputs.length > 0 && (
          <p className="ports">
            {inputs.map((input) => (
              <span key={input.id}>{input.label}</span>
            ))}
          </p>
        )}
        {tool?.params
          .filter((spec) => {
            if (data.toolId !== 'vein' || !/^ink[1-7]$/.test(spec.id)) return true
            const index = Number(spec.id.slice(3))
            return index <= Math.max(2, Math.round(Number(data.params.inks ?? 7)))
          })
          .map((spec) => (
            <label className="field" key={spec.id}>
              <span>{spec.label}</span>
              <ParamControl spec={spec} value={data.params[spec.id] ?? ''} onChange={(value) => setParam(spec.id, value)} />
            </label>
          ))}
        {isPlate && <p className="hint">Layers land here. Cable tools into each other first to stack effects in any order.</p>}
        {outputs.length > 0 && (
          <p className="ports out">
            {outputs.map((output) => (
              <span key={output.id}>{output.label}</span>
            ))}
          </p>
        )}
      </div>
      {outputs.map((output, index) => (
        <Handle
          key={output.id}
          id={output.id}
          type="source"
          position={Position.Right}
          className={wired(output.id, 'source') ? 'is-wired' : ''}
          style={{ top: `${((index + 1) / (outputs.length + 1)) * 100}%` }}
          aria-label={output.label}
        />
      ))}
    </article>
  )
}

export const nodeTypes = { tool: ToolNodeView }
