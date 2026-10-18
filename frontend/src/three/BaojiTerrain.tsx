/**
 * S3 宝鸡 12 区县 3D 地形（PRD DASH-2）
 * 正式底图须使用经核验的公开标准底图数据（TBD-3）。在数据与许可到位前，
 * 这里用按区县相对方位生成的“示意分区”挤出体块，画面上明确标注“设计示意”。
 */
import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import * as THREE from 'three'

type P = [number, number]
const OUTLINE: P[] = [[-80, 20], [-62, 44], [-22, 52], [18, 60], [42, 42], [60, 20], [56, -6], [42, -26], [30, -56], [-8, -52], [-58, -56], [-76, -26]]
const SITES: Record<string, P> = {
  陇县: [-60, 24], 千阳县: [-32, 32], 麟游县: [6, 44], 凤翔区: [-8, 20], 岐山县: [22, 20], 扶风县: [44, 12],
  眉县: [38, -12], 太白县: [18, -40], 凤县: [-42, -38], 陈仓区: [-24, -4], 金台区: [2, 3], 渭滨区: [6, -14],
}

// 用半平面裁剪生成 Voronoi 分区（每个区县一个单元）
function clip(poly: P[], a: P, b: P): P[] {
  // 保留离 a 更近的一侧
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  const nx = b[0] - a[0], ny = b[1] - a[1]
  const side = (p: P) => (p[0] - mx) * nx + (p[1] - my) * ny
  const out: P[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    const sp = side(p), sq = side(q)
    if (sp <= 0) out.push(p)
    if ((sp <= 0) !== (sq <= 0)) {
      const t = sp / (sp - sq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}
function cells() {
  const names = Object.keys(SITES)
  return names.map((n) => {
    let poly = OUTLINE.slice()
    for (const m of names) if (m !== n) poly = clip(poly, SITES[n], SITES[m])
    return { name: n, site: SITES[n], poly }
  })
}

export interface District { name: string; count: number; vessels: { id: number; name: string; period: string; image?: string }[] }

function Block({ poly, active, onClick }: { poly: P[]; active: boolean; onClick: () => void }) {
  const { geo, edges } = useMemo(() => {
    const s = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x * 0.97, y * 0.97)))
    const g = new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: false })
    g.rotateX(-Math.PI / 2)
    return { geo: g, edges: new THREE.EdgesGeometry(g, 30) }
  }, [poly])
  return (
    <group>
      <mesh geometry={geo} onClick={(e) => { e.stopPropagation(); onClick() }}>
        <meshStandardMaterial color={active ? '#2f7d68' : '#173a32'} metalness={0.3} roughness={0.6} transparent opacity={0.92} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={active ? '#f3d58f' : '#6fb3a0'} toneMapped={false} />
      </lineSegments>
    </group>
  )
}

function Pillar({ x, z, count, max, onClick }: { x: number; z: number; count: number; max: number; onClick: () => void }) {
  const h = 6 + (count / Math.max(max, 1)) * 34
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(clock.elapsedTime * 2 + x) * 0.15
  })
  return (
    <group position={[x, 3, z]} onClick={(e) => { e.stopPropagation(); onClick() }}>
      <mesh ref={ref} position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.9, 1.4, h, 16, 1, true]} />
        <meshBasicMaterial color={[2.2, 1.7, 0.8]} transparent opacity={0.6} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, h, 0]}>
        <sphereGeometry args={[1.3, 16, 12]} />
        <meshBasicMaterial color={[2.6, 2.1, 1.1]} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[1.8, 3.4, 32]} />
        <meshBasicMaterial color={[1.6, 1.3, 0.6]} transparent opacity={0.5} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Sweep() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.x = ((clock.elapsedTime * 22) % 180) - 90
  })
  return (
    <mesh ref={ref} position={[0, 3.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[6, 130]} />
      <meshBasicMaterial color={[0.6, 1.4, 1.2]} transparent opacity={0.18} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}

export default function BaojiTerrain({ districts, onPick }: { districts: District[]; onPick?: (d: District) => void }) {
  const cs = useMemo(cells, [])
  const [active, setActive] = useState<string | null>(null)
  const map = Object.fromEntries(districts.map((d) => [d.name, d]))
  const max = Math.max(...districts.map((d) => d.count), 1)
  const pick = (n: string) => {
    setActive(n)
    if (map[n]) onPick?.(map[n])
  }
  return (
    <Canvas camera={{ position: [0, 95, 105], fov: 45 }} dpr={[1, 1.75]}>
      <color attach="background" args={['#06100d']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[40, 90, 30]} intensity={1.2} />
      <gridHelper args={[260, 52, '#123029', '#0c1e19']} position={[0, -0.1, 0]} />
      {cs.map((c) => (
        <group key={c.name}>
          <Block poly={c.poly} active={active === c.name} onClick={() => pick(c.name)} />
          {(map[c.name]?.count ?? 0) > 0 && <Pillar x={c.site[0]} z={-c.site[1]} count={map[c.name].count} max={max} onClick={() => pick(c.name)} />}
          <Html position={[c.site[0], 4, -c.site[1] + 5]} center style={{ pointerEvents: 'none' }}>
            <div style={{ color: active === c.name ? '#f3d58f' : '#cfe3dc', fontSize: 12, whiteSpace: 'nowrap', textShadow: '0 0 4px #000', fontFamily: 'var(--serif)' }}>
              {c.name}{map[c.name]?.count ? ` · ${map[c.name].count}` : ''}
            </div>
          </Html>
        </group>
      ))}
      <Sweep />
      <OrbitControls enablePan={false} maxPolarAngle={1.2} minDistance={60} maxDistance={260} autoRotate autoRotateSpeed={0.25} />
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.6} mipmapBlur />
      </EffectComposer>
    </Canvas>
  )
}
