/// <reference lib="webworker" />
// 力导向布局在 Web Worker 中计算（PRD §7.1），主线程只负责渲染
import { forceCenter, forceLink, forceManyBody, forceSimulation } from 'd3-force-3d'

let sim: any = null

self.onmessage = (e: MessageEvent) => {
  const { nodes, edges } = e.data as { nodes: any[]; edges: any[] }
  sim?.stop()
  const ns = nodes.map((n) => ({ ...n }))
  const ids = new Set(ns.map((n) => n.id))
  const ls = edges.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ source: l.source, target: l.target }))
  sim = forceSimulation(ns, 3)
    .force('charge', forceManyBody().strength((d: any) => -18 - Math.min(d.degree || 1, 40) * 2.2).distanceMax(260))
    .force('link', forceLink(ls).id((d: any) => d.id).distance(22).strength(0.55))
    .force('center', forceCenter(0, 0, 0))
    .alpha(nodes.some((n) => n.x !== undefined) ? 0.45 : 1)
    .alphaDecay(0.028)
    .stop()
  let ticks = 0
  const step = () => {
    for (let i = 0; i < 4; i++) sim.tick()
    ticks += 4
    const buf = new Float32Array(ns.length * 3)
    ns.forEach((n, i) => {
      buf[i * 3] = n.x
      buf[i * 3 + 1] = n.y
      buf[i * 3 + 2] = n.z
    })
    ;(self as any).postMessage({ ids: ns.map((n) => n.id), pos: buf, done: sim.alpha() < 0.02 }, [buf.buffer])
    if (sim.alpha() >= 0.02 && ticks < 600) setTimeout(step, 16)
  }
  step()
}
