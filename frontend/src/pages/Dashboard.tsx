import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { App, Button, ConfigProvider, Form, InputNumber, Modal, Progress, Spin, Table, Tag } from 'antd'
import { FullscreenOutlined, PauseOutlined, CaretRightOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useAuth, useSite } from '../store'
import EChart, { AXIS } from '../components/EChart'
import type { District } from '../three/BaojiTerrain'
import { imgUrl } from '../components/ui'
import { paperTheme } from '../theme'

const BaojiTerrain = lazy(() => import('../three/BaojiTerrain'))
const StarGraph = lazy(() => import('../three/StarGraph'))
const GlyphMorph = lazy(() => import('../three/GlyphMorph'))

function CountUp({ value, suffix = '' }: { value: number | null | undefined; suffix?: string }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (value == null) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); return }
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1200)
      setV(Math.round(value * (1 - Math.pow(1 - k, 3)) * 10) / 10)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  if (value == null) return <span>—</span>
  return <span>{Number.isInteger(value) ? Math.round(v) : v.toFixed(1)}{suffix}</span>
}

const FOCUS = ['宝鸡市 · 出土文献空间分布', '知识图谱 · 何尊关系网络', '字形演变 · 宅']

function ScreenView() {
  const { data } = useQuery({ queryKey: ['dash-screen'], queryFn: () => api.get('/dash/screen'), refetchInterval: 30_000 })
  const { data: kg } = useQuery({ queryKey: ['dash-kg', data?.showcase_node], queryFn: () => api.get(`/kg/nodes/${data.showcase_node}/neighbors`), enabled: !!data?.showcase_node })
  const { data: glyph } = useQuery({ queryKey: ['char', '宅'], queryFn: () => api.get('/lib/characters/宅') })
  const [focus, setFocus] = useState(0)
  const [paused, setPaused] = useState(true)
  const [picked, setPicked] = useState<District | null>(null)
  const [scale, setScale] = useState(1)
  const box = useRef<HTMLDivElement>(null)
  const nav = useNavigate()

  // DASH-6：每 30 秒切换中央焦点
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setFocus((f) => (f + 1) % 3), 30_000)
    return () => clearInterval(t)
  }, [paused])
  // DASH-1：固定 16:9 画布等比缩放
  useEffect(() => {
    const fit = () => {
      const el = box.current?.parentElement
      if (!el) return
      setScale(Math.min(el.clientWidth / 1920, el.clientHeight / 1080))
    }
    fit()
    const observer = new ResizeObserver(fit)
    if (box.current?.parentElement) observer.observe(box.current.parentElement)
    window.addEventListener('resize', fit)
    document.addEventListener('fullscreenchange', fit)
    return () => {
      window.removeEventListener('resize', fit)
      document.removeEventListener('fullscreenchange', fit)
      observer.disconnect()
    }
  }, [!!data])

  const m = data?.metrics
  const t = data?.trust
  const sources = useMemo(() => (glyph?.glyphs || []).map((g: any) => ({ script: g.script, image: g.image_path })), [glyph])
  const trendOpt = useMemo(() => ({
    grid: { left: 36, right: 10, top: 20, bottom: 24 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: (data?.trend || []).map((d: any) => d.date.slice(5)), ...AXIS },
    yAxis: { type: 'value', minInterval: 1, ...AXIS },
    series: [
      { name: '问答', type: 'line', smooth: true, showSymbol: false, data: (data?.trend || []).map((d: any) => d.qa), lineStyle: { color: '#6fb3a0', width: 2 }, areaStyle: { color: 'rgba(111,179,160,.18)' } },
      { name: '图像释读', type: 'line', smooth: true, showSymbol: false, data: (data?.trend || []).map((d: any) => d.vision), lineStyle: { color: '#c9a45c', width: 2 } },
    ],
  }), [data])

  if (!data) return <div style={{ height: '70vh', display: 'grid', placeItems: 'center' }}><Spin /></div>
  const pct = (v: number | null) => (v == null ? null : v)

  return (
    <div className="data-screen" style={{ position: 'relative', width: '100%', height: 'calc(100vh - var(--header-h) - 64px)', overflow: 'hidden', background: '#050f1c' }} id="screen-root">
      <div ref={box} style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute',
        left: `calc(50% - ${960 * scale}px)`, top: `calc(50% - ${540 * scale}px)`, background: 'radial-gradient(1400px 800px at 50% 45%, #103247, #050f1c 75%)' }}>
        <div style={{ position: 'absolute', left: 50, top: 24, right: 50, display: 'flex', alignItems: 'baseline', gap: 26 }}>
          <span className="serif" style={{ fontSize: 44, fontWeight: 700, letterSpacing: 6 }}>{useSite.getState().anon ? '平台数智建设驾驶舱' : '实验室数智建设驾驶舱'}</span>
          <span className="dim" style={{ letterSpacing: 3 }}>周秦文脉 · 关陇智研 / BAOJI</span>
          <span style={{ flex: 1 }} />
          <span className="dim mono">数据更新 {data.updated_at.replace('T', ' ')}</span>
        </div>

        {/* 左：数据底座 */}
        <div className="panel" style={{ position: 'absolute', left: 30, top: 110, width: 270, bottom: 190 }}>
          <div className="panel-head"><span className="panel-title">数据底座</span><span className="panel-cap">DATA BASE</span></div>
          {[[m.vessels, '器铭件数（已审核）', ''], [m.dialects, `方言条目（覆盖 ${m.dialect_districts} 区县）`, ''], [m.kg_nodes, '图谱实体', ''], [m.kg_edges, '图谱关系', ''], [m.glyphs, '字形图录', ''], [m.eval_items, '评测集题数', '']].map(([v, l]) => (
            <div key={l as string} className="row-line">
              <span className="dim">{l}</span>
              <span className="serif" style={{ fontSize: 34, color: 'var(--gold-2)' }}><CountUp value={v as number} /></span>
            </div>
          ))}
          <div className="note" style={{ marginTop: 14 }}>云端模型仅检索 L1 已审核资料。</div>
        </div>

        {/* 中：轮播焦点 */}
        <div className="panel map-stage" style={{ position: 'absolute', left: 320, right: 320, top: 110, bottom: 190, padding: 0, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 26, top: 20, zIndex: 3, display: 'flex', gap: 16, alignItems: 'center' }}>
            <span className="serif gold" style={{ fontSize: 25 }}>{FOCUS[focus]}</span>
            {FOCUS.map((title, i) => <button key={i} aria-label={title} aria-pressed={focus === i} onClick={() => setFocus(i)} style={{ border: 0, width: 24, height: 7, borderRadius: 2, cursor: 'pointer', background: i === focus ? '#61dae8' : '#2a465a' }} />)}
            <Button size="small" icon={paused ? <CaretRightOutlined /> : <PauseOutlined />} onClick={() => setPaused((p) => !p)}>{paused ? '继续轮播' : '暂停轮播'}</Button>
          </div>
          <Suspense fallback={<Spin style={{ margin: 'auto' }} />}>
            {focus === 0 && <BaojiTerrain districts={data.districts} onPick={setPicked} />}
            {focus === 1 && kg && <StarGraph nodes={kg.nodes} edges={kg.edges} hidden={new Set()} selected={data.showcase_node} highlight={null} flyTo={null} showAllLabels />}
            {focus === 2 && (
              <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                <div style={{ width: '70%' }}><GlyphMorph char="宅" sources={sources} height={620} /></div>
              </div>
            )}
          </Suspense>
          {focus === 0 && (
            <div className="pill" style={{ position: 'absolute', left: 26, bottom: 20, color: '#9aa39e', borderColor: '#2a3733' }}>
              宝鸡市 12 区县 · 行政区划与实测高程模型
            </div>
          )}
          {picked && focus === 0 && (
            <div className="float-panel" style={{ right: 24, top: 70, width: 300, padding: 18 }}>
              <div className="panel-head" style={{ marginBottom: 8 }}><span className="panel-title">{picked.name}</span><a onClick={() => setPicked(null)}>×</a></div>
              <div className="note">已审核器铭 {picked.count} 件{picked.count ? '，代表器物：' : ''}</div>
              {picked.vessels.map((v) => (
                <div key={v.id} className="row-line" style={{ cursor: 'pointer' }} onClick={() => nav(`/library/vessels/${v.id}`)}>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {v.image && <img src={imgUrl(v.image)} style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 6 }} />}
                    {v.name}
                  </span>
                  <span className="note">{v.period.split('（')[0]}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右：可信度 */}
        <div className="panel" style={{ position: 'absolute', right: 30, top: 110, width: 270, bottom: 190 }}>
          <div className="panel-head"><span className="panel-title">可信释读质量</span><span className="panel-cap">TRUST METRICS</span></div>
          {[[pct(t.citation_accuracy), '引证准确率', `抽检 ${t.sampled} 条 · 目标 ≥90%`], [pct(t.unsourced_rate), '无出处断言率', '越低越好'], [pct(t.adoption_rate), '专家采纳率', `已裁断 ${t.adjudicated} 条`]].map(([v, l, s]) => (
            <div key={l as string} className="stat-card" style={{ marginBottom: 12 }}>
              <div className="serif" style={{ fontSize: 38, color: 'var(--gold-2)' }}>{v == null ? '暂无数据' : <CountUp value={v as number} suffix="%" />}</div>
              <div className="stat-label">{l} · {s}</div>
            </div>
          ))}
          <div className="serif" style={{ fontSize: 18, margin: '18px 0 4px' }}>近 30 天问答量</div>
          <EChart option={trendOpt} height={190} />
        </div>

        {/* 底：滚动动态 */}
        <div className="panel" style={{ position: 'absolute', left: 50, right: 50, bottom: 40, height: 126, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30, overflow: 'hidden' }}>
          <Ticker title="最新裁断" items={data.feeds.adjudications.map((a: any) => `${a.title} · ${a.decision} · ${a.by} · ${a.at.slice(5).replace('T', ' ')}`)} />
          <Ticker title="最新入库" items={data.feeds.records.map((r: any) => `${r.title} · ${r.approve ? '审核通过' : '驳回'} · ${r.by} · ${r.at.slice(5).replace('T', ' ')}`)} />
        </div>
        <div style={{ position: 'absolute', right: 50, bottom: 12, fontSize: 12 }} className="dim">{useSite.getState().imageCredit}</div>
      </div>
    </div>
  )
}

