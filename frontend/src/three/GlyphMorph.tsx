/**
 * S4 字形演变（PRD §9.4）：字形图片 → 像素采样点集 → 三组点集数量对齐 → 着色器在两组坐标间插值。
 * 每段 1.5 秒，可暂停、逐帧。研究员上传了透明底 PNG 时采样图片，否则采样字体渲染的占位字形。
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export interface GlyphSource {
  script: string
  image?: string
}
export interface MorphHandle {
  toggle: () => void
  step: (d: number) => void
}

const N = 6000 // 每字粒子数（≤ 2 万）
const SCRIPT_FONT: Record<string, string> = { 金文: '900', 石鼓文: '700', 小篆: '300' }

async function sample(char: string, src: GlyphSource): Promise<Float32Array> {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  if (src.image) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = `/api/files/${src.image}`
    await img.decode().catch(() => null)
    const k = Math.min(S / img.width, S / img.height) * 0.9
    ctx.drawImage(img, (S - img.width * k) / 2, (S - img.height * k) / 2, img.width * k, img.height * k)
  } else {
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.save()
    ctx.translate(S / 2, S / 2)
    if (src.script === '小篆') ctx.scale(0.8, 1.08)
    if (src.script === '金文') ctx.rotate(-0.05)
    ctx.font = `${SCRIPT_FONT[src.script] || '700'} ${S * 0.82}px "Noto Serif SC", "SimSun", serif`
    ctx.fillText(char, 0, 8)
    ctx.restore()
  }
  const data = ctx.getImageData(0, 0, S, S).data
  const pts: number[] = []
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) if (data[(y * S + x) * 4 + 3] > 120) pts.push(x, y)
  const out = new Float32Array(N * 3)
  const m = pts.length / 2 || 1
  for (let i = 0; i < N; i++) {
    // 数量对齐：多的随机抽取（合并），少的复制并加微小抖动
    const j = i < m ? Math.floor((i / N) * m) : Math.floor(Math.random() * m)
    const jitter = i >= m ? 0.6 : 0
    out[i * 3] = ((pts[j * 2] ?? S / 2) - S / 2) / 80 + (Math.random() - 0.5) * 0.02 * (1 + jitter)
    out[i * 3 + 1] = -((pts[j * 2 + 1] ?? S / 2) - S / 2) / 80 + (Math.random() - 0.5) * 0.02 * (1 + jitter)
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.12
  }
  return out
}

const vert = /* glsl */ `
  attribute vec3 posB;
  attribute float seed;
  uniform float uT;
  uniform float uTime;
  varying float vSeed;
  void main() {
    float t = smoothstep(0.0, 1.0, clamp(uT * 1.25 - seed * 0.25, 0.0, 1.0));
    vec3 p = mix(position, posB, t);
    // 过渡中段向外扩散，形成“流动重组”
    float swirl = sin(t * 3.14159);
    p.xy += swirl * 0.35 * vec2(sin(seed * 40.0 + uTime), cos(seed * 37.0 + uTime));
    p.z += swirl * (seed - 0.5) * 1.2;
    vSeed = seed;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (2.2 + seed * 1.6) * (6.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`
const frag = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    vec3 col = mix(uColA, uColB, vSeed);
    gl_FragColor = vec4(col, (1.0 - d * 2.0) * 0.95);
  }`

function Particles({ sets, seg, progress }: { sets: Float32Array[]; seg: number; progress: React.MutableRefObject<number> }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    g.setAttribute('posB', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    const seeds = new Float32Array(N)
    for (let i = 0; i < N; i++) seeds[i] = Math.random()
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 1))
    return g
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: 0 }, uTime: { value: 0 }, uColA: { value: new THREE.Color('#6fb3a0') }, uColB: { value: new THREE.Color('#e2c88e') } },
      }),
    [],
  )
  useEffect(() => {
    if (sets.length < 2) return
    const a = sets[seg % sets.length]
    const b = sets[(seg + 1) % sets.length]
    ;(geo.attributes.position as THREE.BufferAttribute).copyArray(a).needsUpdate = true
    ;(geo.attributes.posB as THREE.BufferAttribute).copyArray(b).needsUpdate = true
  }, [sets, seg, geo])
  useFrame(({ clock }) => {
    mat.uniforms.uT.value = progress.current
    mat.uniforms.uTime.value = clock.elapsedTime * 0.5
  })
  return <points geometry={geo} material={mat} />
}

function Driver({ playing, onTick }: { playing: boolean; onTick: (dt: number) => void }) {
  useFrame((_, dt) => playing && onTick(Math.min(dt, 0.05)))
  return null
}

const GlyphMorph = forwardRef<MorphHandle, { char: string; sources: GlyphSource[]; height?: number; onStage?: (label: string) => void }>(
  function GlyphMorph({ char, sources, height = 320, onStage }, ref) {
    const [sets, setSets] = useState<Float32Array[]>([])
    const [seg, setSeg] = useState(0)
    const [playing, setPlaying] = useState(true)
    const progress = useRef(0)
    const hold = useRef(0)

    useEffect(() => {
      let alive = true
      Promise.all(sources.map((s) => sample(char, s))).then((r) => alive && setSets(r))
      progress.current = 0
      setSeg(0)
      return () => {
        alive = false
      }
    }, [char, sources])

    useEffect(() => {
      if (!sources.length) return
      const from = sources[seg % sources.length].script
      const to = sources[(seg + 1) % sources.length].script
      onStage?.(`${from} → ${to}`)
    }, [seg, sources, onStage])

    useImperativeHandle(ref, () => ({
      toggle: () => setPlaying((p) => !p),
      step: (d: number) => {
        setPlaying(false)
        progress.current = Math.min(1, Math.max(0, progress.current + d))
        if (progress.current >= 1) {
          progress.current = 0
          setSeg((s) => s + 1)
        }
      },
    }))

    const tick = (dt: number) => {
      if (progress.current >= 1) {
        hold.current += dt
        if (hold.current > 0.9) {
          hold.current = 0
          progress.current = 0
          setSeg((s) => s + 1)
        }
        return
      }
      progress.current = Math.min(1, progress.current + dt / 1.5) // 每段 1.5 秒
    }

    return (
      <div style={{ height, position: 'relative' }}>
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 1.75]} gl={{ alpha: true }}>
          <Driver playing={playing} onTick={tick} />
          {sets.length >= 2 && <Particles sets={sets} seg={seg} progress={progress} />}
        </Canvas>
      </div>
    )
  },
)
export default GlyphMorph
