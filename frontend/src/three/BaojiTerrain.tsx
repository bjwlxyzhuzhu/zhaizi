import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlType } from 'three-stdlib'
import * as THREE from 'three'
import boundaries from '../assets/baoji.json'
import relief from '../assets/baoji-relief.json'

export interface District { name: string; count: number; vessels: { id: number; name: string; period: string; image?: string }[] }
type Point = number[]
const [W, S, E, N] = relief.bbox
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI
const scale = 155 / (E - W)
function project([lon, lat]: Point): [number, number] { return [(lon - (W + E) / 2) * scale, (merc(lat) - (merc(S) + merc(N)) / 2) * scale] }
function elevation(lon: number, lat: number) {
  const x = Math.max(0, Math.min(relief.width - 1, (lon - W) / (E - W) * (relief.width - 1)))
  const y = Math.max(0, Math.min(relief.height - 1, (N - lat) / (N - S) * (relief.height - 1)))
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, relief.width - 1), y1 = Math.min(y0 + 1, relief.height - 1)
  const h = (a: number, b: number) => relief.elevations[b * relief.width + a]
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(x0, y0), h(x1, y0), x - x0), THREE.MathUtils.lerp(h(x0, y1), h(x1, y1), x - x0), y - y0)
}
const altitude = (p: Point) => 2 + elevation(p[0], p[1]) / 350
function inside(p: Point, ring: Point[]) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit
  }
  return hit
}

function geometry(polys: Point[][][], light: boolean) {
  const shapes: THREE.Shape[] = []
  const line: number[] = [], vertices: number[] = [], colors: number[] = []
  for (const poly of polys) {
    const shape = new THREE.Shape(poly[0].map(p => new THREE.Vector2(...project(p))))
    shape.holes = poly.slice(1).map(ring => new THREE.Path(ring.map(p => new THREE.Vector2(...project(p)))))
    shapes.push(shape)
    for (const ring of poly) for (let i = 1; i < ring.length; i++) {
      for (const p of [ring[i - 1], ring[i]]) { const [x, y] = project(p); line.push(x, altitude(p) + .28, -y) }
    }
  }
  const base = new THREE.ExtrudeGeometry(shapes, { depth: 2, bevelEnabled: false, curveSegments: 1 })
  base.rotateX(-Math.PI / 2)
  const border = new THREE.BufferGeometry()
  border.setAttribute('position', new THREE.Float32BufferAttribute(line, 3))
  const outer = polys.flatMap(p => p[0])
  const minX = Math.min(...outer.map(p => p[0])), maxX = Math.max(...outer.map(p => p[0]))
  const minY = Math.min(...outer.map(p => p[1])), maxY = Math.max(...outer.map(p => p[1]))
  const cols = 150, rows = 165, dx = (E - W) / cols, dy = (N - S) / rows
  const add = (p: Point) => {
    const [x, y] = project(p), h = elevation(p[0], p[1])
    vertices.push(x, altitude(p), -y)
    const low = new THREE.Color(light ? '#345f50' : '#0a585b'), high = new THREE.Color(light ? '#d1c9a9' : '#aad5bd')
    low.lerp(high, THREE.MathUtils.clamp((h - 500) / 3100, 0, 1))
    colors.push(low.r, low.g, low.b)
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const lon = W + c * dx, lat = S + r * dy
    if (lon < minX - dx || lon > maxX || lat < minY - dy || lat > maxY) continue
    const mid = [lon + dx / 2, lat + dy / 2]
    if (!polys.some(poly => inside(mid, poly[0]) && !poly.slice(1).some(ring => inside(mid, ring)))) continue
    const a = [lon, lat], b = [lon + dx, lat], d = [lon, lat + dy], e = [lon + dx, lat + dy]
    for (const p of [a, b, d, b, e, d]) add(p)
  }
  const surface = new THREE.BufferGeometry()
  surface.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  surface.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  surface.computeVertexNormals()
  return { base, border, surface }
}

