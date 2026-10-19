import { RareText } from '../components/RareText'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { App, Button, Input, Radio, Spin, Upload } from 'antd'
import { ArrowRightOutlined, InboxOutlined, PauseOutlined, StepForwardOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useAuth } from '../store'
import { Answer } from './QA'
import { EvidenceDrawer, Grade, GRADE_TEXT, GlyphView, PageHead, refreshMe } from '../components/ui'
import type { MorphHandle } from '../three/GlyphMorph'

const GlyphMorph = lazy(() => import('../three/GlyphMorph'))

export default function Vision() {
  const user = useAuth((s) => s.user)!
  const nav = useNavigate()
  const { message } = App.useApp()
  const [params] = useSearchParams()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [decl, setDecl] = useState<string>('')
  const [hint, setHint] = useState(params.get('hint') || '')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<any>(null)
  const [tab, setTab] = useState<'cand' | 'texts' | 'evo'>('cand')
  const [cand, setCand] = useState(0)
  const [cite, setCite] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const morph = useRef<MorphHandle>(null)
  const { data: afford, refetch } = useQuery({ queryKey: ['afford-vision'], queryFn: () => api.get('/points/check?action=vision') })

  const candidates: any[] = res?.answer?.candidates || []
  const curChar = candidates[cand]?.char || ''
  const { data: charInfo } = useQuery({
    queryKey: ['char', curChar],
    queryFn: () => api.get(`/lib/characters/${encodeURIComponent(curChar)}`),
    enabled: !!curChar,
  })
  const sources = useMemo(() => (charInfo?.glyphs || []).map((g: any) => ({ script: g.script, image: g.image_path })), [charInfo])

  const start = async () => {
    if (!file) return message.warning('请先上传拓片或器物照片')
    if (!decl) return message.warning('请先完成材料来源声明')
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('declaration', decl)
      fd.append('hint', hint)
      const r = await api.post('/qa/vision', fd)
      setRes(r)
      setCand(0)
      setTab('cand')
      if (r.answer.status !== 'ok') message.warning('释读失败，积分已退回')
      refreshMe()
      refetch()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const toAdj = async () => {
    try {
      await api.post(`/qa/messages/${res.answer.id}/adjudicate`)
      message.success('已送入专家裁断队列')
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const cites: any[] = res?.answer?.citations || []
  const textCites = cites.filter((c) => c.cid.startsWith('T'))

  return (
    <div className="page">
      <PageHead
        title="拓片释读智能体"
        desc="上传授权拓片，自动建立“图像—候选字—文献证据—专家裁断”研究链路。"
        extra={<span className="tag-gold">{user.role === 'user' ? `每次释读 −${afford?.cost ?? 5} 积分，失败自动退回` : '研究员/管理员免积分'}</span>}
      />
      <div className="grid" style={{ gridTemplateColumns: '360px minmax(0,1fr) minmax(0,1.15fr)', alignItems: 'start' }}>
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 16 }}><span className="dim">01</span>　材料上传</div>
          <Upload.Dragger
            accept=".jpg,.jpeg,.png"
            showUploadList={false}
            disabled={!decl}
            beforeUpload={(f) => {
              if (f.size > 10 * 1024 * 1024) {
                message.error('图片不能超过 10MB')
                return Upload.LIST_IGNORE
              }
              setFile(f)
              setPreview(URL.createObjectURL(f))
              return false
            }}
            style={{ background: 'rgba(255,255,255,.02)' }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined style={{ color: 'var(--gold)' }} /></p>
            <p>{decl ? '拖拽拓片或器物照片到此，或点击选择' : '请先在下方选择材料来源声明'}</p>
            <p className="note">JPG / PNG · ≤10MB</p>
          </Upload.Dragger>
          {file && <div className="note" style={{ marginTop: 8 }}>已选择：<RareText>{file.name}</RareText></div>}
          <Button size="small" type="link" style={{ padding: 0, marginTop: 6 }} onClick={async () => {
            const blob = await fetch('/img/vessels/hezun_inscription.png').then((r) => r.blob())
            const f = new File([blob], '何尊铭文拓片.png', { type: 'image/png' })
            setFile(f)
            setPreview(URL.createObjectURL(f))
            setDecl('licensed')
            if (!hint) setHint('宅')
          }}>使用何尊铭文拓片示例（已授权资料）</Button>
          <div className="serif" style={{ fontSize: 18, margin: '24px 0 12px' }}>材料来源声明</div>
          <Radio.Group value={decl} onChange={(e) => setDecl(e.target.value)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Radio value="self">本人拍摄</Radio>
            <Radio value="public">公开资料</Radio>
            <Radio value="licensed">已获授权资料</Radio>
          </Radio.Group>
          <div className="note" style={{ margin: '12px 0 18px' }}>只有完成来源声明的图片才可发送识读；未经许可的图像不用于公开展示。</div>
          <Input placeholder="可选：疑似字或上下文提示（如“宅”）" value={hint} onChange={(e) => setHint(e.target.value)} maxLength={10} style={{ marginBottom: 16 }} />
          {afford && !afford.ok ? (
            <div>
              <Button block disabled style={{ height: 48 }}>开始智能识读</Button>
              <div style={{ color: '#ff9c86', marginTop: 8, fontSize: 13 }}>
                {afford.message} <a onClick={() => nav('/tasks')}>去任务中心 →</a>
              </div>
            </div>
          ) : (
            <Button block className="btn-gold" style={{ height: 48, fontSize: 16 }} loading={busy} onClick={start}>
              开始智能识读 <ArrowRightOutlined />
            </Button>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title"><span className="dim">02</span>　图像与候选区域</span>
            <span className="panel-cap">RUBBING VIEW</span>
          </div>
          <div style={{ height: 340, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: '#0a0d0c', position: 'relative', display: 'grid', placeItems: 'center' }}>
            {preview || res?.question?.image_url ? (
              <img src={res?.question?.image_url || preview} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <span className="dim">上传后在此显示</span>
            )}
            {busy && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.45)' }}><Spin tip="识读中" /></div>}
            {res && <span className="tag-gold" style={{ position: 'absolute', left: 12, bottom: 12 }}>AI 候选识别区域</span>}
          </div>
          <div className="serif" style={{ fontSize: 19, margin: '22px 0 12px' }}>识别候选字形</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {(candidates.length ? candidates : [{}, {}, {}, {}]).map((c: any, i: number) => (
              <div key={i} onClick={() => c.char && setCand(i)} className="stat-card"
                style={{ height: 110, display: 'grid', placeItems: 'center', cursor: c.char ? 'pointer' : 'default', borderColor: i === cand && c.char ? 'var(--gold)' : undefined }}>
                {c.char ? (
                  <div style={{ textAlign: 'center' }}>
                    <div className="serif" style={{ fontSize: 46, color: 'var(--gold-2)', lineHeight: 1.1 }}><RareText>{c.char}</RareText></div>
                    <div className="note">{Math.round(c.score * 100)}%</div>
                  </div>
                ) : (
                  <span className="dim">—</span>
                )}
              </div>
            ))}
          </div>
          <div className="note" style={{ marginTop: 14 }}>
            候选仅用于辅助识读，不能替代文献校勘和专家判断。{candidates[0]?.reason?.includes('未经视觉识别') && '当前候选来自字形库相近字，未经视觉识别。'}
          </div>
        </div>

        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 16 }}><span className="dim">03</span>　释读结果与证据</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            <span className={`chip ${tab === 'cand' ? 'on' : ''}`} onClick={() => setTab('cand')}>释读候选</span>
            <span className={`chip ${tab === 'texts' ? 'on' : ''}`} onClick={() => setTab('texts')}>文献对读</span>
            {charInfo?.complete && <span className={`chip ${tab === 'evo' ? 'on' : ''}`} onClick={() => setTab('evo')}>看演变</span>}
          </div>
          {!res ? (
            <div className="empty">完成识读后显示候选字、依据与证据等级</div>
          ) : tab === 'cand' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="stat-card">
                  <div className="note">当前字头</div>
                  <div className="serif" style={{ fontSize: 76, color: 'var(--gold-2)', lineHeight: 1.2 }}><RareText>{curChar || '—'}</RareText></div>
                </div>
                <div className="stat-card">
                  <div className="note">处理状态</div>
                  <div className="serif" style={{ fontSize: 24, color: 'var(--patina)', margin: '14px 0 6px' }}>候选待裁断</div>
                  <div className="note">A/B/C 来源分级展示</div>
                </div>
              </div>
              <div className="bubble-a" style={{ marginTop: 16, fontSize: 14, lineHeight: 1.9 }}>
                <Answer m={res.answer} onCite={setCite} />
              </div>
              <div className="serif" style={{ fontSize: 18, margin: '20px 0 6px' }}>检索到的支持材料</div>
              {cites.length === 0 && <div className="note">库内暂无相关资料</div>}
              {cites.slice(0, 5).map((c) => (
                <div key={c.cid} className="row-line" style={{ cursor: 'pointer' }} onClick={() => setCite(c.cid)}>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Grade g={c.grade} />
                    <span><div><RareText>{c.title}</RareText></div><div className="note">{GRADE_TEXT[c.grade]}</div></span>
                  </span>
                  <span className="dim">查看 ↗</span>
                </div>
              ))}
            </>
          ) : tab === 'texts' ? (
            textCites.length ? (
              textCites.map((c) => (
                <div key={c.cid} className="row-line" style={{ cursor: 'pointer' }} onClick={() => setCite(c.cid)}>
                  <span><RareText>{c.title}</RareText></span><Grade g={c.grade} />
                </div>
              ))
            ) : (
              <div className="empty">本次检索未命中传世文献，可在“资料库 · 传世文献”中查阅</div>
            )
          ) : (
            <div>
              <Suspense fallback={<Spin />}>
                <GlyphMorph ref={morph} char={curChar} sources={sources} height={280} onStage={setStage} />
              </Suspense>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
                <span className="tag-gold">{stage}</span>
                <Button size="small" icon={<PauseOutlined />} onClick={() => morph.current?.toggle()}>暂停/继续</Button>
                <Button size="small" icon={<StepForwardOutlined />} onClick={() => morph.current?.step(0.1)}>逐帧</Button>
              </div>
            </div>
          )}
          {res && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '22px 0 8px' }}>
                {['金文', '石鼓文', '小篆'].map((s, i) => (
                  <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="stat-card" style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <GlyphView char={curChar} script={s} image={charInfo?.glyphs?.find((g: any) => g.script === s)?.image_path} size={30} />
                      <span className="note"><RareText>{s}</RareText></span>
                    </span>
                    {i < 2 && <span className="gold">→</span>}
                  </span>
                ))}
              </div>
              <div className="note">字形资料齐全时可启动粒子演变动画；当前字形为占位渲染，待研究员上传切图。</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
                {user.role !== 'user' ? (
                  <Button type="primary" onClick={toAdj}>送专家裁断</Button>
                ) : (
                  <Button onClick={async () => {
                    const d = await api.post(`/qa/messages/${res.answer.id}/report`, {})
                    sessionStorage.setItem('zz_correction', JSON.stringify(d))
                    nav('/tasks?correction=1')
                  }}>标记有误 · 发起纠错</Button>
                )}
                <Button onClick={() => nav(curChar ? `/library/characters/${encodeURIComponent(curChar)}` : '/library/characters')}>查看资料库</Button>
              </div>
            </>
          )}
        </div>
      </div>
      <EvidenceDrawer cid={cite} onClose={() => setCite(null)} />
    </div>
  )
}
