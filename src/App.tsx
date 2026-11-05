import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type NodeChange,
  type OnConnect,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import '@xyflow/react/dist/style.css'
import { ARCHIVE, CATEGORIES } from './archive'
import { freshGraph, STORAGE_KEY } from './defaults'
import { plateLayers, portKind } from './eval'
import { createNode } from './graph'
import { GraphApiContext, nodeTypes } from './nodes'
import { PLATE_H, PLATE_W, orderedLayers, paintContact, paintPlate, reconcileOrder, renderSvg } from './paint'
import { PLATE_ID, type BlendMode, type Category, type LayerEdit, type ToolData, type ToolNode } from './types'

type Saved = {
  nodes: ToolNode[]
  edges: Edge[]
  edits: Record<string, LayerEdit>
  order: string[]
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return freshGraph()
    const parsed = JSON.parse(raw) as Partial<Saved>
    if (!Array.isArray(parsed.nodes) || !parsed.nodes.some((node) => node.id === PLATE_ID)) return freshGraph()
    return {
      nodes: parsed.nodes.map((node) => (node.id === PLATE_ID ? { ...node, deletable: false, type: 'tool' } : { ...node, type: 'tool' })),
      edges: parsed.edges ?? [],
      edits: parsed.edits ?? {},
      order: parsed.order ?? [],
    }
  } catch {
    return freshGraph()
  }
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const BLENDS: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'difference', label: 'Difference' },
]