function Region({ feature, district, light, active, onPick }: { feature: typeof boundaries.features[number]; district?: District; light: boolean; active: boolean; onPick: () => void }) {
  const geo = useMemo(() => geometry(feature.geometry.coordinates as Point[][][], light), [feature, light])
  useEffect(() => () => { geo.base.dispose(); geo.surface.dispose(); geo.border.dispose() }, [geo])
  const center = feature.properties.centroid || feature.properties.center
  const [x, y] = project(center)
  const h = altitude(center)
  const name = feature.properties.name === '凤翔县' ? '凤翔区' : feature.properties.name
  const count = district?.count || 0
  return <group onClick={e => { e.stopPropagation(); onPick() }}>
    <mesh geometry={geo.base}><meshStandardMaterial color={light ? '#adbaa8' : '#084352'} metalness={.35} roughness={.65} /></mesh>
    <mesh geometry={geo.surface}><meshStandardMaterial vertexColors roughness={.86} emissive={active ? (light ? '#665128' : '#158b91') : '#000000'} emissiveIntensity={.35} side={THREE.DoubleSide} /></mesh>
    <lineSegments geometry={geo.border}><lineBasicMaterial color={active ? '#f3ca75' : light ? '#dfd9ba' : '#46c8da'} transparent opacity={active ? 1 : .8} /></lineSegments>
    {count > 0 && <group position={[x, h, -y]}>
      <mesh position={[0, 3 + Math.sqrt(count) * 1.5, 0]}><cylinderGeometry args={[.4, .8, 6 + Math.sqrt(count) * 3, 12]} /><meshBasicMaterial color={light ? '#b18a45' : '#efc36a'} transparent opacity={.65} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.1, 2.1, 32]} /><meshBasicMaterial color={light ? '#ba9144' : '#81eced'} side={THREE.DoubleSide} /></mesh>
    </group>}
    <Html position={[x, h + (count ? 10 : 1), -y]} center zIndexRange={[10, 0]}>
      <button className={`map-label ${light ? 'light' : ''} ${active ? 'active' : ''}`} onClick={e => { e.stopPropagation(); onPick() }} title={`${name}：已审核器铭 ${count} 件`}>
        {name}{count > 0 && <b>{count}</b>}
      </button>
    </Html>
  </group>
}

class MapBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export default function BaojiTerrain({ districts, onPick, light = false }: { districts: District[]; onPick?: (d: District) => void; light?: boolean }) {
  const [active, setActive] = useState('')
  const controls = useRef<OrbitControlType>(null)
  const fallback = <div className="map-fallback">三维地图暂不可用，请使用区县列表查看资料。<div>{districts.map(d => <button key={d.name} onClick={() => onPick?.(d)}>{d.name} · {d.count}</button>)}</div></div>
  return <div className={`baoji-map ${light ? 'light' : ''}`}>
    <MapBoundary fallback={fallback}>
      <Canvas camera={{ position: [0, 150, 155], fov: 43, near: 1, far: 800 }} dpr={[1, 1.5]} frameloop="demand" gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={light ? 1.1 : .85} />
        <directionalLight position={[-70, 95, -40]} intensity={2.6} />
        <directionalLight position={[70, 30, 50]} intensity={.6} color={light ? '#e0ce9d' : '#3aadd7'} />
        {!light && <gridHelper args={[300, 60, '#16394c', '#0c2536']} position={[0, -3, 0]} />}
        {boundaries.features.map(feature => {
          const name = feature.properties.name === '凤翔县' ? '凤翔区' : feature.properties.name
          const district = districts.find(d => d.name === name)
          return <Region key={feature.properties.adcode} feature={feature} district={district} light={light} active={active === name} onPick={() => { setActive(name); if (district) onPick?.(district) }} />
        })}
        <OrbitControls ref={controls} enablePan={false} maxPolarAngle={1.1} minPolarAngle={.25} minDistance={100} maxDistance={360} enableDamping={false} />
      </Canvas>
    </MapBoundary>
    <div className="map-compass" aria-label="北向">N<span>↑</span></div>
    <button className="map-reset" onClick={() => controls.current?.reset()}>复位视角</button>
    <div className="map-key"><i />已审核器铭分布 · 点击区县查看</div>
    <details className="map-source"><summary>地图来源与口径</summary><div>行政边界：阿里云 DataV 610300；凤翔区使用现行名称。高程：Mapzen / Tilezen Terrarium（离线采样）；高程作可视化夸张。区县汇总标记不代表器物精确出土坐标。<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">高程数据来源</a></div></details>
  </div>
}
