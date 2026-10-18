import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Progress, Skeleton } from 'antd'
import {
  ArrowRightOutlined, AuditOutlined, CameraOutlined, CheckSquareOutlined, ClusterOutlined, DatabaseOutlined,
  FileTextOutlined, MessageOutlined, PictureOutlined, SearchOutlined, StarOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { useAuth } from '../store'
import { VesselImg, imgUrl } from '../components/ui'

const TABS = ['AI 文字问答', '图像释读', '资料检索', '跨库检索']
const EXAMPLES = ['何尊铭文中“宅兹中国”是什么意思？', '毛公鼎记载了什么事？', '虢季子白盘与《诗经·六月》', '宝鸡出土的西周重器有哪些']

export default function Home() {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)!
  const [tab, setTab] = useState(0)
  const [q, setQ] = useState('')
  const [libTab, setLibTab] = useState<'vessels' | 'glyphs' | 'dialects' | 'texts'>('vessels')
  const [pick, setPick] = useState(0)
  const { data: latest } = useQuery({ queryKey: ['latest'], queryFn: () => api.get('/lib/latest') })
  const { data: home } = useQuery({ queryKey: ['home'], queryFn: () => api.get('/dash/home') })
  const { data: pts } = useQuery({ queryKey: ['points-me'], queryFn: () => api.get('/points/me'), enabled: user.role === 'user' })

  const go = (text = q) => {
    const t = text.trim()
    if (tab === 1) return nav('/qa/vision' + (t ? `?hint=${encodeURIComponent(t.slice(0, 1))}` : ''))
    if (!t) return
    if (tab === 0) nav(`/qa?q=${encodeURIComponent(t)}`)
    else if (t.length === 1) nav(`/library/characters/${encodeURIComponent(t)}`)
    else nav(`/library/vessels?q=${encodeURIComponent(t)}`)
  }

  const picks = (latest?.vessels || []).filter((v: any) => v.image)
  const featured = picks[pick % Math.max(picks.length, 1)]
  const m = home?.metrics

  const entries = [
    { t: 'AI 文字问答', d: '基于自建数据库的可信回答', i: <MessageOutlined />, to: '/qa' },
    { t: '图像释读', d: '上传拓片 · 智能识别与释读', i: <PictureOutlined />, to: '/qa/vision' },
    { t: '知识图谱', d: '三维关联 · 纵观文明脉络', i: <ClusterOutlined />, to: '/graph' },
    { t: '资料库', d: '器铭 · 字形 · 方言 · 传世文献', i: <DatabaseOutlined />, to: '/library/vessels' },
    user.role === 'user'
      ? { t: '任务中心', d: '参与标注与校对 · 赚取积分', i: <CheckSquareOutlined />, to: '/tasks' }
      : { t: '研究工作台', d: '录入 · 审核 · 专家裁断', i: <AuditOutlined />, to: '/workbench/records' },
  ]

  return (
    <div className="page" style={{ maxWidth: 1760 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20 }}>
        <section className="hero rise">
          <div className="hero-inner">
            <div className="eyebrow">WHERE HERITAGE MEETS INTELLIGENCE</div>
            <div className="hero-title">宅兹中国</div>
            <div className="hero-sub">从一件青铜器，走进三千年的文明叙事</div>
            <div className="hero-tags">人机协同 · 可信释读 · 证据可溯 · 数智活化</div>
            <div className="search-tabs">
              {TABS.map((t, i) => (
                <span key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</span>
              ))}
            </div>
            <div className="searchbox">
              <div className="search-input">
                <SearchOutlined style={{ color: '#7d847f' }} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && go()}
                  placeholder={tab === 1 ? '可输入疑似字作提示，回车前往上传拓片' : tab === 0 ? '请输入问题，例如：何尊的“宅兹中国”是什么意思？' : '器名、时代、出土地、字头或著录'}
                />
                <CameraOutlined style={{ color: '#7d847f', cursor: 'pointer', fontSize: 18 }} title="上传拓片释读" onClick={() => nav('/qa/vision')} />
              </div>
              <button className="search-go" onClick={() => go()} aria-label="开始">
                <ArrowRightOutlined />
              </button>
            </div>
            <div className="examples">
              <span className="dim">示例问题：</span>
              {EXAMPLES.map((e) => (
                <span key={e} className="chip" onClick={() => { setTab(0); nav(`/qa?q=${encodeURIComponent(e)}`) }}>{e}</span>
              ))}
            </div>
          </div>
        </section>

        <aside className="panel glow rise" style={{ display: 'flex', flexDirection: 'column', animationDelay: '120ms' }}>
          <div className="panel-head" style={{ marginBottom: 12 }}>
            <span className="panel-title">今日荐览</span>
            {picks.length > 1 && (
              <span className="dim" style={{ fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                <span onClick={() => setPick((p) => (p + picks.length - 1) % picks.length)}>‹</span>
                {'  '}{(pick % picks.length) + 1} / {picks.length}{'  '}
                <span onClick={() => setPick((p) => (p + 1) % picks.length)}>›</span>
              </span>
            )}
          </div>
          {featured ? (
            <>
              <div style={{ height: 210, borderRadius: 12, background: `url(${imgUrl(featured.image)}) center/cover`, border: '1px solid var(--line)' }} />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '16px 0 6px', flexWrap: 'wrap' }}>
                <span className="serif" style={{ fontSize: 30 }}>{featured.name}</span>
                <span className="tag-gold">{featured.period.split('（')[0]}</span>
              </div>
              <div className="note" style={{ fontSize: 13 }}>{featured.find_place} · {featured.collection}</div>
              <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                <span className="chip" onClick={() => nav(`/library/vessels/${featured.id}`)}>查看详情 <ArrowRightOutlined /></span>
              </div>
            </>
          ) : (
            <Skeleton active />
          )}
        </aside>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginTop: 20 }}>
        {entries.map((e, i) => (
          <div key={e.t} className="entry-card rise" style={{ animationDelay: `${100 + i * 60}ms` }} onClick={() => nav(e.to)}>
            <div className="ico">{e.i}</div>
            <h3>{e.t}</h3>
            <p>{e.d}</p>
            <span className="go"><ArrowRightOutlined /></span>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.25fr 1fr 1fr', marginTop: 20 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">最新入库</span>
            <a onClick={() => nav('/library/vessels')}>更多 <ArrowRightOutlined /></a>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {([['vessels', '器物铭文'], ['glyphs', '字形图录'], ['dialects', '方言条目'], ['texts', '传世文献']] as const).map(([k, t]) => (
              <span key={k} className={`chip ${libTab === k ? 'on' : ''}`} onClick={() => setLibTab(k)}>{t}</span>
            ))}
          </div>
          {!latest ? (
            <Skeleton active />
          ) : libTab === 'vessels' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {latest.vessels.slice(0, 4).map((v: any) => (
                <div key={v.id} className="vessel-card" onClick={() => nav(`/library/vessels/${v.id}`)}>
                  <VesselImg image={v.image} name={v.name} height={110} />
                  <div className="meta" style={{ padding: '10px 12px' }}>
                    <div className="nm" style={{ fontSize: 16 }}>{v.name}</div>
                    <div className="note">{v.period.split('（')[0]} · {v.district || v.find_place.slice(0, 6)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {(latest[libTab] || []).slice(0, 5).map((x: any) => (
                <div key={x.id} className="row-line" style={{ cursor: 'pointer' }}
                  onClick={() => nav(libTab === 'glyphs' ? `/library/characters/${x.character}` : libTab === 'dialects' ? '/library/dialects' : '/library/texts')}>
                  <span>{libTab === 'glyphs' ? `“${x.character}” · ${x.script}` : libTab === 'dialects' ? `${x.word} [${x.ipa}]` : `《${x.title}·${x.chapter}》`}</span>
                  <span className="note">{libTab === 'dialects' ? x.district : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => nav('/graph')}>
          <div style={{ position: 'absolute', inset: 0, background: "url('/img/kg-thumb.jpg') center/cover", opacity: 0.85 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,15,14,.85), transparent 40%, rgba(11,15,14,.9))' }} />
          <div style={{ position: 'relative', padding: '24px 26px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="panel-head">
              <span className="panel-title">知识图谱探索</span>
              <span className="dim">进入图谱 <ArrowRightOutlined /></span>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <div className="serif" style={{ fontSize: 18 }}>器 — 铭 — 字 — 音 — 义</div>
              <div className="note">
                {m ? `当前 ${m.kg_nodes} 个节点 · ${m.kg_edges} 条关系` : '加载中'}，以何尊为例逐层点亮文明网络
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">数据总览</span>
            <span className="panel-cap">已审核</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              [m?.vessels, '器铭数据'], [m?.glyphs, '字形图录'], [m?.dialects, `方言条目${m ? `（${m.dialect_districts} 区县）` : ''}`], [m?.kg_nodes, '图谱节点'],
            ].map(([v, l]) => (
              <div className="stat-card" key={l as string}>
                <div className="stat-num">{v ?? '—'}</div>
                <div className="stat-label">{l}</div>
              </div>
            ))}
          </div>
          <div className="note" style={{ marginTop: 14 }}>数据经研究员双人审核后入库；学术结论以来源与专家裁断为依据。</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', marginTop: 20 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">最新动态</span>
            <span className="panel-cap">ACTIVITY</span>
          </div>
          {(home?.feed || []).length === 0 && <div className="empty">暂无动态</div>}
          {(home?.feed || []).slice(0, 6).map((f: any, i: number) => (
            <div key={i} className="row-line">
              <span>
                <span className="tag-gold" style={{ marginRight: 10 }}>{f.kind}</span>
                {f.actor} · {f.action} · {f.target}
              </span>
              <span className="note">{f.at.replace('T', ' ').slice(5)}</span>
            </div>
          ))}
        </div>
        {user.role === 'user' ? (
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">我的积分</span>
              <a onClick={() => nav('/me')}>积分明细 <ArrowRightOutlined /></a>
            </div>
            <div className="stat-num" style={{ fontSize: 44 }}>{pts?.balance ?? user.points}</div>
            <div style={{ margin: '14px 0 4px' }} className="note">今日已用 {pts?.today_used ?? 0} / {pts?.daily_limit ?? 50}</div>
            <Progress percent={pts ? Math.round((pts.today_used / pts.daily_limit) * 100) : 0} showInfo={false} strokeColor={{ from: '#3F8F7A', to: '#C9A45C' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 18 }}>
              {[['我的任务', <CheckSquareOutlined />, '/tasks'], ['我的问答', <MessageOutlined />, '/qa'], ['字形谱系', <StarOutlined />, '/library/characters'], ['积分流水', <FileTextOutlined />, '/me']].map(([t, ic, to]) => (
                <div key={t as string} className="stat-card" style={{ textAlign: 'center', cursor: 'pointer', padding: 12 }} onClick={() => nav(to as string)}>
                  <div style={{ fontSize: 22, color: 'var(--gold)' }}>{ic}</div>
                  <div className="note">{t}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">快捷入口</span>
              <span className="panel-cap">{user.role_label}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {(user.role === 'researcher'
                ? [['数据录入与审核', '/workbench/records'], ['专家裁断队列', '/workbench/adjudications'], ['任务审核', '/workbench/submissions'], ['数据驾驶舱', '/dashboard']]
                : [['用户管理', '/admin/users'], ['Excel 导入', '/admin/import'], ['积分流水', '/admin/points'], ['数据驾驶舱', '/dashboard']]
              ).map(([t, to]) => (
                <div key={t} className="stat-card" style={{ cursor: 'pointer' }} onClick={() => nav(to)}>
                  <div className="serif" style={{ fontSize: 17 }}>{t}</div>
                  <div className="note">进入 <ArrowRightOutlined /></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
