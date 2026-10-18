/**
 * S1a 登录页主视觉（PRD §9.3、§11.2.3）
 * - 中层：何尊“照片深度粒子”。由何尊正面抠图（透明底）逐像素采样：位置取像素坐标，
 *   Z 取“按每行轮廓估计的旋转体深度 + 亮度浮雕”，颜色取原图；左右摆动 ±25°（单张照片不做 360°）。
 *   照片加载失败时退回程序生成的通用尊形（§11.2.5）。
 * - 上层：金文粒子，开场约 2 秒聚合成“宅兹中国”，停留后散成环绕器身的星尘。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { prefersReducedMotion } from '../store'

// 何尊轮廓（高度 0→1 对应半径），喇叭口、收颈、鼓腹、圈足
const PROFILE: [number, number][] = [
  [0.0, 0.40], [0.05, 0.41], [0.12, 0.38], [0.2, 0.31], [0.28, 0.33], [0.36, 0.40], [0.44, 0.41],
  [0.52, 0.36], [0.6, 0.29], [0.68, 0.31], [0.78, 0.39], [0.88, 0.5], [0.96, 0.6], [1.0, 0.63],
]
function radiusAt(h: number) {
  for (let i = 1; i < PROFILE.length; i++) {
    const [h1, r1] = PROFILE[i]
    const [h0, r0] = PROFILE[i - 1]
    if (h <= h1) {
      const t = (h - h0) / (h1 - h0)
      return r0 + (r1 - r0) * (t * t * (3 - 2 * t))
    }
  }
  return PROFILE[PROFILE.length - 1][1]
}

function buildVessel(count: number) {
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const bronze = new THREE.Color('#2f7d68')
  const patina = new THREE.Color('#6fb3a0')
  const gold = new THREE.Color('#e2c88e')
  const H = 1.9 // 何尊高 38.8cm、口径约 28.6cm，按比例取高
  const c = new THREE.Color()
  for (let i = 0; i < count; i++) {
    let h = Math.random()
    let a = Math.random() * Math.PI * 2
    let r = radiusAt(h)
    const flange = i % 9 === 0 // 约 11% 的点构成四道扉棱
    if (flange) {
      a = (Math.floor(Math.random() * 4) * Math.PI) / 2 + Math.PI / 4 + (Math.random() - 0.5) * 0.04
      const notch = Math.sin(h * 70) > 0.2 ? 1 : 0.55 // 扉棱的锯齿
      r += Math.random() * 0.09 * notch
    } else {
      r += (Math.random() - 0.5) * 0.012
    }
    // 腹部与颈部的纹饰带：用角度与高度的周期函数模拟兽面纹的明暗
    const band = (h > 0.3 && h < 0.5) || (h > 0.62 && h < 0.74)
    const motif = band ? 0.5 + 0.5 * Math.sin(a * 16) * Math.cos(h * 90) : 0
    r *= 1.12
    pos[i * 3] = Math.cos(a) * r
    pos[i * 3 + 1] = h * H - H / 2
    pos[i * 3 + 2] = Math.sin(a) * r
    c.copy(bronze).lerp(patina, Math.random() * 0.5).lerp(gold, Math.min(1, h * 0.55 + motif * 0.6 + (flange ? 0.35 : 0)))
    const lum = 0.22 + Math.random() * 0.26 // 叠加混合下保持青铜色而不过曝
    col[i * 3] = c.r * lum
    col[i * 3 + 1] = c.g * lum
    col[i * 3 + 2] = c.b * lum
  }
  return { pos, col }
}

function sampleText(text: string, step = 3) {
  const cv = document.createElement('canvas')
  cv.width = 1024
  cv.height = 260
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.font = `900 200px "Noto Serif SC", "SimSun", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 512, 135)
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data
  const pts: number[] = []
  for (let y = 0; y < cv.height; y += step) {
    for (let x = 0; x < cv.width; x += step) {
      if (data[(y * cv.width + x) * 4 + 3] > 140) pts.push((x - 512) / 230, -(y - 130) / 230)
    }
  }
  return pts
}

/** 照片深度采样（PRD §11.2.2 步骤 2–3 的浏览器端简化实现） */
async function samplePhoto(url: string, maxPoints: number) {
  const img = new Image()
  img.src = url
  await img.decode()
  const W = 460
  const H = Math.round((img.height / img.width) * W)
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, W, H)
  const d = ctx.getImageData(0, 0, W, H).data
  const pos: number[] = []
  const col: number[] = []
  const scale = 2.5 / H // 世界高度 2.5
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1
    for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 60) { if (l < 0) l = x; r = x }
    if (l < 0) continue
    const cx = (l + r) / 2
    const hw = Math.max((r - l) / 2, 1)
    for (let x = l; x <= r; x++) {
      const i = (y * W + x) * 4
      if (d[i + 3] < 60) continue
      const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255
      const u = Math.min(Math.abs(x - cx) / hw, 1)
      const z = Math.sqrt(1 - u * u) * hw * 0.82 + lum * 9 // 旋转体深度 + 纹饰浮雕
      const jitter = () => (Math.random() - 0.5) * 0.6
      pos.push((x - W / 2 + jitter()) * scale, (H / 2 - y + jitter()) * scale, z * scale)
      const b = 1.15 + lum * 0.4
      col.push(Math.min(1, (d[i] / 255) * b), Math.min(1, (d[i + 1] / 255) * b), Math.min(1, (d[i + 2] / 255) * b))
      // 背面薄层，摆动时不至于“纸片”感
      if (Math.random() < 0.25) {
        pos.push((x - W / 2) * scale, (H / 2 - y) * scale, -z * scale * 0.9)
        col.push((d[i] / 255) * 0.45, (d[i + 1] / 255) * 0.45, (d[i + 2] / 255) * 0.45)
      }
    }
  }
  const n = pos.length / 3
  const keep = Math.min(1, maxPoints / n)
  const P: number[] = []
  const C: number[] = []
  for (let i = 0; i < n; i++) if (Math.random() < keep) { P.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); C.push(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]) }
  return { pos: new Float32Array(P), col: new Float32Array(C) }
}

