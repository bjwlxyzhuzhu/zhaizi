import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Button, Spin } from 'antd'
import { ReloadOutlined, DatabaseOutlined, ClusterOutlined, TeamOutlined, RadarChartOutlined, RobotOutlined, AuditOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { api } from '../api'
import EChart from '../components/EChart'
import boundaries from '../assets/baoji.json'

const GOLD = '#d5b777', GREEN = '#86bba5', DIM = '#9aaba1'
const COLORS = [GREEN, GOLD, '#7f9da7', '#b58a70', '#a6a87f']
const ROLE: Record<string, string> = { admin: '管理员', researcher: '研究员', user: '协作用户' }
const axis = { axisLine: { lineStyle: { color: '#34483e' } }, axisTick: { show: false }, axisLabel: { color: DIM, fontSize: 13 }, splitLine: { lineStyle: { color: '#27372e', type: 'dashed' } } }
const tooltip = { backgroundColor: '#14231d', borderColor: '#6f7654', textStyle: { color: '#f1ead7', fontSize: 14 } }
const number = (v: number) => new Intl.NumberFormat('zh-CN').format(v || 0)

function OpsClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer) }, [])
  return <time>{now.toLocaleString('zh-CN', { hour12: false })}</time>
}

function Panel({ title, cap, extra, children, className = '' }: { title: string; cap: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`ops-panel ${className}`}><header><h2>{title}<small>{cap}</small></h2>{extra}</header><div className="ops-panel-body">{children}</div></section>
}

function donut(items: { name: string; value: number }[]) {
  return { tooltip: { ...tooltip, trigger: 'item', formatter: '{b}：{c}' }, color: COLORS,
    series: [{ type: 'pie', radius: ['66%', '82%'], center: ['50%', '50%'], padAngle: 3, avoidLabelOverlap: true, label: { show: false },
      emphasis: { scaleSize: 4, label: { show: false } }, itemStyle: { borderRadius: 3 }, emptyCircleStyle: { color: '#283d31' }, data: items }],
  }
}

function bars(items: { name: string; value: number }[], color = GREEN, horizontal = false) {
  const category = { type: 'category', data: items.map(x => x.name), ...axis, axisLabel: { color: DIM, fontSize: 13, width: horizontal ? 100 : 70, overflow: 'truncate' }, splitLine: { show: false } }
  const value = { type: 'value', minInterval: 1, ...axis }
  return { tooltip: { ...tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } }, grid: { left: horizontal ? 108 : 34, right: horizontal ? 44 : 16, top: 14, bottom: 25 },
    xAxis: horizontal ? value : category, yAxis: horizontal ? category : value,
    series: [{ type: 'bar', data: items.map(x => x.value), barMaxWidth: horizontal ? 14 : 32, showBackground: true,
      backgroundStyle: { color: '#26392d66', borderRadius: 3 }, itemStyle: { color, borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
      label: { show: true, position: horizontal ? 'right' : 'top', color: '#ded7c3', fontSize: 13 } }],
  }
}

function RegionMap({ districts }: { districts: { name: string; value: number }[] }) {
  const features = useMemo(() => {
    const points = boundaries.features.flatMap(f => f.geometry.coordinates.flatMap(p => p.flatMap(r => r)))
    const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]))
    const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]))
    return boundaries.features.map(f => ({ name: f.properties.name === '凤翔县' ? '凤翔区' : f.properties.name,
      path: f.geometry.coordinates.map(poly => poly.map(ring => ring.map((p, i) => `${i ? 'L' : 'M'}${20 + (p[0] - minX) / (maxX - minX) * 225},${12 + (maxY - p[1]) / (maxY - minY) * 156}`).join(' ') + 'Z').join(' ')).join(' '),
    }))
  }, [])
  const ranked = [...districts].sort((a, b) => b.value - a.value).filter(x => x.value > 0)
  return <div className="ops-region"><svg viewBox="0 0 265 180" role="img" aria-label="宝鸡区县器铭资源分布图">{features.map(f => {
    const count = districts.find(d => d.name === f.name)?.value || 0
    return <path key={f.name} d={f.path} fill={count ? '#53826a' : '#223e31'} fillRule="evenodd" stroke={count ? '#cfb571' : '#55705b'} strokeWidth=".85"><title>{f.name}：{count} 件已审核器铭</title></path>
  })}</svg><div className="ops-region-rank">{ranked.slice(0, 5).map((d, i) => <div key={d.name}><span><em>{String(i + 1).padStart(2, '0')}</em>{d.name}</span><b>{d.value}<small>件</small></b></div>)}{!ranked.length && <p>尚无器铭区县记录</p>}<small className="ops-map-note">宝鸡 12 区县 · DataV 行政边界</small></div></div>
}

