import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Empty, Input, Popconfirm, Spin, Tooltip } from 'antd'
import { DeleteOutlined, ExportOutlined, FlagOutlined, PlusOutlined, SafetyCertificateOutlined, SendOutlined } from '@ant-design/icons'
import { api, download } from '../api'
import { useAuth } from '../store'
import { EvidenceDrawer, Grade, GRADE_TEXT, refreshMe } from '../components/ui'

export function Answer({ m, onCite }: { m: any; onCite: (cid: string) => void }) {
  if (m.status !== 'ok') return <div style={{ color: '#ff9c86' }}>{m.content}</div>
  const grades: Record<string, string> = Object.fromEntries((m.citations || []).map((c: any) => [c.cid, c.grade]))
  return (
    <div>
      {(m.segments || []).map((s: any, i: number) => (
        <span key={i}>
          <span className={s.grade === 'D' ? 'seg-D' : ''} title={s.grade === 'D' ? '模型推测，未经核验' : undefined}>{s.text}</span>
          {s.cites.map((c: string) => (
            <span key={c} className={`cite ${grades[c] || ''}`} onClick={() => onCite(c)}>
              {grades[c]} · {c}
            </span>
          ))}
          {s.grade === 'D' && <span className="d-flag">D · 推测，未经核验</span>}
          {s.newline && <br />}
        </span>
      ))}
    </div>
  )
}

