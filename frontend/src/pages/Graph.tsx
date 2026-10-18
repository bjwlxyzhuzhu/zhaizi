import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { App, AutoComplete, Button, Spin, Tag } from 'antd'
import { PauseCircleOutlined, PlayCircleOutlined, SearchOutlined } from '@ant-design/icons'
import { api } from '../api'
import { NODE_COLORS } from '../theme'
import { Grade, refLink } from '../components/ui'
import type { GEdge, GNode, Highlight } from '../three/StarGraph'

const StarGraph = lazy(() => import('../three/StarGraph'))
const TYPES = Object.keys(NODE_COLORS)

function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/** 2D 降级视图：选中节点与一跳邻居的放射布局 */
function Radial2D({ node, onPick }: { node: any; onPick: (id: number) => void }) {
  if (!node) return <div className="empty" style={{ paddingTop: 200 }}>请在右侧或通过搜索选择一个节点</div>
  const nb = Object.values(node.neighbors || {}).flat().slice(0, 14) as any[]
  const W = 900, H = 640, cx = W / 2, cy = H / 2 + 20
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }}>
      <circle cx={cx} cy={cy} r={170} fill="none" stroke="#2c3a35" strokeDasharray="4 8" />
      {nb.map((n, i) => {
        const a = (i / nb.length) * Math.PI * 2 - Math.PI / 2
        const x = cx + Math.cos(a) * 250, y = cy + Math.sin(a) * 230
        return (
          <g key={n.edge_id} style={{ cursor: 'pointer' }} onClick={() => onPick(n.id)}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#3f8f7a" strokeOpacity={0.7} />
            <circle cx={x} cy={y} r={38} fill="#123029" stroke={NODE_COLORS[n.type]} strokeOpacity={0.6} />
            <text x={x} y={y + 6} textAnchor="middle" fill="#efe6cf" fontSize={n.name.length > 3 ? 12 : 17} fontFamily="var(--serif)">{n.name.slice(0, 6)}</text>
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={86} fill="#2a2f22" stroke="#c9a45c" strokeWidth={2} />
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#f3e2b8" fontSize={28} fontFamily="var(--serif)">{node.name.slice(0, 5)}</text>
    </svg>
  )
}

export default function Graph() {
  const nav = useNavigate()
  const { message } = App.useApp()
  const [params] = useSearchParams()
  const [gl] = useState(webglOk)
  const [mode2d, setMode2d] = useState(!gl)
  const [nodes, setNodes] = useState<GNode[]>([])
  const [edges, setEdges] = useState<GEdge[]>([])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<number | null>(null)
  const [highlight, setHighlight] = useState<Highlight | null>(null)
  const [flyTo, setFlyTo] = useState<{ id: number; nonce: number } | null>(null)
  const [paused, setPaused] = useState(false)
  const [mode, setMode] = useState<'rel' | 'path'>('rel')
  const [pathInfo, setPathInfo] = useState<string>('')
  const [q, setQ] = useState('')
  const timers = useRef<number[]>([])

  const { data: overview, isLoading } = useQuery({ queryKey: ['kg-overview'], queryFn: () => api.get('/kg/graph') })
  useEffect(() => {
    if (overview) {
      setNodes(overview.nodes)
      setEdges(overview.edges)
    }
  }, [overview])

  const { data: detail } = useQuery({ queryKey: ['kg-node', selected], queryFn: () => api.get(`/kg/nodes/${selected}`), enabled: !!selected })
  const { data: options = [] } = useQuery({ queryKey: ['kg-search', q], queryFn: () => api.get(`/kg/nodes?q=${encodeURIComponent(q)}&limit=12`), enabled: q.length > 0 })

  const merge = useCallback((res: { nodes: GNode[]; edges: GEdge[] }) => {
    setNodes((old) => {
      const ids = new Set(old.map((n) => n.id))
      const add = res.nodes.filter((n) => !ids.has(n.id))
      return add.length ? [...old, ...add] : old
    })
    setEdges((old) => {
      const ids = new Set(old.map((e) => e.id))
      const add = res.edges.filter((e) => !ids.has(e.id))
      return add.length ? [...old, ...add] : old
    })
  }, [])

  const expand = useCallback(async (id: number) => {
    const r = await api.get(`/kg/nodes/${id}/neighbors`)
    merge(r)
    return r
  }, [merge])

  const focus = useCallback(async (id: number, hl = true) => {
    clearTimers()
    setMode('rel')
    setPathInfo('')
    const r = await expand(id)
    setSelected(id)
    if (hl) setHighlight({ nodes: new Set([id, ...r.nodes.map((n: GNode) => n.id)]), edges: new Set(r.edges.map((e: GEdge) => e.id)) })
    setTimeout(() => setFlyTo({ id, nonce: Date.now() }), 250)
  }, [expand])

  // 资料库“在图谱中查看”跳转聚焦（LIB-5）
  useEffect(() => {
    const f = params.get('focus')
    if (f && overview) focus(Number(f))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview])

  function clearTimers() {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  // KG-6 路径模式：器—铭—字—音—义，逐层点亮，每层 0.6 秒
  const runPath = async (vesselId?: number) => {
    const id = vesselId ?? (detail?.type === '器' ? detail.id : nodes.find((n) => n.type === '器' && n.name === '何尊')?.id)
    if (!id) return message.info('请先选择一件器物节点')
    clearTimers()
    setMode('path')
    const { layers } = await api.get(`/kg/chain/${id}`)
    const all = layers.flatMap((l: any) => l.nodes)
    const missing = all.filter((n: number) => !nodes.some((x) => x.id === n))
    if (missing.length) {
      for (const l of layers.slice(0, 4)) for (const n of l.nodes.slice(0, 12)) await expand(n)
    }
    setSelected(id)
    setFlyTo({ id, nonce: Date.now() })
    const ns = new Set<number>()
    const es = new Set<number>()
    layers.forEach((l: any, i: number) => {
      timers.current.push(window.setTimeout(() => {
        l.nodes.forEach((n: number) => ns.add(n))
        l.edges.forEach((e: number) => es.add(e))
        setHighlight({ nodes: new Set(ns), edges: new Set(es) })
        setPathInfo(layers.slice(0, i + 1).map((x: any) => `${x.type}(${x.nodes.length})`).join(' → '))
      }, 400 + i * 600))
    })
  }

  const nodeName = (id: number) => nodes.find((n) => n.id === id)?.name
  const neighborGroups = detail?.neighbors || {}
  const link = detail?.ref_table ? refLink(detail.ref_table, detail.ref_id, `${detail.type === '字形' ? '字形·' + detail.name : ''}`) : null
  const counts = overview?.counts || {}

  return (
    <div style={{ position: 'relative', height: 'calc(100vh - var(--header-h))', overflow: 'hidden', background: '#070b0a' }}>
      <div className="canvas-wrap">
        {mode2d ? (
          <Radial2D node={detail} onPick={(id) => focus(id)} />
        ) : isLoading ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><Spin /></div>
        ) : (
          <Suspense fallback={<div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><Spin /></div>}>
            <StarGraph nodes={nodes} edges={edges} hidden={hidden} selected={selected} highlight={highlight} flyTo={flyTo} paused={paused}
              onSelect={(id) => { if (id === null) { setSelected(null); setHighlight(null); clearTimers(); setPathInfo('') } else focus(id) }}
              onExpand={(id) => expand(id).then((r) => message.success(`已展开 ${r.nodes.length} 个邻居`))}
              onLowFps={() => message.warning({ content: <span>帧率较低，可切换到 2D 视图 <a onClick={() => setMode2d(true)}>切换</a></span>, duration: 8 })} />
          </Suspense>
        )}
      </div>

      <div style={{ position: 'absolute', left: 36, top: 28, zIndex: 5, maxWidth: 560 }}>
        <div className="eyebrow">KNOWLEDGE CONSTELLATION</div>
        <div className="page-title" style={{ fontSize: 34 }}>从一件器物，读懂一张文明网络</div>
        <AutoComplete
          style={{ width: 420, marginTop: 10 }}
          options={options.map((o: any) => ({ value: String(o.id), label: <span><Tag color={NODE_COLORS[o.type]} style={{ color: '#111' }}>{o.type}</Tag>{o.name}</span> }))}
          onSearch={setQ}
          onSelect={(v) => { focus(Number(v)); setQ('') }}
          value={q}
          onChange={setQ}
        >
          <input className="ant-input" placeholder="搜索：何尊 / 宅 / 中国 / 礼制" style={{ height: 44, background: 'rgba(15,21,19,.8)', border: '1px solid #2a3733', borderRadius: 10, padding: '0 14px', color: '#e6e2d6', width: '100%' }} />
        </AutoComplete>
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <span className={`chip ${mode === 'rel' ? 'on' : ''}`} onClick={() => { clearTimers(); setMode('rel'); setHighlight(null); setPathInfo('') }}>关系图谱</span>
          <span className={`chip ${mode === 'path' ? 'on' : ''}`} onClick={() => runPath()}>路径模式 · 器—铭—字—音—义</span>
          <span className="chip" onClick={() => nav('/library/characters')}>字形谱系</span>
          {gl && <span className="chip" onClick={() => setMode2d((m) => !m)}>{mode2d ? '3D 视图' : '2D 视图'}</span>}
          <span className="chip" onClick={() => setPaused((p) => !p)}>{paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />} {paused ? '继续' : '暂停'}</span>
        </div>
        {pathInfo && <div className="tag-gold" style={{ marginTop: 12 }}>{pathInfo}</div>}
        <div className="legend" style={{ marginTop: 14, maxWidth: 520 }}>
          {TYPES.map((t) => (
            <span key={t} className={hidden.has(t) ? 'off' : ''} onClick={() => setHidden((h) => { const n = new Set(h); n.has(t) ? n.delete(t) : n.add(t); return n })}>
              <i style={{ background: NODE_COLORS[t], color: NODE_COLORS[t] }} />{t} {counts[t] ?? ''}
            </span>
          ))}
        </div>
      </div>

      <div className="float-panel" style={{ right: 28, top: 28, bottom: 28, width: 400, padding: '24px 26px', overflowY: 'auto' }}>
        {!detail ? (
          <>
            <div className="panel-title">图谱概况</div>
            <div className="note" style={{ margin: '10px 0 18px' }}>
              共 {overview?.total_nodes ?? '—'} 个节点、{overview?.total_edges ?? '—'} 条关系；首屏载入 {nodes.length} 个，双击节点增量展开一跳邻居。
            </div>
            <div className="serif" style={{ marginBottom: 10 }}>从这里开始</div>
            {nodes.filter((n) => n.type === '器').slice(0, 10).map((n) => (
              <div key={n.id} className="row-line" style={{ cursor: 'pointer' }} onClick={() => focus(n.id)}>
                <span><span className="gold" style={{ marginRight: 8 }}>器</span>{n.name}</span><span className="dim">↗</span>
              </div>
            ))}
            <Button block className="btn-gold" style={{ marginTop: 18 }} onClick={() => runPath()}>探索何尊关联路径</Button>
          </>
        ) : (
          <>
            <div className="panel-head" style={{ marginBottom: 12 }}>
              <span className="panel-title">选中节点</span>
              <span className="panel-cap">{detail.type} · 连接 {detail.degree}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="serif" style={{ fontSize: 30 }}>{detail.name}</span>
              <span className="tag-gold" style={{ borderColor: NODE_COLORS[detail.type], color: NODE_COLORS[detail.type] }}>{detail.type}节点</span>
              {detail.props?.grade && <Grade g={detail.props.grade} />}
            </div>
            {detail.props?.desc && <div style={{ lineHeight: 1.9, margin: '12px 0', fontSize: 14 }}>{detail.props.desc}</div>}
            {Object.entries(detail.props || {}).filter(([k]) => !['desc', 'grade'].includes(k)).map(([k, v]) => (
              <div key={k} className="note">{({ period: '时代', collection: '现藏', char_count: '字数', script: '书体', ipa: '音标', meaning: '词义' } as any)[k] || k}：{String(v)}</div>
            ))}
            <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
              {link && <Button size="small" onClick={() => nav(link)}>资料库详情</Button>}
              {detail.type === '器' && <Button size="small" type="primary" onClick={() => runPath(detail.id)}>路径模式</Button>}
              <Button size="small" onClick={() => expand(detail.id)}>展开邻居</Button>
            </div>
            <div className="panel-head" style={{ marginTop: 18, marginBottom: 6 }}>
              <span className="panel-title" style={{ fontSize: 18 }}>一跳关系</span>
              <span className="panel-cap">邻接节点</span>
            </div>
            {Object.entries(neighborGroups).map(([type, list]: any) => (
              <div key={type} style={{ marginBottom: 10 }}>
                <div className="note" style={{ color: NODE_COLORS[type], margin: '8px 0 2px' }}>{type} · {list.length}</div>
                {list.slice(0, 16).map((n: any) => (
                  <div key={n.edge_id} className="row-line" style={{ padding: '8px 0', cursor: 'pointer' }} onClick={() => focus(n.id)}>
                    <span><b className="gold" style={{ marginRight: 8, fontWeight: 400 }}>{n.rel}</b>{n.name}</span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Grade g={n.grade} /><span className="dim">↗</span></span>
                  </div>
                ))}
                {list.length > 16 && <div className="note">另有 {list.length - 16} 个……</div>}
              </div>
            ))}
            {Object.keys(neighborGroups).length > 0 && (
              <div className="note" style={{ marginTop: 10 }}>出处：{Array.from(new Set(Object.values(neighborGroups).flat().map((n: any) => n.src))).slice(0, 3).join('；')}</div>
            )}
          </>
        )}
      </div>
      <div className="hint-bar">拖拽旋转 · 滚轮缩放 · 点击聚焦 · 双击展开{selected && nodeName(selected) ? ` · 当前：${nodeName(selected)}` : ''}</div>
      <SearchOutlined style={{ display: 'none' }} />
    </div>
  )
}