export function App() {
  const initial = useRef(load())
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.current.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.current.edges)
  const [edits, setEdits] = useState(initial.current.edits)
  const [order, setOrder] = useState(initial.current.order)
  const [instance, setInstance] = useState<ReactFlowInstance<ToolNode> | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'All'>('All')
  const [dragLayer, setDragLayer] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const graphRef = useRef({ nodes, edges })
  graphRef.current = { nodes, edges }

  const layers = useMemo(() => plateLayers(nodes, edges), [nodes, edges])
  const layerKey = layers.map((layer) => layer.id).join('|')

  const layersRef = useRef(layers)
  layersRef.current = layers

  useEffect(() => {
    const currentLayers = layersRef.current
    const ids = currentLayers.map((layer) => layer.id)
    setOrder((current) => {
      const next = reconcileOrder(current, ids)
      return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next
    })
    setEdits((current) => {
      let changed = false
      const next = { ...current }
      for (const layer of currentLayers) {
        if (!next[layer.id]) {
          next[layer.id] = { name: layer.name, visible: true, opacity: 1, blend: 'source-over' }
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [layerKey])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges, edits, order }))
  }, [nodes, edges, edits, order])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancel = false
    const draw = () => {
      if (!cancel) paintPlate(canvas, layers, edits, order)
    }
    draw()
    document.fonts.ready.then(draw)
    return () => {
      cancel = true
    }
  }, [layers, edits, order])

  const update = useCallback(
    (id: string, params: ToolData['params']) => {
      setNodes((current) => current.map((node) => (node.id === id ? { ...node, data: { ...node.data, params } } : node)))
    },
    [setNodes],
  )

  const remove = useCallback(
    (id: string) => {
      if (id === PLATE_ID) return
      setNodes((current) => current.filter((node) => node.id !== id))
      setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id))
    },
    [setNodes, setEdges],
  )

  const api = useMemo(() => ({ update, remove }), [update, remove])

  const handleNodesChange = useCallback(
    (changes: NodeChange<ToolNode>[]) => {
      onNodesChange(changes.filter((change) => !(change.type === 'remove' && change.id === PLATE_ID)))
    },
    [onNodesChange],
  )

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return false
    if (portKind(connection.sourceHandle) !== portKind(connection.targetHandle)) return false
    const current = graphRef.current.edges
    if (current.some((edge) => edge.source === connection.source && edge.target === connection.target && edge.targetHandle === connection.targetHandle)) return false
    return true
  }, [])

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((current) => addEdge(connection, current)),
    [setEdges],
  )

  const addTool = useCallback(
    (toolId: string, position?: { x: number; y: number }) => {
      const spot = position ?? {
        x: 180 + (nodes.length % 5) * 24,
        y: 120 + (nodes.length % 4) * 24,
      }
      const node = createNode(toolId, spot)
      setNodes((current) => [...current.map((item) => ({ ...item, selected: false })), { ...node, selected: true }])
    },
    [nodes.length, setNodes],
  )

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault()
      const toolId = event.dataTransfer.getData('application/matter-tool')
      if (!toolId || !instance) return
      addTool(toolId, instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    },
    [addTool, instance],
  )

  const reset = () => {
    if (!window.confirm('Clear the patch and return to the opening plate?')) return
    const graph = freshGraph()
    localStorage.removeItem(STORAGE_KEY)
    setNodes(graph.nodes)
    setEdges(graph.edges)
    setEdits(graph.edits)
    setOrder(graph.order)
  }

  const shown = ARCHIVE.filter((tool) => (category === 'All' || tool.category === category) && (`${tool.name} ${tool.summary}`.toLowerCase().includes(query.trim().toLowerCase())))
  const stack = orderedLayers(layers, order, edits)

  const exportPng = () => {
    const canvas = document.createElement('canvas')
    canvas.width = PLATE_W
    canvas.height = PLATE_H
    paintPlate(canvas, layers, edits, order)
    canvas.toBlob((blob) => {
      if (blob) download('matter-plate.png', blob)
    })
  }

  const exportSvg = () => download('matter-plate.svg', new Blob([renderSvg(layers, edits, order)], { type: 'image/svg+xml' }))

  const exportSheet = () => {
    paintContact(layers, edits, order).toBlob((blob) => {
      if (blob) download('matter-layers.png', blob)
    })
  }

  const exportJson = () => {
    const patch = { nodes, edges, edits, order }
    download('matter-patch.json', new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' }))
  }

  const moveLayer = (id: string, before: string) => {
    setOrder((current) => {
      const next = reconcileOrder(current, layers.map((layer) => layer.id)).filter((item) => item !== id)
      const index = next.indexOf(before)
      next.splice(index < 0 ? next.length : index, 0, id)
      return next
    })
  }

  return (
    <GraphApiContext.Provider value={api}>
      <div className="app">
        <header className="topbar">
          <div>
            <p className="wordmark">Matter Matters</p>
            <p className="brand-sub">Each node is the real tool: its controls, its method. Cable any layer into any other, in any order, then into the plate.</p>
          </div>
          <div className="top-actions">
            <span className="live-pill">
              <i />
              {stack.length} layers
            </span>
            <button type="button" className="text-button" onClick={reset}>
              Reset
            </button>
          </div>
        </header>
        <div className="workspace">
          <nav className="archive" aria-label="Tool archive">
            <div className="filters" role="group" aria-label="Categories">
              <button type="button" className="choice" aria-pressed={category === 'All'} onClick={() => setCategory('All')}>
                All
              </button>
              {CATEGORIES.map((item) => (
                <button key={item} type="button" className="choice" aria-pressed={category === item} onClick={() => setCategory(item)}>
                  {item}
                </button>
              ))}
            </div>
            <input className="search" placeholder="Search the archive" aria-label="Search the archive" value={query} onChange={(event) => setQuery(event.target.value)} />
            <p className="hint">{shown.length} tools</p>
            <ul>
              {shown.map((tool) => (
                <li key={tool.id}>
                  <button
                    type="button"
                    className="archive-item"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('application/matter-tool', tool.id)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onClick={() => addTool(tool.id)}
                  >
                    <span className="kicker">{tool.category}</span>
                    <strong>{tool.name}</strong>
                    <small>{tool.summary}</small>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="canvas-wrap">
            <ReactFlow
              className="matter-flow"
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              nodeTypes={nodeTypes}
              onInit={setInstance}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={onDrop}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.4}
              maxZoom={1.5}
              deleteKeyCode={['Backspace', 'Delete']}
              colorMode="light"
              proOptions={{ hideAttribution: false }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.15} color="#cfc6b8" />
              <Controls position="top-right" showInteractive={false} />
            </ReactFlow>
          </div>
          <aside className="plate">
            <p className="kicker">Plate</p>
            <canvas ref={canvasRef} width={PLATE_W} height={PLATE_H} aria-label="Composited plate" />
            <div className="exports" role="group" aria-label="Export formats">
              <button type="button" onClick={exportPng}>PNG</button>
              <button type="button" onClick={exportSvg}>SVG</button>
              <button type="button" onClick={exportSheet}>Layers</button>
              <button type="button" onClick={exportJson}>JSON</button>
            </div>
            <ol className="layers">
              {stack.length === 0 && <li className="hint">Cable a layer into the plate.</li>}
              {stack.map((layer) => {
                const edit = edits[layer.id] ?? { name: layer.name, visible: true, opacity: 1, blend: 'source-over' as const }
                return (
                  <li
                    key={layer.id}
                    draggable
                    onDragStart={() => setDragLayer(layer.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragLayer) moveLayer(dragLayer, layer.id)
                      setDragLayer(null)
                    }}
                  >
                    <div className="layer-top">
                      <button
                        type="button"
                        className="eye"
                        aria-pressed={edit.visible}
                        onClick={() => setEdits((current) => ({ ...current, [layer.id]: { ...edit, visible: !edit.visible } }))}
                      >
                        {edit.visible ? 'On' : 'Off'}
                      </button>
                      <input
                        aria-label="Layer name"
                        value={edit.name}
                        onChange={(event) => setEdits((current) => ({ ...current, [layer.id]: { ...edit, name: event.target.value } }))}
                      />
                    </div>
                    <label className="size-row">
                      <span>Opacity</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={edit.opacity}
                        aria-label="Opacity"
                        onChange={(event) => setEdits((current) => ({ ...current, [layer.id]: { ...edit, opacity: Number(event.target.value) } }))}
                      />
                    </label>
                    <div className="choices">
                      {BLENDS.map((blend) => (
                        <button
                          key={blend.value}
                          type="button"
                          className="choice"
                          aria-pressed={edit.blend === blend.value}
                          onClick={() => setEdits((current) => ({ ...current, [layer.id]: { ...edit, blend: blend.value } }))}
                        >
                          {blend.label}
                        </button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ol>
          </aside>
        </div>
      </div>
    </GraphApiContext.Provider>
  )
}