export default function QA() {
  const user = useAuth((s) => s.user)!
  const nav = useNavigate()
  const qc = useQueryClient()
  const { message } = App.useApp()
  const [params, setParams] = useSearchParams()
  const [sid, setSid] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [cite, setCite] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const autoAsked = useRef(false)
  const threadRef = useRef<HTMLDivElement>(null)

  const { data: sessions = [], refetch: refetchSessions } = useQuery({ queryKey: ['qa-sessions'], queryFn: () => api.get('/qa/sessions?kind=text') })
  const { data: detail, refetch: refetchDetail, isFetching } = useQuery({
    queryKey: ['qa-session', sid],
    queryFn: () => api.get(`/qa/sessions/${sid}`),
    enabled: !!sid,
  })
  const { data: afford, refetch: refetchAfford } = useQuery({ queryKey: ['afford-qa'], queryFn: () => api.get('/points/check?action=qa') })
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: () => api.get('/health') })

  useEffect(() => {
    if (!sid && sessions.length && !params.get('q')) setSid(sessions[0].id)
  }, [sessions, sid, params])

  const messages: any[] = detail?.messages || []
  const lastAnswer = useMemo(() => {
    const ans = messages.filter((m) => m.role === 'assistant')
    return ans.find((m) => m.id === selected) || ans[ans.length - 1]
  }, [messages, selected])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, sending])

  const ask = async (text: string, sessionId?: number | null) => {
    const q = text.trim()
    if (!q || sending) return
    setSending(true)
    try {
      let id = sessionId ?? sid
      if (!id) {
        const s = await api.post('/qa/sessions', { kind: 'text' })
        id = s.id
        setSid(id)
      }
      qc.setQueryData(['qa-session', id], (old: any) => ({ ...(old || { id }), messages: [...(old?.messages || []), { id: -1, role: 'user', content: q }] }))
      setInput('')
      const r = await api.post(`/qa/sessions/${id}/messages`, { question: q })
      if (r.answer.status === 'failed') message.warning('模型调用失败，预扣积分已退回')
      if (r.answer.status === 'blocked') message.warning('内容安全拦截，积分已退回')
      setSelected(r.answer.id)
      await Promise.all([refetchDetail(), refetchSessions(), refetchAfford()])
      refreshMe()
    } catch (e: any) {
      message.error(e.message)
      refetchDetail()
      refetchAfford()
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    const q = params.get('q')
    if (q && !autoAsked.current) {
      autoAsked.current = true
      setParams({}, { replace: true })
      setSid(null)
      ask(q, null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const newSession = () => {
    setSid(null)
    setSelected(null)
    qc.removeQueries({ queryKey: ['qa-session', null] })
  }

  const sendToAdj = async (mid: number) => {
    try {
      await api.post(`/qa/messages/${mid}/adjudicate`)
      message.success('已送入专家裁断队列')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const report = async (mid: number) => {
    const d = await api.post(`/qa/messages/${mid}/report`, {})
    sessionStorage.setItem('zz_correction', JSON.stringify(d))
    nav('/tasks?correction=1')
  }

  const blocked = afford && !afford.ok

  return (
    <div className="page" style={{ maxWidth: 'none', paddingTop: 26, paddingBottom: 26 }}>
      <div className="qa-grid">
        {/* 左：会话 */}
        <div className="panel qa-col" style={{ padding: '22px 16px' }}>
          <div className="panel-head" style={{ padding: '0 8px' }}>
            <span className="panel-title">研究会话</span>
            <a onClick={newSession}><PlusOutlined /> 新建</a>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {sessions.length === 0 && <div className="empty">还没有会话</div>}
            {sessions.map((s: any) => (
              <div key={s.id} className={`sess ${s.id === sid ? 'on' : ''}`} onClick={() => { setSid(s.id); setSelected(null) }}>
                <div className="t">{s.title}</div>
                <div className="s" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{s.updated_at.replace('T', ' ').slice(5)}</span>
                  <Popconfirm title="删除该会话？" onConfirm={(e) => { e?.stopPropagation(); api.del(`/qa/sessions/${s.id}`).then(() => { if (s.id === sid) setSid(null); refetchSessions() }) }}>
                    <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
          <Button block style={{ marginTop: 10 }} onClick={() => nav('/qa/vision')}>拓片图像释读 →</Button>
        </div>

        {/* 中：对话 */}
        <div className="panel qa-col">
          <div className="panel-head">
            <span className="panel-title" style={{ fontSize: 26 }}>文献问答智能体</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="pill" style={{ borderColor: 'rgba(111,179,160,.5)', color: 'var(--patina)', background: 'rgba(63,143,122,.12)' }}>
                <SafetyCertificateOutlined /> 引证核验已启用
              </span>
              {sid && (
                <Tooltip title={user.role === 'user' ? `导出含引用清单的报告，扣 ${afford ? 3 : 3} 积分` : '导出报告'}>
                  <Button size="small" icon={<ExportOutlined />} onClick={() => download('POST', `/qa/sessions/${sid}/export`, `宅兹问答报告_${sid}.doc`).then(refreshMe).catch((e) => message.error(e.message))}>
                    导出
                  </Button>
                </Tooltip>
              )}
            </span>
          </div>
          <div className="thread" ref={threadRef}>
            {!sid && messages.length === 0 && !sending && (
              <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 520 }}>
                <div className="serif" style={{ fontSize: 24, marginBottom: 10 }}>只依据库内已审核条目作答</div>
                <div className="note">每个判断后附引用角标与证据等级（A 原器拓片 · B 权威著录 · C 辅助资料或学界异说 · D 模型推测）。库内没有出处时，系统会明确回答“库内暂无相关资料”。</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 22 }}>
                  {['何尊铭文中“宅兹中国”应如何理解？', '大盂鼎记载了哪些赏赐？', '岐山方言里“宅”怎么读？', '唐代长安有多少人口？'].map((e) => (
                    <span key={e} className="chip" onClick={() => ask(e)}>{e}</span>
                  ))}
                </div>
              </div>
            )}
            {isFetching && !messages.length && <Spin style={{ margin: 'auto' }} />}
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="bubble-q">{m.content}</div>
              ) : (
                <div key={m.id} className={`bubble-a ${m.status !== 'ok' ? 'failed' : ''}`} onClick={() => setSelected(m.id)}
                  style={{ borderColor: lastAnswer?.id === m.id && m.status === 'ok' ? 'rgba(201,164,92,.35)' : undefined }}>
                  {m.status === 'ok' && <div style={{ color: 'var(--gold)', fontSize: 14, marginBottom: 8 }}>✦ 基于已审核资料的辅助回答</div>}
                  <Answer m={m} onCite={setCite} />
                  {m.excluded_internal && <div className="note" style={{ marginTop: 8 }}>注：部分内部资料（L2/L3）未参与本次回答。</div>}
                  {m.status === 'ok' && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="chip">引证 {m.citations.length} 项</span>
                      {user.role !== 'user' && <span className="chip" onClick={() => sendToAdj(m.id)}>送专家裁断 ↗</span>}
                      {user.role === 'user' && <span className="chip" onClick={() => report(m.id)}><FlagOutlined /> 标记有误</span>}
                      <span className="note" style={{ marginLeft: 'auto' }}>
                        {m.model} · {m.latency_ms}ms{m.cost_points ? ` · −${m.cost_points} 积分` : ''}
                        {m.verify?.removed_invalid?.length ? ` · 已删除无效引用 ${m.verify.removed_invalid.length} 处` : ''}
                      </span>
                    </div>
                  )}
                </div>
              ),
            )}
            {sending && <div className="bubble-a"><Spin size="small" /> <span className="dim" style={{ marginLeft: 10 }}>正在检索库内条目并核验引证……</span></div>}
          </div>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, marginTop: 12 }}>
            {blocked ? (
              <div className="row-line" style={{ border: 0 }}>
                <span style={{ color: '#ff9c86' }}>{afford.message}</span>
                <Button className="btn-gold" onClick={() => nav('/tasks')}>去任务中心</Button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10 }}>
                <Input.TextArea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  placeholder="继续提问：例如“请比较《尚书·召诰》与何尊铭文的语境”（Enter 发送，Shift+Enter 换行）"
                  onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); ask(input) } }}
                />
                <Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!input.trim()} onClick={() => ask(input)} style={{ height: 'auto' }}>
                  发送
                </Button>
              </div>
            )}
            <div className="note" style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>智能体基于关联知识库辅助生成，请以引用条目和专家裁断为准。</span>
              <span>{user.role === 'user' ? `每次问答 −${afford?.cost ?? 1} 积分 · 失败自动退回` : '研究员/管理员调用不扣积分（记录影子消耗）'} · {health?.model}</span>
            </div>
          </div>
        </div>

        {/* 右：证据链 */}
        <div className="panel qa-col" style={{ overflowY: 'auto' }}>
          <div className="panel-head">
            <span className="panel-title">证据链抽屉</span>
            <span className="panel-cap">VERIFIED SOURCES</span>
          </div>
          {!lastAnswer || lastAnswer.status !== 'ok' ? (
            <Empty description="提问后，这里列出本次回答引用的库内条目" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : lastAnswer.citations.length === 0 ? (
            <div className="empty">本次回答没有可引用的库内条目</div>
          ) : (
            <>
              <div className="note" style={{ marginBottom: 8 }}>资料范围：已审核库内条目 · 送模型的上下文仅含 L1</div>
              {lastAnswer.citations.map((c: any) => (
                <div key={c.cid} className="row-line" style={{ cursor: 'pointer' }} onClick={() => setCite(c.cid)}>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Grade g={c.grade} />
                    <span>
                      <div>{c.title}</div>
                      <div className="note">{GRADE_TEXT[c.grade]} · [{c.cid}]</div>
                    </span>
                  </span>
                  <span className="dim">查看 ↗</span>
                </div>
              ))}
            </>
          )}
          <div style={{ marginTop: 28 }}>
            <div className="panel-title" style={{ fontSize: 18, marginBottom: 10 }}>回答可信度提示</div>
            <div className="note">
              引用 ID 已与本次检索条目逐一核验；不在检索结果中的引用会被删除，无出处的判断以朱砂虚线标为 D 级“模型推测，未经核验”。
              {lastAnswer?.verify && lastAnswer.status === 'ok' && (
                <>
                  <br />本次：有出处判断 {lastAnswer.verify.cited_segments} 处，D 级 {lastAnswer.verify.d_segments} 处，删除无效引用 {lastAnswer.verify.removed_invalid?.length || 0} 处。
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <EvidenceDrawer cid={cite} onClose={() => setCite(null)} />
    </div>
  )
}
