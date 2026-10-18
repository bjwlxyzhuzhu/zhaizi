import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Descriptions, Image, Skeleton } from 'antd'
import { ApartmentOutlined, ArrowLeftOutlined, MessageOutlined } from '@ant-design/icons'
import { api } from '../../api'
import { Grade, GRADE_TEXT, PageHead, imgUrl } from '../../components/ui'

export default function VesselDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data: v, isLoading, error } = useQuery({ queryKey: ['vessel', id], queryFn: () => api.get(`/lib/vessels/${id}`) })
  if (isLoading) return <div className="page"><Skeleton active /></div>
  if (error || !v) return <div className="page"><div className="empty">条目不存在或无权查看</div></div>
  const chars = Array.from(new Set((v.inscriptions[0]?.transcription || '').split('').filter((c: string) => /[一-鿿]/.test(c)))).slice(0, 40) as string[]
  return (
    <div className="page">
      <a onClick={() => nav(-1)}><ArrowLeftOutlined /> 返回</a>
      <PageHead
        cap={`VESSEL · ${v.category}`}
        title={v.name}
        desc={`${v.period} · ${v.find_place}出土 · 现藏${v.collection}`}
        extra={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button icon={<ApartmentOutlined />} disabled={!v.kg_node_id} onClick={() => nav(`/graph?focus=${v.kg_node_id}`)}>在图谱中查看</Button>
            <Button type="primary" icon={<MessageOutlined />} onClick={() => nav(`/qa?q=${encodeURIComponent(v.name + '铭文记载了什么？')}`)}>就此器提问</Button>
          </div>
        }
      />
      <div className="grid" style={{ gridTemplateColumns: '420px minmax(0,1fr)', alignItems: 'start' }}>
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="vessel-card" style={{ border: 0, cursor: 'default' }}>
            <div className="img" style={{ height: 340, backgroundImage: v.image ? `url(${imgUrl(v.image)})` : undefined }}>
              {!v.image && <div className="vessel-ph" style={{ fontSize: 120 }}>{v.name.slice(0, 1)}</div>}
            </div>
          </div>
          <div style={{ padding: 22 }}>
            <Descriptions column={1} size="small" items={[
              { label: '类别', children: v.category }, { label: '时代', children: v.period },
              { label: '出土', children: `${v.find_place}${v.find_date ? '，' + v.find_date : ''}` },
              { label: '现藏', children: v.collection }, { label: '著录', children: v.catalog_refs },
              { label: '证据等级', children: <span><Grade g={v.evidence_grade} /> {GRADE_TEXT[v.evidence_grade]}</span> },
              { label: '数据分级', children: v.level }, { label: '来源', children: <span className="note">{v.source}</span> },
            ]} />
            {v.gallery?.length > 0 && (
              <Image.PreviewGroup>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 14 }}>
                  {v.gallery.map((g: any) => (
                    <div key={g.url} style={{ textAlign: 'center' }}>
                      <Image src={imgUrl(g.url)} alt={g.caption} height={96} style={{ objectFit: 'contain', background: '#101614', borderRadius: 8, width: '100%' }} />
                      <div className="note">{g.caption.split('·').pop()}</div>
                    </div>
                  ))}
                </div>
              </Image.PreviewGroup>
            )}
            {v.image_credit && <div className="note" style={{ marginTop: 10 }}>图片：{v.image_credit}</div>}
          </div>
        </div>
        <div className="grid">
          <div className="panel">
            <div className="panel-head"><span className="panel-title">器物简介</span></div>
            <div style={{ lineHeight: 2, fontSize: 15 }}>{v.description}</div>
          </div>
          {v.inscriptions.map((i: any) => (
            <div className="panel" key={i.id}>
              <div className="panel-head">
                <span className="panel-title">铭文释文</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Grade g={i.evidence_grade} /><span className="note">{i.char_count} 字 · {i.source}</span></span>
              </div>
              <div className="serif" style={{ fontSize: 19, lineHeight: 2.1, letterSpacing: 1 }}>{i.transcription}</div>
              {i.interpretation && (
                <>
                  <div className="serif" style={{ fontSize: 16, margin: '18px 0 6px' }}>通读</div>
                  <div style={{ lineHeight: 2 }}>{i.interpretation}</div>
                </>
              )}
              <div className="serif" style={{ fontSize: 16, margin: '18px 0 10px' }}>字形切图入口</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {chars.map((c) => (
                  <span key={c} className="chip" style={{ padding: '4px 12px', fontFamily: 'var(--serif)', fontSize: 16 }} onClick={() => nav(`/library/characters/${encodeURIComponent(c)}`)}>{c}</span>
                ))}
              </div>
            </div>
          ))}
          {v.texts.length > 0 && (
            <div className="panel">
              <div className="panel-head"><span className="panel-title">传世文献对读</span><a onClick={() => nav('/library/texts')}>全部文献 →</a></div>
              {v.texts.map((t: any) => (
                <div key={t.id} className="row-line" style={{ alignItems: 'flex-start' }}>
                  <span className="serif" style={{ minWidth: 140 }}>《{t.title}·{t.chapter}》</span>
                  <span style={{ flex: 1, lineHeight: 1.9 }}>{t.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