function Vessel({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null)
  const fallback = useMemo(() => buildVessel(count), [count])
  const [photo, setPhoto] = useState<{ pos: Float32Array; col: Float32Array } | null>(null)
  useEffect(() => {
    let alive = true
    samplePhoto('/img/vessels/hezun_front.png', Math.min(count * 2, 160000)).then((r) => alive && setPhoto(r)).catch((e) => console.warn('何尊照片粒子加载失败，使用程序生成器形', e))
    return () => {
      alive = false
    }
  }, [count])
  const { pos, col } = photo || fallback
  const still = prefersReducedMotion()
  useFrame(({ clock, pointer }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    // ±25° 摆动 + 鼠标轻微视差
    ref.current.rotation.y = (still ? 0 : Math.sin(t * 0.35) * 0.436) + pointer.x * 0.15
    ref.current.rotation.x = -0.06 + pointer.y * 0.05
    // 开场：文字聚合时器身保持暗淡，文字散开后器身显现
    const k = still ? 1 : Math.min(Math.max((t - 4.6) / 2.4, 0), 1)
    ;(ref.current.material as THREE.PointsMaterial).opacity = 0.1 + 0.85 * (1 - Math.pow(1 - k, 3))
  })
  return (
    <points ref={ref} key={photo ? 'photo' : 'proc'} position={photo ? [0, -0.1, 0] : [0, -0.35, 0]} scale={photo ? 1 : 1.25}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[col, 3]} />
      </bufferGeometry>
      <pointsMaterial size={photo ? 0.013 : 0.016} vertexColors transparent opacity={0.9} depthWrite={false}
        blending={photo ? THREE.NormalBlending : THREE.AdditiveBlending} sizeAttenuation />
    </points>
  )
}

function GlyphParticles() {
  const ref = useRef<THREE.Points>(null)
  const state = useMemo(() => {
    const target = sampleText('宅兹中国')
    const n = target.length / 2
    const start = new Float32Array(n * 3)
    const goal = new Float32Array(n * 3)
    const orbit = new Float32Array(n * 3) // 半径、角度、高度
    const cur = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const rr = 4 + Math.random() * 3
      start.set([Math.cos(a) * rr, (Math.random() - 0.5) * 5, Math.sin(a) * rr - 1], i * 3)
      goal.set([target[i * 2] * 0.52, target[i * 2 + 1] * 0.52 + 0.05, 1.6], i * 3)
      orbit.set([1.0 + Math.random() * 1.1, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 2.6], i * 3)
    }
    cur.set(start)
    return { n, start, goal, orbit, cur }
  }, [])
  const still = prefersReducedMotion()
  useFrame(({ clock }) => {
    const pts = ref.current
    if (!pts) return
    const t = still ? 3 : clock.elapsedTime
    const { n, start, goal, orbit, cur } = state
    const ease = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3)
    const gather = ease(t / 2.2) // 0–2.2s 聚合
    const scatter = ease((t - 5.2) / 2.5) // 停留后 5.2s 起散开
    for (let i = 0; i < n; i++) {
      const k = i * 3
      const gx = start[k] + (goal[k] - start[k]) * gather
      const gy = start[k + 1] + (goal[k + 1] - start[k + 1]) * gather
      const gz = start[k + 2] + (goal[k + 2] - start[k + 2]) * gather
      const ang = orbit[k + 1] + t * 0.12 * (1 + (i % 7) * 0.05)
      const ox = Math.cos(ang) * orbit[k]
      const oy = orbit[k + 2] - 0.2
      const oz = Math.sin(ang) * orbit[k]
      cur[k] = gx + (ox - gx) * scatter
      cur[k + 1] = gy + (oy - gy) * scatter
      cur[k + 2] = gz + (oz - gz) * scatter
    }
    ;(pts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(pts.material as THREE.PointsMaterial).opacity = 0.9 - scatter * 0.45
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[state.cur, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.017} color="#ffe3a6" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

function Rig() {
  const { camera } = useThree()
  useEffect(() => {
    camera.lookAt(0, 0, 0)
  }, [camera])
  return null
}

export default function LoginScene({ low = false }: { low?: boolean }) {
  return (
    <Canvas camera={{ position: [0, 0.2, 5.2], fov: 42 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }}>
      <Rig />
      <Vessel count={low ? 40000 : 120000} />
      <GlyphParticles />
    </Canvas>
  )
}
