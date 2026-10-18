import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Drawer, Skeleton, Tag } from 'antd'
import { api } from '../api'
import { useAuth } from '../store'

export function Grade({ g }: { g?: string }) {
  if (!g) return null
  return (
    <span className={`grade grade-${g}`} title={GRADE_TEXT[g]}>
      {g}
      {g === 'D' ? ' 推测' : ''}
    </span>
  )
}

export const GRADE_TEXT: Record<string, string> = {
  A: '原器或拓片',
  B: '权威著录释文',
  C: '辅助资料或学界异说',
  D: '模型推测，未经核验',
}

export const STATUS: Record<string, { t: string; c: string }> = {
  pending: { t: '待审', c: 'gold' },
  approved: { t: '已审核', c: 'green' },
  rejected: { t: '已驳回', c: 'red' },
}
export const StatusTag = ({ s }: { s: string }) => <Tag color={STATUS[s]?.c}>{STATUS[s]?.t || s}</Tag>

export function PageHead({ cap = 'ZHAI ZI / RESEARCH SPACE', title, desc, extra }: { cap?: string; title: string; desc?: string; extra?: React.ReactNode }) {
  return (
    <div className="page-head rise">
      <div>
        <div className="eyebrow">{cap}</div>
        <h1 className="page-title">{title}</h1>
        {desc && <div className="page-desc">{desc}</div>}
      </div>
      {extra}
    </div>
  )
}

/** 种子图片为 /img/... 静态路径；研究员上传的图片存为 res/xxx，经 /api/files 访问 */
export const imgUrl = (p?: string) => (!p ? '' : p.startsWith('/') || p.startsWith('http') ? p : `/api/files/${p}`)

export function VesselImg({ image, name, height = 190 }: { image?: string; name: string; height?: number }) {
  return (
    <div className="img" style={{ height, backgroundImage: image ? `url(${imgUrl(image)})` : undefined }}>
      {!image && <div className="vessel-ph">{name.slice(0, 1)}</div>}
    </div>
  )
}

const SCRIPT_STYLE: Record<string, React.CSSProperties> = {
  金文: { fontWeight: 900, filter: 'url(#rough)', letterSpacing: 0 },
  石鼓文: { fontWeight: 600, transform: 'scaleY(1.08)' },
  小篆: { fontWeight: 400, transform: 'scaleX(0.82)' },
}

/** 字形：有研究员上传的切图则显示切图；否则用字体渲染占位并明确标注 */
export function GlyphView({ char, script, image, size = 150, color = 'currentColor' }: { char: string; script: string; image?: string; size?: number; color?: string }) {
  if (image) return <img src={`/api/files/${image}`} alt={`${char}·${script}`} style={{ height: size, objectFit: 'contain' }} />
  return (
    <div style={{ fontFamily: 'var(--serif)', fontSize: size * 0.82, lineHeight: 1, color, ...SCRIPT_STYLE[script] }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <filter id="rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" />
        </filter>
      </svg>
      {char}
    </div>
  )
}

/** 证据抽屉：点击引用角标后在右侧展示条目详情（QA-6） */
export function EvidenceDrawer({ cid, onClose }: { cid: string | null; onClose: () => void }) {
  const [d, setD] = useState<any>(null)
  const nav = useNavigate()
  useEffect(() => {
    setD(null)
    if (cid) api.get(`/qa/chunks/${cid}`).then(setD).catch(() => setD({ error: true }))
  }, [cid])
  const link = d && !d.error ? refLink(d.ref_table, d.ref_id, d.title) : null
  return (
    <Drawer open={!!cid} onClose={onClose} width={460} title={<span className="serif">证据条目 [{cid}]</span>}>
      {!d ? (
        <Skeleton active />
      ) : d.error ? (
        <div className="empty">条目不存在或无权查看</div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <Grade g={d.grade} />
            <span className="serif" style={{ fontSize: 20 }}>{d.title}</span>
          </div>
          <div className="note">证据等级：{GRADE_TEXT[d.grade]} · 数据分级 {d.level}</div>
          <div style={{ margin: '18px 0', lineHeight: 2, fontSize: 15, whiteSpace: 'pre-wrap' }}>{d.text}</div>
          {link && (
            <Button type="primary" onClick={() => { onClose(); nav(link) }}>
              在资料库中查看
            </Button>
          )}
        </div>
      )}
    </Drawer>
  )
}

export function refLink(table: string, id: number, title = ''): string | null {
  if (table === 'vessels') return `/library/vessels/${id}`
  if (table === 'glyphs') {
    const m = title.match(/字形·(.)/)
    return m ? `/library/characters/${encodeURIComponent(m[1])}` : '/library/characters'
  }
  if (table === 'dialect_entries') return '/library/dialects'
  if (table === 'texts') return '/library/texts'
  if (table === 'kg_nodes') return `/graph?focus=${id}`
  if (table === 'inscriptions') return null
  return null
}

/** 刷新顶部积分 */
export function refreshMe() {
  api.get('/auth/me').then((u) => useAuth.getState().setUser(u)).catch(() => {})
}
