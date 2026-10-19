import { RareText } from '../../components/RareText'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Radio, Spin, Table, Tag } from 'antd'
import { ApartmentOutlined } from '@ant-design/icons'
import { api } from '../../api'
import { GlyphView, PageHead } from '../../components/ui'
import type { MorphHandle } from '../../three/GlyphMorph'

const GlyphMorph = lazy(() => import('../../three/GlyphMorph'))

export default function Characters() {
  const { char: param } = useParams()
  const nav = useNavigate()
  const { data: list = [] } = useQuery({ queryKey: ['characters'], queryFn: () => api.get('/lib/characters') })
  const char = param || list[0]?.character || '宅'
  const { data } = useQuery({ queryKey: ['char', char], queryFn: () => api.get(`/lib/characters/${encodeURIComponent(char)}`) })
  const [mode, setMode] = useState<'play' | 'frame' | 'vessels'>('play')
  const [stage, setStage] = useState('')
  const morph = useRef<MorphHandle>(null)
  const sources = useMemo(() => (data?.glyphs || []).map((g: any) => ({ script: g.script, image: g.image_path })), [data])

  return (
    <div className="page">
      <PageHead
        title="字形谱系"
        desc="让字形在金文、石鼓文与小篆之间演变；保留各阶段对应的出处与器物信息。"
        extra={<span className="tag-gold">字头：<RareText>{char}</RareText></span>}
      />
      <div className="panel" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 30, alignItems: 'center', padding: '30px 40px' }}>
        <div className="serif" style={{ fontSize: 200, lineHeight: 1, color: '#2f6f5e', textAlign: 'center', fontWeight: 900 }}><RareText>{char}</RareText></div>
        <div>
          <div className="eyebrow">GLYPH GENEALOGY</div>
          <div className="serif" style={{ fontSize: 34, margin: '10px 0 12px' }}>从字形进入观念的历史</div>
          <div style={{ lineHeight: 1.9, marginBottom: 18 }}>
            对比不同书体中的构形特征，关联器铭、古音、释义与传世文献。未经研究员核对的形体，暂不用于字形演变展示。
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {list.map((c: any) => (
              <span key={c.character} className={`chip ${c.character === char ? 'on' : ''}`} style={{ fontFamily: 'var(--serif)', fontSize: 16 }}
                onClick={() => nav(`/library/characters/${encodeURIComponent(c.character)}`)}><RareText>{c.character}</RareText></span>
            ))}
          </div>
        </div>
      </div>

      {mode === 'play' && data?.complete ? (
        <div className="panel" style={{ marginTop: 20, background: 'radial-gradient(600px 300px at 50% 50%, #18302a, #0d1513)', borderColor: '#24302c' }}>
          <div className="panel-head">
            <span className="panel-title" style={{ color: '#e6e2d6' }}>粒子演变 · {stage}</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <Button size="small" onClick={() => morph.current?.toggle()}>暂停 / 继续</Button>
              <Button size="small" onClick={() => morph.current?.step(0.1)}>逐帧</Button>
            </span>
          </div>
          <Suspense fallback={<Spin />}>
            <GlyphMorph ref={morph} char={char} sources={sources} height={340} onStage={setStage} />
          </Suspense>
          <div className="note" style={{ textAlign: 'center', color: '#9aa39e' }}>每段 1.5 秒：金文 → 石鼓文 → 小篆；当前采样的是占位字形</div>
        </div>
      ) : mode === 'vessels' ? (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="panel-head"><span className="panel-title">相关器铭</span></div>
          <Table rowKey="id" pagination={false} dataSource={data?.vessels || []} onRow={(r: any) => ({ onClick: () => nav(`/library/vessels/${r.id}`), style: { cursor: 'pointer' } })}
            columns={[{ title: '器名', dataIndex: 'name', render: (value: string) => <RareText>{value}</RareText> }, { title: '时代', dataIndex: 'period' }, { title: '出土', dataIndex: 'find_place' }, { title: '现藏', dataIndex: 'collection' }]} />
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginTop: 20 }}>
          {['金文', '石鼓文', '小篆'].map((s, i) => {
            const g = data?.glyphs?.find((x: any) => x.script === s)
            return (
              <div className="panel" key={s}>
                <div className="panel-head">
                  <span className="panel-title"><span className="dim">0{i + 1}</span>　<RareText>{s}</RareText></span>
                  {g?.vessel_id ? <a onClick={() => nav(`/library/vessels/${g.vessel_id}`)}>查看出处 ↗</a> : <span className="note">{g?.source || '暂无'}</span>}
                </div>
                <div className="stat-card" style={{ height: 240, display: 'grid', placeItems: 'center', color: '#2f6f5e' }}>
                  {g ? <GlyphView char={char} script={s} image={g.image_path} size={170} /> : <span className="dim">暂无该书体字形</span>}
                </div>
                <div className="row-line" style={{ borderBottom: 0 }}>
                  <span>{s === '金文' ? '直接材料 · 原器/拓片' : '文字样式 · 对比条目'}</span>
                  <Tag color={g?.image_path ? 'green' : 'gold'}>{g?.image_path ? '已核对' : '占位·待核对'}</Tag>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0' }}>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
          <Radio value="play" disabled={!data?.complete}>播放粒子演变动画</Radio>
          <Radio value="frame">逐书体查看</Radio>
          <Radio value="vessels">查看相关器铭</Radio>
        </Radio.Group>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="panel">
          <div className="panel-head"><span className="panel-title">音</span><span className="panel-cap">READINGS · 方言今读仅作辅助证据</span></div>
          {(data?.readings || []).length === 0 && <div className="empty">暂无读音条目</div>}
          {(data?.readings || []).map((r: any, i: number) => (
            <div key={i} className="row-line"><span><Tag>{r.layer}</Tag><span className="mono">{r.value}</span></span><span className="note"><RareText>{r.source}</RareText></span></div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">关联</span>
            {data?.kg_node_id && <Button size="small" icon={<ApartmentOutlined />} onClick={() => nav(`/graph?focus=${data.kg_node_id}`)}>在图谱中查看</Button>}
          </div>
          <div className="note" style={{ marginBottom: 10 }}>含此字的已审核器铭：</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(data?.vessels || []).map((v: any) => <span key={v.id} className="chip" onClick={() => nav(`/library/vessels/${v.id}`)}><RareText>{v.name}</RareText></span>)}
            {(data?.vessels || []).length === 0 && <span className="note">暂无</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
