/**
 * S2 星空式 3D 力导向知识图谱（PRD KG-1 ~ KG-6）
 * 节点：发光球体，按类型着色、按连接数定大小；边：半透明细线；背景星尘缓慢漂移。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'
import { NODE_COLORS } from '../theme'
import { prefersReducedMotion } from '../store'

export interface GNode { id: number; type: string; name: string; degree?: number }
export interface GEdge { id: number; source: number; target: number; rel: string }
export interface Highlight { nodes: Set<number>; edges: Set<number> }

interface Props {
  nodes: GNode[]
  edges: GEdge[]
  hidden: Set<string>
  selected: number | null
  highlight: Highlight | null
  flyTo: { id: number; nonce: number } | null
  paused?: boolean
  bloom?: boolean
  showAllLabels?: boolean
  onSelect?: (id: number | null) => void
  onExpand?: (id: number) => void
  onLowFps?: () => void
}

const tmpM = new THREE.Matrix4()
const tmpV = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()
const tmpC = new THREE.Color()

function nodeSize(n: GNode) {
  return 1.1 + Math.min(Math.sqrt(n.degree || 1), 9) * 0.55 + (n.type === '器' ? 1.4 : 0)
}

function Stardust({ paused }: { paused?: boolean }) {
  const ref = useRef<THREE.Points>(null)
  const pos = useMemo(() => {
    const a = new Float32Array(3000 * 3)
    for (let i = 0; i < 3000; i++) {
      const r = 180 + Math.random() * 420
      const t = Math.random() * Math.PI * 2
      const p = Math.acos(2 * Math.random() - 1)
      a.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p)], i * 3)
    }
    return a
  }, [])
  useFrame((_, dt) => {
    if (ref.current && !paused) ref.current.rotation.y += dt * 0.006
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial size={1.3} color="#8fb8ac" transparent opacity={0.55} depthWrite={false} sizeAttenuation />
    </points>
  )
}

function Graph(props: Props) {
  const { nodes, edges, hidden, selected, highlight, flyTo, paused, onSelect, onExpand, onLowFps } = props
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const lineRef = useRef<THREE.LineSegments>(null)
  const controls = useThree((s) => s.controls) as any
  const camera = useThree((s) => s.camera)
  const target = useRef(new Map<number, THREE.Vector3>()) // 布局目标位置
  const cur = useRef(new Map<number, THREE.Vector3>()) // 当前显示位置（平滑插值）
  const [hover, setHover] = useState<number | null>(null)
  const index = useMemo(() => new Map(nodes.map((n, i) => [n.id, i])), [nodes])
  const fly = useRef<{ from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number } | null>(null)
  const fps = useRef({ frames: 0, time: 0, warned: false })

  // Worker 力导向
  useEffect(() => {
    const w = new Worker(new URL('./forceWorker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => {
      const { ids, pos } = e.data as { ids: number[]; pos: Float32Array }
      ids.forEach((id, i) => {
        const v = target.current.get(id) || new THREE.Vector3()
        v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
        target.current.set(id, v)
        if (!cur.current.has(id)) cur.current.set(id, v.clone().multiplyScalar(0.2))
      })
    }
    w.postMessage({
      nodes: nodes.map((n) => {
        const p = target.current.get(n.id)
        return { id: n.id, degree: n.degree, ...(p ? { x: p.x, y: p.y, z: p.z } : {}) }
      }),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
    })
    return () => w.terminate()
  }, [nodes, edges])

  // 线段几何
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3))
    return g
  }, [edges])

  // 镜头飞行（800ms）
  useEffect(() => {
    if (!flyTo || !controls) return
    const p = target.current.get(flyTo.id) || cur.current.get(flyTo.id)
    if (!p) return
    const dir = camera.position.clone().sub(controls.target).normalize()
    fly.current = {
      from: camera.position.clone(),
      to: p.clone().add(dir.multiplyScalar(70)),
      tFrom: controls.target.clone(),
      tTo: p.clone(),
      t: 0,
    }
  }, [flyTo, controls, camera])

  useFrame((_, dt) => {
    // 帧率监测（KG-9：持续 <20fps 提示降级）
    const f = fps.current
    f.frames++
    f.time += dt
    if (f.time > 5) {
      if (f.frames / f.time < 20 && !f.warned) {
        f.warned = true
        onLowFps?.()
      }
      f.frames = 0
      f.time = 0
    }

    const mesh = meshRef.current
    if (!mesh) return
    const k = Math.min(1, dt * 4)
    const dimAll = !!highlight
    nodes.forEach((n, i) => {
      const t = target.current.get(n.id)
      let c = cur.current.get(n.id)
      if (!c) {
        c = new THREE.Vector3((Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50)
        cur.current.set(n.id, c)
      }
      if (t) c.lerp(t, k)
      const isHidden = hidden.has(n.type)
      const lit = !dimAll || highlight!.nodes.has(n.id)
      let s = isHidden ? 0 : nodeSize(n)
      if (n.id === selected) s *= 1.3
      else if (n.id === hover) s *= 1.3
      tmpM.compose(c, tmpQ, tmpS.set(s, s, s))
      mesh.setMatrixAt(i, tmpM)
      tmpC.set(NODE_COLORS[n.type] || '#ffffff').multiplyScalar(lit ? (n.id === selected ? 1.9 : 1.4) : 0.18)
      mesh.setColorAt(i, tmpC)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()

    const pos = lineGeo.attributes.position as THREE.BufferAttribute
    const col = lineGeo.attributes.color as THREE.BufferAttribute
    edges.forEach((e, i) => {
      const a = cur.current.get(e.source)
      const b = cur.current.get(e.target)
      if (!a || !b) return
      pos.setXYZ(i * 2, a.x, a.y, a.z)
      pos.setXYZ(i * 2 + 1, b.x, b.y, b.z)
      const na = nodes[index.get(e.source) ?? -1]
      const nb = nodes[index.get(e.target) ?? -1]
      const vis = na && nb && !hidden.has(na.type) && !hidden.has(nb.type)
      let r = 0.16, g = 0.36, bl = 0.32 // 半透明铜绿
      if (dimAll) {
        if (highlight!.edges.has(e.id)) [r, g, bl] = [0.95, 0.75, 0.38]
        else [r, g, bl] = [0.03, 0.06, 0.05]
      } else if (selected && (e.source === selected || e.target === selected)) [r, g, bl] = [0.75, 0.62, 0.35]
      if (!vis) [r, g, bl] = [0, 0, 0]
      col.setXYZ(i * 2, r, g, bl)
      col.setXYZ(i * 2 + 1, r, g, bl)
    })
    pos.needsUpdate = true
    col.needsUpdate = true

    if (fly.current && controls) {
      const fl = fly.current
      fl.t = Math.min(1, fl.t + dt / 0.8)
      const e = 1 - Math.pow(1 - fl.t, 3)
      camera.position.lerpVectors(fl.from, fl.to, e)
      controls.target.lerpVectors(fl.tFrom, fl.tTo, e)
      controls.update()
      if (fl.t >= 1) fly.current = null
    }
  })

  const labelIds = useMemo(() => {
    const s = new Set<number>()
    if (selected) s.add(selected)
    if (hover) s.add(hover)
    if (highlight) Array.from(highlight.nodes).slice(0, 40).forEach((id) => s.add(id))
    if (props.showAllLabels || (!selected && !highlight)) nodes.filter((n) => n.type === '器' || (n.degree || 0) > 12).forEach((n) => s.add(n.id))
    else if (selected) edges.forEach((e) => {
      if (e.source === selected) s.add(e.target)
      if (e.target === selected) s.add(e.source)
    })
    return Array.from(s).filter((id) => index.has(id) && !hidden.has(nodes[index.get(id)!].type)).slice(0, 60)
  }, [selected, hover, highlight, nodes, edges, index, hidden, props.showAllLabels])

  const pick = (e: ThreeEvent<MouseEvent>) => (e.instanceId !== undefined ? nodes[e.instanceId] : null)

  return (
    <>
      <instancedMesh
        key={nodes.length}
        ref={meshRef}
        args={[undefined, undefined, nodes.length]}
        onPointerMove={(e) => {
          e.stopPropagation()
          const n = pick(e)
          if (n && !hidden.has(n.type)) {
            setHover(n.id)
            document.body.style.cursor = 'pointer'
          }
        }}
        onPointerOut={() => {
          setHover(null)
          document.body.style.cursor = ''
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (e.delta > 5) return
          const n = pick(e)
          if (n && !hidden.has(n.type)) onSelect?.(n.id)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          const n = pick(e)
          if (n) onExpand?.(n.id)
        }}
      >
        <sphereGeometry args={[1, 18, 14]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <lineSegments ref={lineRef} geometry={lineGeo}>
        <lineBasicMaterial vertexColors transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {labelIds.map((id) => (
        <Label key={id} node={nodes[index.get(id)!]} posMap={cur} strong={id === selected || id === hover} />
      ))}
    </>
  )
}

function Label({ node, posMap, strong }: { node: GNode; posMap: React.MutableRefObject<Map<number, THREE.Vector3>>; strong: boolean }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    const p = posMap.current.get(node.id)
    if (p && g.current) g.current.position.set(p.x, p.y + nodeSize(node) + 1.6, p.z)
  })
  return (
    <group ref={g}>
      <Html center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            whiteSpace: 'nowrap', fontSize: strong ? 14 : 12, fontFamily: 'var(--serif)', color: strong ? '#f3e2b8' : '#d9d3c2',
            textShadow: '0 0 6px #000, 0 0 2px #000', opacity: strong ? 1 : 0.85,
          }}
        >
          {node.name}
          {strong && <span style={{ fontSize: 11, color: NODE_COLORS[node.type], marginLeft: 6 }}>{node.type}</span>}
        </div>
      </Html>
    </group>
  )
}

function AutoRotate({ paused }: { paused?: boolean }) {
  const controls = useThree((s) => s.controls) as any
  useEffect(() => {
    if (controls) controls.autoRotate = !paused && !prefersReducedMotion()
  }, [controls, paused])
  return null
}

export default function StarGraph(props: Props) {
  return (
    <Canvas camera={{ position: [0, 40, 260], fov: 50, near: 1, far: 3000 }} dpr={[1, 1.75]} gl={{ antialias: true }}
      onPointerMissed={() => props.onSelect?.(null)} frameloop={props.paused ? 'demand' : 'always'}>
      <color attach="background" args={['#070b0a']} />
      <fog attach="fog" args={['#070b0a', 300, 900]} />
      <Stardust paused={props.paused} />
      <Graph {...props} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} autoRotateSpeed={0.35} minDistance={20} maxDistance={900} />
      <AutoRotate paused={props.paused || !!props.selected || !!props.highlight} />
      {props.bloom !== false && (
        <EffectComposer>
          <Bloom intensity={1.1} luminanceThreshold={0.25} luminanceSmoothing={0.3} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  )
}
