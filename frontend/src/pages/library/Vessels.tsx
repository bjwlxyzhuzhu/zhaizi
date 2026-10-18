import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Input, Select, Skeleton } from 'antd'
import { ArrowRightOutlined, BarsOutlined, AudioOutlined, ReadOutlined } from '@ant-design/icons'
import { api } from '../../api'
import { PageHead, VesselImg, Grade } from '../../components/ui'

export default function Vessels() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [period, setPeriod] = useState('')
  const [grade, setGrade] = useState('')
  const [place, setPlace] = useState('')
  const query = new URLSearchParams()
  const isChar = q.trim().length === 1
  if (q.trim()) query.set(isChar ? 'char' : 'q', q.trim())
  if (period) query.set('period', period)
  if (grade) query.set('grade', grade)
  if (place) query.set('place', place)
  const { data, isLoading } = useQuery({ queryKey: ['vessels', query.toString()], queryFn: () => api.get(`/lib/vessels?${query}`) })

  return (
    <div className="page">
      <PageHead title="器铭资料库" desc="以器为入口，联通铭文、字形、方言与传世文献；所有条目保留出处和审核状态。" />
      <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
        <Input.Search
          size="large"
          allowClear
          style={{ flex: 1, minWidth: 320 }}
          placeholder="搜索器名、时代、出土地、著录；输入单字则按铭文含字检索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onSearch={(v) => setParams(v ? { q: v } : {})}
        />
        <Select size="large" style={{ width: 150 }} value={period} onChange={setPeriod}
          options={[{ value: '', label: '时代 · 全部' }, { value: '西周早期', label: '西周早期' }, { value: '西周中期', label: '西周中期' }, { value: '西周晚期', label: '西周晚期' }, { value: '春秋', label: '春秋' }, { value: '先秦', label: '先秦秦国' }]} />
        <Select size="large" style={{ width: 150 }} value={place} onChange={setPlace}
          options={[{ value: '', label: '出土地 · 全部' }, ...['陈仓区', '眉县', '岐山县', '扶风县', '凤翔区'].map((d) => ({ value: d, label: d }))]} />
        <Select size="large" style={{ width: 150 }} value={grade} onChange={setGrade}
          options={[{ value: '', label: '证据等级 · 全部' }, { value: 'A', label: 'A 原器拓片' }, { value: 'B', label: 'B 权威著录' }, { value: 'C', label: 'C 学界异说' }]} />
        <span className="chip on" style={{ alignSelf: 'center' }}>已审核 ✓</span>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">{q ? `检索结果（${data?.length ?? 0}）` : '重点研究器物'}</span>
          <span className="note">点击器物查看铭文、图集、字形与传世文献对读</span>
        </div>
        {isLoading ? (
          <Skeleton active />
        ) : data?.length === 0 ? (
          <div className="empty">没有符合条件的已审核条目</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {data?.map((v: any) => (
              <div key={v.id} className="vessel-card rise" onClick={() => nav(`/library/vessels/${v.id}`)}>
                <VesselImg image={v.image} name={v.name} />
                <div className="meta">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="nm">{v.name}</span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Grade g={v.evidence_grade} /> <span className="dim">↗</span></span>
                  </div>
                  <div className="note">{v.period.split('（')[0]} · {v.category.split('（')[0]} · {v.district || '—'}</div>
                  <div className="note">现藏 {v.collection}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 20 }}>
        <div className="panel">
          <div className="panel-head"><span className="panel-title">跨库研究入口</span><span className="panel-cap">COLLECTIONS</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {[['字形谱系', <BarsOutlined />, '/library/characters'], ['关陇方言', <AudioOutlined />, '/library/dialects'], ['传世文献', <ReadOutlined />, '/library/texts']].map(([t, ic, to]) => (
              <div key={t as string} className="stat-card" style={{ cursor: 'pointer', padding: 20 }} onClick={() => nav(to as string)}>
                <div style={{ fontSize: 26, color: '#2f6f5e' }}>{ic}</div>
                <div style={{ marginTop: 8, fontSize: 16 }}>{t} <ArrowRightOutlined style={{ fontSize: 12 }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><span className="panel-title">资料可信度规则</span><span className="panel-cap">DATA PROVENANCE</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            {[['A', '原器与拓片'], ['B', '权威著录'], ['C', '学界异说']].map(([g, t]) => (
              <div key={g} className="stat-card" style={{ padding: 20 }}>
                <div className="serif" style={{ fontSize: 34, color: '#2f6f5e', fontWeight: 700 }}>{g}</div>
                <div className="note">{t}</div>
              </div>
            ))}
          </div>
          <div className="note" style={{ marginTop: 12 }}>D 级模型推测需醒目标注，不作为已核验结论。</div>
        </div>
      </div>
    </div>
  )
}
