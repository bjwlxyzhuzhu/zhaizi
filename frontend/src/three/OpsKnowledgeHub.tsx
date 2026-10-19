import { Component, memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import * as THREE from 'three'

export interface AssetNode { name: string; value: number; color: string; path: string }
interface Props { nodes: AssetNode[]; playing: boolean; activeName: string | null; onPick: (path: string) => void; onHover: (name: string | null) => void }

function Fallback() {
  return <div className="ops-hub-fallback" role="status"><span /><span /><small>三维视图暂不可用 · 可通过两侧资料入口继续访问</small></div>
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <Fallback /> : this.props.children }
}

function Network({ nodes, playing, activeName, onPick, onHover }: Props) {
  const time = useRef(0)
  const rings = useRef<THREE.Group>(null)
  const packets = useRef<THREE.Group>(null)
  const scanner = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const selected = hovered || activeName
  useCursor(hovered !== null)
  useEffect(() => () => onHover(null), [onHover])
  const max = Math.max(1, ...nodes.map(n => n.value))
  const stations = useMemo(() => nodes.map((n, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / nodes.length
    const height = .16 + Math.sqrt(n.value / max) * .9
    const x = Math.cos(angle) * 3.05, z = Math.sin(angle) * 2.45
    return { ...n, x, z, height, curve: new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, height + .2, z), new THREE.Vector3(x * .42, 1.6, z * .42), new THREE.Vector3(0, .5, 0)) }
  }), [nodes, max])
  const routes = useMemo(() => stations.filter(n => n.value > 0).flatMap(n => [0, 1, 2].map(offset => ({ curve: n.curve, color: n.color, offset }))), [stations])
  useFrame((_, delta) => {
    if (!playing) return
    time.current += Math.min(delta, .05)
    const t = time.current
    if (rings.current) rings.current.rotation.y = t * .14
    if (scanner.current) scanner.current.rotation.z = -t * .32
    packets.current?.children.forEach((mesh, i) => {
      routes[i].curve.getPoint((t * .21 + routes[i].offset / 3) % 1, mesh.position)
      mesh.scale.setScalar(.8 + Math.sin(t * 2 + i) * .18)
    })
  })
  return <>
    <ambientLight intensity={1.2} />
    <directionalLight position={[3, 6, 5]} color="#ffe2a6" intensity={3} />
    <directionalLight position={[-4, 3, -2]} color="#92d9bd" intensity={2} />
    <group position={[0, -.15, 0]}>
      <mesh position={[0, -.15, 0]}>
        <cylinderGeometry args={[3.7, 3.9, .12, 96]} />
        <meshStandardMaterial color="#142e24" metalness={.6} roughness={.6} transparent opacity={.65} />
      </mesh>
      {[1.3, 2.15, 3.65].map((radius, i) => <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]} position={[0, -.07 + i * .01, 0]}>
        <torusGeometry args={[radius, .014, 6, 128]} /><meshBasicMaterial color={i === 1 ? '#4c8b72' : '#a68c4e'} transparent opacity={.6} />
      </mesh>)}
      {Array.from({ length: 48 }, (_, i) => {
        const a = i / 48 * Math.PI * 2
        return <mesh key={i} position={[Math.cos(a) * 3.5, -.02, Math.sin(a) * 3.5]} rotation={[0, -a, 0]}>
          <boxGeometry args={[i % 4 ? .06 : .16, .018, .025]} /><meshBasicMaterial color={i % 4 ? '#426b53' : '#b8a16c'} />
        </mesh>
      })}
      <group ref={rings} position={[0, .48, 0]}>
        {[0, 1, 2].map(i => <mesh key={i} rotation={[Math.PI / 2 + i * .27, i * .6, i * .35]}>
          <torusGeometry args={[1.08 + i * .15, .025, 8, 100, Math.PI * 1.66]} />
          <meshStandardMaterial color={i % 2 ? '#71b69a' : '#c8aa69'} emissive={i % 2 ? '#245343' : '#503c17'} emissiveIntensity={.6} metalness={.7} roughness={.3} />
        </mesh>)}
      </group>
      <mesh ref={scanner} rotation={[-Math.PI / 2, 0, 0]} position={[0, .015, 0]}>
        <ringGeometry args={[3.34, 3.38, 72, 1, 0, Math.PI * .8]} /><meshBasicMaterial color="#b9dec0" transparent opacity={.65} side={THREE.DoubleSide} />
      </mesh>
      {stations.map(n => <group key={n.name} onClick={e => { e.stopPropagation(); onPick(n.path) }}
        onPointerOver={e => { e.stopPropagation(); setHovered(n.name); onHover(n.name) }}
        onPointerOut={() => { setHovered(null); onHover(null) }}>
        <mesh position={[n.x, .01, n.z]}>
          <cylinderGeometry args={[.42, .48, .12, 6]} /><meshStandardMaterial color="#274539" metalness={.7} roughness={.4} />
        </mesh>
        <mesh position={[n.x, n.height / 2 + .1, n.z]}>
          <cylinderGeometry args={[.16, .23, n.height, 6]} /><meshStandardMaterial color={n.color} emissive={n.color} emissiveIntensity={selected === n.name ? .65 : .18} metalness={.45} roughness={.3} />
        </mesh>
        <mesh position={[n.x, n.height + .18, n.z]}>
          <octahedronGeometry args={[selected === n.name ? .22 : .16]} /><meshBasicMaterial color={n.color} />
        </mesh>
        <mesh position={[n.x, .08, n.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[.5, .52, 40]} /><meshBasicMaterial color={n.color} transparent opacity={selected === n.name ? 1 : .55} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[n.x, .6, n.z]}>
          <cylinderGeometry args={[.46, .46, 1.5, 12]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh>
          <tubeGeometry args={[n.curve, 40, .009, 5, false]} /><meshBasicMaterial color={n.color} transparent opacity={.36} />
        </mesh>
      </group>)}
      <group ref={packets}>{routes.map((r, i) => <mesh key={i} position={r.curve.getPoint(r.offset / 3)}>
        <sphereGeometry args={[.047, 8, 6]} /><meshBasicMaterial color={r.color} />
      </mesh>)}</group>
    </group>
  </>
}

function OpsKnowledgeHub(props: Props) {
  const [available, setAvailable] = useState(true)
  if (!available) return <Fallback />
  return <SceneBoundary><Canvas orthographic camera={{ position: [0, 6.5, 9], zoom: 33, near: .1, far: 60 }} dpr={[1, 1.5]}
    frameloop={props.playing ? 'always' : 'demand'} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }} fallback={<Fallback />}
    onCreated={({ camera, gl }) => { camera.lookAt(0, .1, 0); gl.domElement.addEventListener('webglcontextlost', () => setAvailable(false), { once: true }) }}>
    <Network {...props} />
  </Canvas></SceneBoundary>
}

export default memo(OpsKnowledgeHub)
