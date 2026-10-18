import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Input, Select } from 'antd'
import { api } from '../../api'
import { PageHead } from '../../components/ui'

/** 传世文献 + 出土文献并排对读（LIB-4） */
export default function Texts() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [vid, setVid] = useState<number | null>(null)
  const { data: texts = [] } = useQuery({ queryKey: ['texts', q], queryFn: () => api.get(`/lib/texts?q=${encodeURIComponent(q)}`) })
  const { data: vessels = [] } = useQuery({ queryKey: ['vessels', ''], queryFn: () => api.get('/lib/vessels') })
  const current = vid ?? texts.find((t: any) => t.related_vessel_id)?.related_vessel_id ?? null
  const { data: v } = useQuery({ queryKey: ['vessel', String(current)], queryFn: () => api.get(`/lib/vessels/${current}`), enabled: !!current })
  const related = texts.filter((t: any) => t.related_vessel_id === current)
  const others = texts.filter((t: any) => t.related_vessel_id !== current)
  return (
    <div className="page">
      <PageHead title="传世文献对读" desc="出土文献与传世文献段落并排显示；文献文本为公有领域通行本。" />
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <Select size="large" style={{ width: 240 }} value={current ?? undefined} placeholder="选择器物" onChange={setVid}
          options={vessels.map((x: any) => ({ value: x.id, label: x.name }))} />
        <Input.Search size="large" placeholder="检索文献篇名或内容" allowClear onSearch={setQ} style={{ maxWidth: 420 }} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-head"><span className="panel-title">出土文献 · {v?.name || '—'}</span>{v && <a onClick={() => nav(`/library/vessels/${v.id}`)}>器物详情 ↗</a>}</div>
          {v?.inscriptions?.map((i: any) => (
            <div key={i.id}>
              <div className="serif" style={{ fontSize: 19, lineHeight: 2.1 }}>{i.transcription}</div>
              <div className="note" style={{ marginTop: 8 }}>{i.source}</div>
            </div>
          ))}
          {!v && <div className="empty">请选择器物</div>}
        </div>
        <div className="panel">
          <div className="panel-head"><span className="panel-title">传世文献</span><span className="panel-cap">TRANSMITTED TEXTS</span></div>
          {related.length === 0 && <div className="note">该器物暂无关联文献段落。</div>}
          {related.map((t: any) => (
            <div key={t.id} style={{ marginBottom: 20 }}>
              <div className="serif" style={{ fontSize: 17, color: '#8a6a2b' }}>《{t.title}·{t.chapter}》</div>
              <div className="serif" style={{ fontSize: 18, lineHeight: 2 }}>{t.content}</div>
            </div>
          ))}
          {others.length > 0 && (
            <>
              <div className="note" style={{ margin: '16px 0 8px' }}>其他文献</div>
              {others.map((t: any) => (
                <div key={t.id} className="row-line" style={{ alignItems: 'flex-start' }}>
                  <span className="serif" style={{ minWidth: 130 }}>《{t.title}·{t.chapter}》</span>
                  <span style={{ flex: 1, lineHeight: 1.8 }}>{t.content}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
