import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { App, Button, Checkbox, Empty, Input, Tag } from 'antd'
import { api } from '../../api'
import { useAuth } from '../../store'
import { EvidenceDrawer, Grade, GRADE_TEXT, PageHead } from '../../components/ui'

const DECISIONS = [['adopt', '采纳'], ['revise', '修订'], ['reject', '否决']] as const

export default function Adjudications() {
  const user = useAuth((s) => s.user)!
  const readonly = user.role !== 'researcher'
  const { message } = App.useApp()
  const [status, setStatus] = useState<'pending' | 'done'>('pending')
  const { data = [], refetch } = useQuery({ queryKey: ['adj', status], queryFn: () => api.get(`/res/adjudications?status=${status}`) })
  const [cur, setCur] = useState<any>(null)
  const [decision, setDecision] = useState<string>('revise')
  const [revised, setRevised] = useState('')
  const [reason, setReason] = useState('')
  const [audit, setAudit] = useState(true)
  const [cite, setCite] = useState<string | null>(null)

  useEffect(() => {
    if (!data.length) return setCur(null)
    if (!cur || !data.find((d: any) => d.id === cur.id)) pick(data[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const pick = (a: any) => {
    setCur(a)
    setRevised(a.draft?.revised_text || a.revised_text || '')
    setReason(a.draft?.reason || a.reason || '')
    setDecision(a.decision || 'revise')
  }

  const submit = async (draft = false) => {
    try {
      await api.post(`/res/adjudications/${cur.id}`, { decision: draft ? 'draft' : decision, revised_text: revised, reason })
      message.success(draft ? '草稿已保存' : '裁断已提交，写入专家裁断库与审计记录')
      refetch()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const candChar = cur?.title.match(/“(.)”/)?.[1]

  return (
    <div className="page">
      <PageHead title="专家裁断工作台" desc="模型负责提供候选与可核查证据，研究员负责采纳、修订或否决；每一步均可追溯。"
        extra={<span className="tag-gold">{readonly ? '管理员 · 只读' : '研究员角色 · 审核权限'}</span>} />
      <div className="grid" style={{ gridTemplateColumns: '300px minmax(0,1fr) minmax(0,1.15fr)', alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-head"><span className="panel-title">待裁断队列</span><span className="panel-cap">REVIEW QUEUE</span></div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <span className={`chip ${status === 'pending' ? 'on' : ''}`} onClick={() => setStatus('pending')}>待处理</span>
            <span className={`chip ${status === 'done' ? 'on' : ''}`} onClick={() => setStatus('done')}>已裁断</span>
          </div>
          {data.length === 0 && <Empty description="队列为空" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          {data.map((a: any, i: number) => (
            <div key={a.id} onClick={() => pick(a)} style={{ padding: '14px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
              background: cur?.id === a.id ? 'rgba(47,111,94,.12)' : undefined, borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontWeight: 600 }}>卷宗 {String(i + 1).padStart(2, '0')} · {a.title}</div>
              <div className="note">
                {status === 'pending' ? `模型候选 · 待裁断 · 置信 ${a.confidence}%` : `${({ adopt: '采纳', revise: '修订', reject: '否决' } as any)[a.decision]} · ${a.researcher}`}
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">候选释读</span><span className="panel-cap">AI CANDIDATE</span></div>
          {!cur ? <div className="empty">请选择卷宗</div> : (
            <>
              <div style={{ height: 240, borderRadius: 12, overflow: 'hidden', background: '#101614', display: 'grid', placeItems: 'center', position: 'relative' }}>
                {cur.image_url ? <img src={cur.image_url} style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <span style={{ color: '#9aa39e' }}>本卷宗无拓片图像（文字问答送裁断）</span>}
                <span className="tag-gold" style={{ position: 'absolute', left: 12, bottom: 12, color: '#e2c88e' }}>AI 候选识别区域</span>
              </div>
              <div className="serif" style={{ fontSize: 19, margin: '20px 0 12px' }}>当前待核验内容</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="stat-card">
                  <div className="note">候选字</div>
                  <div className="serif" style={{ fontSize: 64, color: '#2f6f5e', fontWeight: 700 }}>{candChar || '—'}</div>
                </div>
                <div className="stat-card">
                  <div className="note">资料状态</div>
                  <div className="serif" style={{ fontSize: 22, color: '#2f6f5e', marginTop: 16 }}>{cur.status === 'pending' ? '需人工裁断' : '已裁断'}</div>
                  <div className="note">模型置信 {cur.confidence}%</div>
                </div>
              </div>
              {cur.question && cur.question !== '（种子示例）' && <div className="note" style={{ marginTop: 14 }}>原问题：{cur.question}</div>}
              <div style={{ marginTop: 12, lineHeight: 1.9, maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 14 }} className="stat-card">{cur.candidate}</div>
              <div style={{ marginTop: 14, lineHeight: 1.9 }}>研究员应核对拓片、著录与上下文，明确记录裁断依据；平台不得将模型候选直接升级为已审定结论。</div>
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">证据与裁断决策</span><span className="panel-cap">HUMAN-IN-THE-LOOP</span></div>
          {cur && (
            <>
              {(cur.evidence || []).length === 0 && <div className="note">无引用证据</div>}
              {(cur.evidence || []).map((e: any) => (
                <div key={e.cid} className="row-line" style={{ cursor: 'pointer' }} onClick={() => setCite(e.cid)}>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Grade g={e.grade} /><span><div>{e.title}</div><div className="note">{GRADE_TEXT[e.grade]}</div></span></span>
                  <span className="dim">查看 ↗</span>
                </div>
              ))}
              <div className="serif" style={{ fontSize: 19, margin: '22px 0 12px' }}>裁断方式</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {DECISIONS.map(([k, t]) => (
                  <div key={k} onClick={() => !readonly && cur.status === 'pending' && setDecision(k)} className="stat-card"
                    style={{ textAlign: 'center', fontSize: 20, fontFamily: 'var(--serif)', fontWeight: 700, cursor: readonly ? 'default' : 'pointer', padding: 20,
                      background: decision === k ? (k === 'reject' ? 'rgba(181,69,47,.12)' : 'rgba(47,111,94,.14)') : undefined,
                      borderColor: decision === k ? (k === 'reject' ? '#b5452f' : '#2f6f5e') : undefined }}>
                    {t}
                  </div>
                ))}
              </div>
              {decision === 'revise' && (
                <>
                  <div className="serif" style={{ fontSize: 17, margin: '18px 0 8px' }}>修订结果</div>
                  <Input.TextArea value={revised} onChange={(e) => setRevised(e.target.value)} autoSize={{ minRows: 2 }} disabled={readonly || cur.status !== 'pending'} placeholder="修订后的释读结论" />
                </>
              )}
              <div className="serif" style={{ fontSize: 17, margin: '18px 0 8px' }}>裁断理由</div>
              <Input.TextArea value={reason} onChange={(e) => setReason(e.target.value)} autoSize={{ minRows: 4 }} disabled={readonly || cur.status !== 'pending'}
                placeholder="请填写充分的文字学依据、参考文献与修订说明……" />
              <div className="row-line" style={{ borderBottom: 0 }}>
                <Checkbox checked={audit} disabled onChange={(e) => setAudit(e.target.checked)}>将裁断写入不可删除的审计记录</Checkbox>
                <span className="note">{cur.status === 'done' ? `${cur.researcher} · ${cur.decided_at.replace('T', ' ')}` : '研究员复核'}</span>
              </div>
              {!readonly && cur.status === 'pending' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                  <Button size="large" onClick={() => submit(true)}>保存草稿</Button>
                  <Button size="large" className="btn-gold" disabled={!reason.trim()} onClick={() => submit(false)}>
                    确认{DECISIONS.find((d) => d[0] === decision)?.[1]}并提交
                  </Button>
                </div>
              )}
              {cur.status === 'done' && <Tag color={cur.decision === 'reject' ? 'red' : 'green'}>已写入专家裁断库{cur.decision !== 'reject' ? '（B 级，可参与后续检索）' : ''}</Tag>}
            </>
          )}
        </div>
      </div>
      <EvidenceDrawer cid={cite} onClose={() => setCite(null)} />
    </div>
  )
}