function Ticker({ title, items }: { title: string; items: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 3000)
    return () => clearInterval(t)
  }, [])
  const show = items.length ? [0, 1, 2].map((k) => items[(i + k) % items.length]) : []
  return (
    <div>
      <div className="tag-gold" style={{ marginBottom: 8 }}>{title}</div>
      {show.length === 0 && <div className="note">暂无</div>}
      {show.map((s, k) => <div key={`${i}-${k}`} className="rise" style={{ fontSize: 15, padding: '3px 0', opacity: 1 - k * 0.25 }}>{s}</div>)}
    </div>
  )
}

function ProgressView() {
  const user = useAuth((s) => s.user)!
  const { message } = App.useApp()
  const { data, refetch } = useQuery({ queryKey: ['dash-progress'], queryFn: () => api.get('/dash/progress') })
  const [edit, setEdit] = useState<any>(null)
  const [sample, setSample] = useState(false)
  const [sf] = Form.useForm()
  const years = Array.from(new Set((data?.kpis || []).map((k: any) => k.year))) as number[]
  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div className="note">按建设考核指标展示“目标值 / 当前值 / 完成率”；当前值实时取自数据库。{user.role === 'admin' && '点击目标值可修改。'}</div>
        <Button onClick={() => setSample(true)}>录入抽检记录</Button>
      </div>
      {years.map((y) => (
        <div key={y} className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-head"><span className="panel-title">{y} 年度</span></div>
          <Table rowKey="id" pagination={false} dataSource={(data?.kpis || []).filter((k: any) => k.year === y)}
            columns={[
              { title: '指标', dataIndex: 'indicator' },
              { title: '目标值', dataIndex: 'target', render: (v, r: any) => user.role === 'admin' ? <a onClick={() => setEdit(r)}>{v}{r.unit}</a> : `${v}${r.unit}` },
              { title: '当前值', dataIndex: 'current', render: (v, r: any) => v == null ? '暂无数据' : `${v}${r.unit}` },
              { title: '完成率', dataIndex: 'rate', width: 320, render: (v) => v == null ? <span className="note">暂无抽检记录</span> : <Progress percent={v} strokeColor={{ from: '#3F8F7A', to: '#C9A45C' }} /> },
            ]} />
        </div>
      ))}
      <div className="panel">
        <div className="panel-head"><span className="panel-title">研究员工作量排行</span></div>
        <Table rowKey="name" pagination={false} dataSource={data?.workload || []}
          columns={[{ title: '研究员', dataIndex: 'name' }, { title: '录入', dataIndex: 'entry' }, { title: '审核', dataIndex: 'review' }, { title: '裁断', dataIndex: 'adjudication' }, { title: '任务审核', dataIndex: 'task_review' }]} />
      </div>
      <Modal title={`修改目标值 · ${edit?.indicator}（${edit?.year}）`} open={!!edit} onCancel={() => setEdit(null)} destroyOnClose
        onOk={async () => { await api.put(`/admin/kpi-targets/${edit.id}`, { target: edit.target }); message.success('已修改'); setEdit(null); refetch() }}>
        <InputNumber value={edit?.target} min={0} onChange={(v) => setEdit({ ...edit, target: v })} addonAfter={edit?.unit} />
      </Modal>
      <Modal title="录入抽检记录（附录C：引证准确率、无出处断言率）" open={sample} onCancel={() => setSample(false)} destroyOnClose
        onOk={async () => { const v = await sf.validateFields(); try { await api.post('/admin/trust-samples', v); message.success('已录入'); setSample(false) } catch (e: any) { message.error(e.message) } }}>
        <Form form={sf} layout="vertical">
          <Form.Item name="sampled" label="抽检回答数" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="accurate" label="引证准确的回答数" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="claims" label="实质性判断总数" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="unsourced_claims" label="其中未附库内出处的判断数" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

function OpsView() {
  const { data } = useQuery({ queryKey: ['dash-ops'], queryFn: () => api.get('/dash/ops'), refetchInterval: 60_000 })
  const { data: geography } = useQuery({ queryKey: ['dash-screen'], queryFn: () => api.get('/dash/screen'), refetchInterval: 30_000 })
  const [picked, setPicked] = useState<District | null>(null)
  const nav = useNavigate()
  if (!data) return <Spin />
  const ROLE: Record<string, string> = { admin: '管理员', researcher: '研究员', user: '用户' }
  const pie = (obj: Record<string, number>, map: Record<string, string> = {}) => ({
    tooltip: { trigger: 'item' },
    color: ['#3F8F7A', '#C9A45C', '#6FB3A0', '#B5452F', '#8C7AA6', '#DCE6F0'],
    series: [{ type: 'pie', radius: ['48%', '72%'], label: { color: '#9aa39e' }, data: Object.entries(obj).map(([k, v]) => ({ name: map[k] || k, value: v })) }],
  })
  const bar = (labels: string[], values: number[], color = '#3F8F7A') => ({
    grid: { left: 40, right: 10, top: 14, bottom: 46 }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, ...AXIS, axisLabel: { ...AXIS.axisLabel, rotate: labels.some((l) => l.length > 5) ? 25 : 0 } },
    yAxis: { type: 'value', minInterval: 1, ...AXIS }, series: [{ type: 'bar', data: values, itemStyle: { color, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 34 }],
  })
  const Stat = ({ v, l }: { v: any; l: string }) => <div className="stat-card"><div className="stat-num">{v}</div><div className="stat-label">{l}</div></div>
  return (
    <div className="page paper ops-view">
      <div className="ops-heading"><div><small>ZHOU & QIN · DIGITAL RESEARCH</small><h1>宅兹 · 宝鸡数智研究态势</h1><p>周秦文脉 / 关陇文化 / 研究服务运营</p></div><span>平台记录实时汇总 · 每分钟更新</span></div>
      <div className="ops-hero">
        <div className="ops-geography">
          <div className="ops-map-title"><span>宝鸡市域 · 文化资源分布</span><small>器铭资料 / 区县汇总</small></div>
          <Suspense fallback={<Spin />}><BaojiTerrain districts={geography?.districts || []} light onPick={setPicked} /></Suspense>
          <div className="ops-map-stats"><Stat v={geography?.metrics.vessels ?? '—'} l="已审核器铭" /><Stat v={geography?.metrics.dialects ?? '—'} l="方言条目" /><Stat v={geography?.metrics.kg_nodes ?? '—'} l="知识实体" /></div>
          {picked && <div className="ops-pick"><button onClick={() => setPicked(null)} aria-label="关闭区县详情">×</button><b>{picked.name} · {picked.count} 件已审核器铭</b>{picked.vessels.map(v => <a key={v.id} onClick={() => nav(`/library/vessels/${v.id}`)}>{v.name} →</a>)}</div>}
        </div>
        <aside className="ops-summary"><h2>核心运营指标</h2>
          <div className="ops-kpi"><span>注册用户</span><b>{data.users.total}<small>人</small></b></div>
          <div className="ops-kpi"><span>今日活跃</span><b>{data.users.dau}<small>人</small></b></div>
          <div className="ops-kpi"><span>今日新增</span><b>{data.users.new_today}<small>人</small></b></div>
          <div className="ops-kpi"><span>模型调用</span><b>{data.model.calls}<small>次</small></b></div>
          <div className="ops-kpi"><span>调用失败率</span><b>{data.model.calls ? `${data.model.fail_rate}%` : '暂无数据'}</b></div>
          <div className="ops-kpi"><span>估算费用</span><b>¥{data.model.cost}</b></div>
          <div className="ops-mini-title">近 14 天日活</div><EChart height={155} option={bar(data.users.dau_trend.map((d: any) => d.date.slice(5)), data.users.dau_trend.map((d: any) => d.dau), '#a4c9ac')} />
          <p>指标来自平台账号、调用和审核记录；费用按配置单价估算。</p>
        </aside>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="panel"><div className="panel-title">分角色用户</div><EChart option={pie(data.users.by_role, ROLE)} /></div>
        <div className="panel"><div className="panel-title">分单位用户</div><EChart option={bar(Object.keys(data.users.by_org), Object.values(data.users.by_org) as number[])} /></div>
        <div className="panel"><div className="panel-title">近 14 天日活</div><EChart option={bar(data.users.dau_trend.map((d: any) => d.date.slice(5)), data.users.dau_trend.map((d: any) => d.dau), '#6FB3A0')} /></div>
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 12 }}>积分</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Stat v={data.points.granted} l="发放总量（含导入）" /><Stat v={data.points.consumed} l="消耗总量（不含退回）" />
            <Stat v={data.points.task_reward} l="任务奖励" /><Stat v={`${data.points.task_ratio}%`} l="任务奖励占比" />
          </div>
        </div>
        <div className="panel"><div className="panel-title">余额分布</div><EChart option={bar(Object.keys(data.points.balance_dist), Object.values(data.points.balance_dist) as number[], '#C9A45C')} /></div>
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 12 }}>模型</div>
          <div className="row-line"><span className="dim">平均延迟</span><span>{data.model.avg_latency} ms</span></div>
          <div className="row-line"><span className="dim">输入 / 输出 token</span><span>{data.model.tokens_in} / {data.model.tokens_out}</span></div>
          {data.model.by_role.map((r: any) => (
            <div key={r.role + r.action} className="row-line"><span><Tag>{ROLE[r.role]}</Tag>{{ qa: '文字问答', vision: '图像释读', export: '导出报告' }[r.action as string] || r.action}</span><span>{r.calls} 次{r.role !== 'user' ? '（影子消耗）' : ''}</span></div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 12 }}>任务</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Stat v={data.tasks.submitted} l="提交量" /><Stat v={`${data.tasks.pass_rate}%`} l="通过率" /><Stat v={`${data.tasks.avg_review_hours}h`} l="平均审核时长" />
          </div>
        </div>
        <div className="panel" style={{ gridColumn: 'span 2' }}>
          <div className="panel-title">近 14 天 AI 调用</div>
          <EChart option={{
            grid: { left: 36, right: 10, top: 30, bottom: 24 }, tooltip: { trigger: 'axis' }, legend: { textStyle: { color: '#9aa39e' } },
            xAxis: { type: 'category', data: data.trend.map((d: any) => d.date.slice(5)), ...AXIS }, yAxis: { type: 'value', minInterval: 1, ...AXIS },
            series: [{ name: '问答', type: 'line', smooth: true, data: data.trend.map((d: any) => d.qa), lineStyle: { color: '#6fb3a0' }, itemStyle: { color: '#6fb3a0' } },
              { name: '图像释读', type: 'line', smooth: true, data: data.trend.map((d: any) => d.vision), lineStyle: { color: '#c9a45c' }, itemStyle: { color: '#c9a45c' } }],
          }} />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const user = useAuth((s) => s.user)!
  const [params, setParams] = useSearchParams()
  const view = params.get('view') || 'screen'
  const views = [['screen', '大屏视图'], ['progress', '建设进度'], ...(user.role === 'admin' ? [['ops', '运营视图']] : [])]
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 50px', borderBottom: '1px solid var(--line)', height: 64 }}>
        {views.map(([k, t]) => <span key={k} className={`chip ${view === k ? 'on' : ''}`} onClick={() => setParams({ view: k })}>{t}</span>)}
        <span style={{ flex: 1 }} />
        {view === 'screen' && (
          <Button icon={<FullscreenOutlined />} onClick={() => document.getElementById('screen-root')?.requestFullscreen?.()}>全屏（F11 亦可）</Button>
        )}
      </div>
      {view === 'screen' ? <ScreenView /> : view === 'progress' ? <ProgressView /> : user.role === 'admin' ? <ConfigProvider theme={paperTheme}><OpsView /></ConfigProvider> : null}
    </div>
  )
}