export default function OpsDashboard() {
  const [days, setDays] = useState(14)
  const { data, error, refetch, isFetching } = useQuery({ queryKey: ['dash-ops', days], queryFn: () => api.get(`/dash/ops?days=${days}`), refetchInterval: 30_000, placeholderData: previous => previous })
  const root = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const nav = useNavigate()
  useEffect(() => {
    const el = root.current
    if (!el) return
    const fit = () => setScale(Math.min(el.clientWidth / 1920, el.clientHeight / 1000))
    const observer = new ResizeObserver(fit)
    observer.observe(el); fit()
    return () => observer.disconnect()
  }, [])
  const link = (title: string, path: string) => <button className="ops-panel-link" onClick={() => nav(path)} aria-label={title}>{title}<ArrowRightOutlined /></button>
  if (error && !data) return <div className="ops-console ops-loading" ref={root}><p>运营数据暂时无法读取</p><Button onClick={() => refetch()}>重新加载</Button></div>
  const d = data
  const roles = d ? Object.entries(d.users.by_role).map(([name, value]) => ({ name: ROLE[name] || name, value: value as number })) : []
  const trends = d ? { tooltip: { ...tooltip, trigger: 'axis' }, color: [GREEN, GOLD], legend: { right: 18, top: 0, itemWidth: 14, textStyle: { color: DIM, fontSize: 13 } },
    grid: { left: 40, right: 24, top: 30, bottom: 23 },
    xAxis: { type: 'category', boundaryGap: false, data: d.trend.map((x: any) => x.date.slice(5)), ...axis, splitLine: { show: false } }, yAxis: { type: 'value', minInterval: 1, ...axis },
    series: [{ name: '文献问答', type: 'line', smooth: true, showSymbol: false, data: d.trend.map((x: any) => x.qa), lineStyle: { width: 2 }, areaStyle: { color: '#72b59a24' } },
      { name: '拓片释读', type: 'line', smooth: true, showSymbol: false, data: d.trend.map((x: any) => x.vision), lineStyle: { width: 2 }, areaStyle: { color: '#d5b77715' } }],
  } : {}
  return <div className="ops-console" id="ops-root" ref={root}>
    {!d ? <div className="ops-loading"><Spin /></div> : <div className="ops-canvas" style={{ transform: `scale(${scale})`, left: `calc(50% - ${960 * scale}px)`, top: `calc(50% - ${500 * scale}px)` }}>
      <header className="ops-masthead"><div className="ops-brandline"><span>宅兹</span><div>周秦出土文献智能研究平台<small>OPERATIONS & INTELLIGENCE</small></div></div><div className="ops-board-title"><h1>平台综合运营态势</h1><p>知识资产 · 研究智能体 · 协作育人 · 可信治理</p></div><div className="ops-controls"><span className="ops-live"><i />{error ? '连接异常 · 显示上次数据' : '数据实时汇聚'}</span><OpsClock /><div className="ops-period" aria-label="趋势统计周期">{[7, 14, 30].map(n => <button key={n} aria-pressed={days === n} className={days === n ? 'active' : ''} onClick={() => setDays(n)}>{n} 天</button>)}<button onClick={() => refetch()} aria-label="刷新运营数据" disabled={isFetching}><ReloadOutlined spin={isFetching} /></button></div></div></header>
      <div className="ops-kpis">{[
        { label: '已审核资料', value: d.assets.total, unit: '条', detail: '器铭 / 铭文 / 字形 / 方言 / 文献', icon: <DatabaseOutlined /> },
        { label: '知识图谱实体', value: d.assets.kg_nodes, unit: '个', detail: `${number(d.assets.kg_edges)} 条语义关联`, icon: <ClusterOutlined /> },
        { label: '平台用户', value: d.users.total, unit: '人', detail: `今日新增 ${d.users.new_today} 人`, icon: <TeamOutlined /> },
        { label: '今日活跃', value: d.users.dau, unit: '人', detail: '按今日登录用户去重', icon: <RadarChartOutlined /> },
        { label: '智能体累计调用', value: d.model.calls, unit: '次', detail: `${number(d.answers)} 条辅助回答`, icon: <RobotOutlined /> },
        { label: '任务累计提交', value: d.tasks.submitted, unit: '份', detail: `${d.tasks.pending} 份等待审核`, icon: <AuditOutlined /> },
      ].map((k, i) => <div className="ops-kpi-tile" key={k.label}><div className="ops-kpi-icon">{k.icon}</div><div><h2>{k.label}</h2><strong>{number(k.value)}<small>{k.unit}</small></strong><p>{k.detail}</p></div><span className="ops-kpi-index">0{i + 1}</span></div>)}</div>
      <div className="ops-main-grid">
        <div className="ops-stack">
          <Panel title="协作用户结构" cap="COLLABORATION" extra={link('用户管理', '/admin/users')}><div className="ops-split"><div className="ops-user-ring"><EChart height="100%" option={donut(roles)} /><div><strong>{d.users.total}</strong><small>平台用户</small></div></div><div className="ops-legend">{roles.map((x, i) => <div key={x.name}><span><i style={{ background: COLORS[i] }} />{x.name}</span><b>{x.value}<small>人</small></b></div>)}</div></div></Panel>
          <Panel title="用户活跃趋势" cap={`LAST ${d.days} DAYS`}><EChart height="100%" option={bars(d.users.dau_trend.map((x: any) => ({ name: x.date.slice(5), value: x.dau })))} /></Panel>
        </div>
        <div className="ops-center-stack">
          <Panel title="知识资产与智能体协同" cap="KNOWLEDGE INTELLIGENCE" className="ops-hub-panel" extra={<span className="ops-mini-tag">{d.knowledge.agents.filter((a: any) => a.enabled).length} / {d.knowledge.agents.length} 智能体启用</span>}>
            <div className="ops-asset-hub"><div className="ops-asset-list">{d.assets.by_type.slice(0, 3).map((x: any, i: number) => <div key={x.name}><i style={{ background: COLORS[i] }} /><span>{x.name}</span><b>{number(x.value)}<small>条</small></b></div>)}</div><div className="ops-asset-orbit"><div className="ops-orbit-line" /><EChart height="100%" option={donut(d.assets.by_type)} /><div className="ops-orbit-core"><span>知识资产总量</span><strong>{number(d.assets.total)}</strong><small>已审核资料 / 条</small></div></div><div className="ops-asset-list">{d.assets.by_type.slice(3).map((x: any, i: number) => <div key={x.name}><i style={{ background: COLORS[i + 3] }} /><span>{x.name}</span><b>{number(x.value)}<small>条</small></b></div>)}<div className="ops-asset-graph"><ClusterOutlined /><span>语义关系</span><b>{number(d.assets.kg_edges)}<small>条</small></b></div></div></div>
            <div className="ops-pipeline">{[['资料汇聚', `${d.assets.total} 条已审核`], ['知识检索', `${d.knowledge.chunks} 个公开分段`], ['智能体辅助', `${d.model.calls} 次运行`], ['专家治理', `${d.trust.adjudicated} 条已裁断`]].map(([title, count], i) => <div key={title}><em>0{i + 1}</em><span>{title}<small>{count}</small></span>{i < 3 && <ArrowRightOutlined />}</div>)}</div>
          </Panel>
          <Panel title="智能体服务趋势" cap={`LAST ${d.days} DAYS`} extra={<span className="ops-panel-sub">按平台调用记录统计</span>}><EChart height="100%" option={trends} /></Panel>
        </div>
        <div className="ops-stack">
          <Panel title="智能体与知识库" cap="AGENT SERVICES" extra={link('配置', '/admin/agents')}><div className="ops-knowledge-numbers"><div><strong>{d.knowledge.bases}</strong><span>自建知识库</span></div><div><strong>{d.knowledge.published}<small> / {d.knowledge.documents}</small></strong><span>发布 / 全部资料</span></div><div><strong>{d.knowledge.training_runs}</strong><span>索引训练记录</span></div></div><div className="ops-agent-status">{d.knowledge.agents.map((a: any) => <div key={a.id}><span><i className={a.enabled ? 'on' : ''} />{a.name}</span><small>{a.collections} 类资料 · {a.bases} 个自建库</small></div>)}</div><div className="ops-model-mode"><span>当前模型</span><b title={d.model_name}>{d.model_name}</b></div></Panel>
          <Panel title="审核与可信质量" cap="TRUST & GOVERNANCE"><div className="ops-backlogs">{[[d.queues.assets, '资料待审', '/workbench/records'], [d.queues.tasks, '任务待审', '/workbench/submissions'], [d.queues.adjudications, '专家待裁', '/workbench/adjudications']].map(([value, label, path]) => <button key={label as string} onClick={() => nav(path as string)}><strong>{value}</strong><span>{label}</span></button>)}</div><div className="ops-quality">{[[d.trust.citation_accuracy, '引证准确率'], [d.trust.unsourced_rate, '无出处断言率'], [d.trust.adoption_rate, '专家采纳率']].map(([value, label]) => <div key={label as string}><b>{value == null ? '—' : `${value}%`}</b><span>{label}</span></div>)}</div><p className="ops-quality-note">已抽检 {d.trust.sampled} 条 · 已裁断 {d.trust.adjudicated} 条</p></Panel>
        </div>
      </div>
      <div className="ops-bottom-grid">
        <Panel title="单位协作分布" cap="ORGANIZATIONS"><EChart height="100%" option={bars(Object.entries(d.users.by_org).map(([name, value]) => ({ name, value: value as number })).reverse(), GREEN, true)} /></Panel>
        <Panel title="宝鸡文化资源分布" cap="BAOJI RESOURCES"><RegionMap districts={d.assets.districts} /></Panel>
        <Panel title="积分流转与模型消耗" cap="RESOURCES & USAGE" extra={link('积分流水', '/admin/points')}><div className="ops-cost-layout"><div className="ops-point-bars">{[[d.points.granted, '累计发放', GREEN], [d.points.consumed, '累计消耗', GOLD], [d.points.task_reward, '任务奖励', '#9aab81']].map(([value, label, color]) => <div key={label as string}><span>{label}<b>{number(value as number)}</b></span><i><em style={{ width: `${Math.max(0, Number(value)) / Math.max(d.points.granted, d.points.consumed, d.points.task_reward, 1) * 100}%`, background: color as string }} /></i></div>)}</div><div className="ops-consumption"><div><span>输入 / 输出 token</span><b>{number(d.model.tokens_in)} / {number(d.model.tokens_out)}</b></div><div><span>平均响应</span><b>{d.model.calls ? `${d.model.avg_latency} ms` : '—'}</b></div><div><span>调用成功率</span><b>{d.model.calls ? `${Math.round((100 - d.model.fail_rate) * 10) / 10}%` : '—'}</b></div><div><span>估算费用</span><b>¥{d.model.cost.toFixed(2)}</b></div></div></div></Panel>
        <Panel title="平台最新动态" cap="LIVE ACTIVITY" extra={link('审计', '/admin/audit')}><div className="ops-events">{d.events.slice(0, 5).map((e: any) => <div key={e.id}><time>{e.at.slice(11, 16)}</time><span><b>{e.action}</b><small title={e.target}>{e.target || '平台操作'}</small></span><i /></div>)}{!d.events.length && <p>暂无平台操作记录</p>}</div><div className="ops-notice-summary"><span>站内通知送达 <b>{d.notifications.total}</b></span><span>已读 <b>{d.notifications.read}</b></span><span>未读 <b>{d.notifications.unread}</b></span></div></Panel>
      </div>
      <footer className="ops-statusbar"><span><i />宅兹 · 证据可循，学术可证</span><span>累计指标与趋势周期分别统计 · 数据每 30 秒更新 · 费用按配置单价估算</span><span>更新于 {d.updated_at.replace('T', ' ')}</span></footer>
    </div>}
  </div>
}
