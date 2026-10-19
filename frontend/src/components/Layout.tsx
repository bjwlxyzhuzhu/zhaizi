import { RareText } from './RareText'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Badge, ConfigProvider, Drawer, Dropdown, Empty, Input, Modal } from 'antd'
import {
  AppstoreOutlined, BellOutlined, CheckSquareOutlined, ClusterOutlined, DashboardOutlined, DatabaseOutlined,
  ExperimentOutlined, HomeOutlined, LogoutOutlined, SearchOutlined, SettingOutlined, UserOutlined, KeyOutlined, MenuOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { can, useAuth, useSite } from '../store'
import { paperTheme } from '../theme'

interface NavItem {
  to: string
  label: string
  icon: JSX.Element
  show: boolean
  match: string[]
  subs?: { to: string; label: string; show?: boolean }[]
}

const PAPER = ['/library', '/workbench', '/tasks', '/me', '/admin']

export default function Layout() {
  const { user, logout } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [openNav, setOpenNav] = useState<string | null>(null)
  const role = user?.role
  const site = useSite()
  const { data: notes, refetch } = useQuery({ queryKey: ['notifications', user?.id], queryFn: () => api.get('/auth/notifications'), refetchInterval: 60_000 })
  const unread = (notes || []).filter((n: any) => !n.read).length

  useEffect(() => {
    window.scrollTo(0, 0)
    setMenuOpen(false)
    setOpenNav(null)
  }, [loc.pathname])
  useEffect(() => { if (noticeOpen) refetch() }, [noticeOpen, refetch])

  const items: NavItem[] = [
    { to: '/', label: '首页', icon: <HomeOutlined />, show: true, match: ['/'] },
    {
      to: '/library/vessels', label: '资料库', icon: <DatabaseOutlined />, show: true, match: ['/library'],
      subs: [
        { to: '/library/vessels', label: '器铭库' }, { to: '/library/characters', label: '字形谱系' },
        { to: '/library/dialects', label: '关陇方言' }, { to: '/library/texts', label: '传世文献' },
      ],
    },
    {
      to: '/qa', label: '研究智能体', icon: <ExperimentOutlined />, show: true, match: ['/qa'],
      subs: [{ to: '/qa', label: '文献问答智能体' }, { to: '/qa/vision', label: '拓片释读智能体' }],
    },
    { to: '/graph', label: '知识图谱', icon: <ClusterOutlined />, show: true, match: ['/graph'] },
    { to: '/tasks', label: '任务中心', icon: <CheckSquareOutlined />, show: can.tasks(role), match: ['/tasks'] },
    {
      to: '/workbench/records', label: '研究工作台', icon: <AppstoreOutlined />, show: can.review(role), match: ['/workbench'],
      subs: [
        { to: '/workbench/records', label: role === 'admin' ? '数据审核（只读）' : '数据录入与审核' },
        { to: '/workbench/adjudications', label: role === 'admin' ? '裁断队列（只读）' : '专家裁断' },
        { to: '/workbench/graph-editor', label: '图谱编辑', show: can.research(role) },
        { to: '/workbench/submissions', label: '任务审核' },
      ],
    },
    { to: '/dashboard', label: '数据驾驶舱', icon: <DashboardOutlined />, show: can.dashboard(role), match: ['/dashboard'],
      subs: [{ to: '/dashboard', label: '宝鸡三维大屏' }, { to: '/dashboard?view=progress', label: '建设进度' }, { to: '/dashboard?view=ops', label: '运营视图', show: can.admin(role) }] },
    {
      to: '/admin/users', label: '管理后台', icon: <SettingOutlined />, show: can.admin(role), match: ['/admin'],
      subs: [
        { to: '/admin/users', label: '用户管理' }, { to: '/admin/import', label: 'Excel 导入' },
        { to: '/admin/points', label: '积分流水' }, { to: '/admin/rules', label: '积分规则' },
        { to: '/admin/tasks', label: '任务模板' }, { to: '/admin/audit', label: '审计日志' },
        { to: '/admin/settings', label: '模型与 API 设置' },
        { to: '/admin/notifications', label: '站内通知' },
        { to: '/admin/agents', label: '智能体与知识库' },
      ],
    },
  ]
  const visible = items.filter((i) => i.show)
  const isActive = (i: NavItem) => i.match.some((m) => (m === '/' ? loc.pathname === '/' : loc.pathname.startsWith(m)))
  const paper = PAPER.some((p) => loc.pathname.startsWith(p))
  const fullBleed = loc.pathname.startsWith('/dashboard')

  const content = (
    <main className={`main ${paper ? 'paper' : ''}`}>
      {paper && <div className="paper-bg" />}
      <Outlet />
    </main>
  )

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand" onClick={() => nav('/')}>
          <span className="brand-mark">宅兹</span>
          <div>
            <div className="brand-title">周秦出土文献智能研究平台</div>
            <div className="brand-sub">ZHAI ZI · RESEARCH FOR ZHOU-QIN DOCUMENTS</div>
          </div>
        </div>
        <nav className="topnav">
          {visible.map((i) => i.subs ? <Dropdown key={i.to} trigger={['hover', 'click']} placement="bottom" overlayClassName="topnav-dropdown"
            open={openNav === i.to} onOpenChange={open => setOpenNav(open ? i.to : null)}
            menu={{ items: i.subs.filter(s => s.show !== false).map(s => ({ key: s.to, label: s.label })), onClick: ({ key }) => { setOpenNav(null); nav(key) } }}>
            <button className={`topnav-trigger ${isActive(i) ? 'active' : ''}`}>{i.label}<span className="nav-chevron">⌄</span></button>
          </Dropdown> : <NavLink key={i.to} to={i.to} className={isActive(i) ? 'active' : ''}>{i.label}</NavLink>)}
        </nav>
        <div className="topbar-right">
          {role === 'user' ? (
            <span className="pill" title="我的积分" onClick={() => nav('/me')} style={{ cursor: 'pointer' }}>
              积分 {user?.points ?? 0}
            </span>
          ) : (
            <span className="pill">{user?.role_label} · 智能体调用免积分</span>
          )}
          <span className="icon-btn" title="跨库检索" onClick={() => setSearchOpen(true)}>
            <SearchOutlined />
          </span>
          <Badge count={unread} size="small" offset={[-4, 4]}>
            <span className="icon-btn" title="站内消息" onClick={() => setNoticeOpen(true)}>
              <BellOutlined />
            </span>
          </Badge>
          <Dropdown
            menu={{
              items: [
                { key: 'me', icon: <UserOutlined />, label: '个人中心', onClick: () => nav('/me') },
                { key: 'pwd', icon: <KeyOutlined />, label: '修改密码', onClick: () => nav('/change-password') },
                { type: 'divider' },
                { key: 'out', icon: <LogoutOutlined />, label: '退出登录', onClick: () => { logout(); nav('/login') } },
              ],
            }}
          >
            <div className="user-chip">
              <div className="avatar">{user?.name?.slice(0, 1)}</div>
              <div>
                <div className="n">{user?.name}</div>
                <div className="r">{user?.role_label}{user?.is_super ? ' · 超级管理员' : ''}</div>
              </div>
            </div>
          </Dropdown>
        </div>
      </header>
      <div className="body">
        <button className="workspace-launcher" aria-label="展开功能入口" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><MenuOutlined /><span>功能入口</span></button>
        {paper ? <ConfigProvider theme={paperTheme}>{content}</ConfigProvider> : content}
      </div>

      <Drawer title="研究空间 · 功能入口" placement="left" width={740} open={menuOpen} destroyOnClose onClose={() => setMenuOpen(false)}>
        <p className="note" style={{ marginBottom: 22 }}>选择研究服务；点击卡片展开二级功能。</p>
        <div className="workspace-cards">{visible.map(i => i.subs ? <details key={i.to} className="workspace-card">
          <summary>{i.icon}<strong>{i.label}</strong><span>展开选择 ＋</span></summary>
          <div>{i.subs.filter(s => s.show !== false).map(s => <NavLink key={s.to} to={s.to} onClick={() => setMenuOpen(false)}>{s.label} →</NavLink>)}</div>
        </details> : <button key={i.to} className="workspace-card" onClick={() => { nav(i.to); setMenuOpen(false) }}>{i.icon}<strong>{i.label}</strong><span>进入 →</span></button>)}</div>
      </Drawer>

      <Drawer
        title="站内消息"
        open={noticeOpen}
        width={420}
        onClose={() => setNoticeOpen(false)}
        extra={<a onClick={() => api.post('/auth/notifications/read-all').then(() => refetch())}>全部已读</a>}
      >
        {(notes || []).length === 0 ? (
          <Empty description="暂无消息" />
        ) : (
          (notes || []).map((n: any) => (
            <div key={n.id} className="row-line" style={{ alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: n.read ? 400 : 600 }}><RareText>{n.title}</RareText></div>
                {n.body && <div className="note" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><RareText>{n.body}</RareText></div>}
              </div>
              <span className="note" style={{ whiteSpace: 'nowrap' }}>{n.created_at.replace('T', ' ')}</span>
            </div>
          ))
        )}
      </Drawer>

      <Modal title="跨库检索" open={searchOpen} footer={null} onCancel={() => setSearchOpen(false)} destroyOnClose>
        <Input.Search
          autoFocus
          placeholder="器名、字头、方言词条或文献关键词"
          enterButton="检索"
          onSearch={(q) => {
            setSearchOpen(false)
            if (!q.trim()) return
            if (Array.from(q.trim()).length === 1) nav(`/library/characters/${encodeURIComponent(q.trim())}`)
            else nav(`/library/vessels?q=${encodeURIComponent(q.trim())}`)
          }}
        />
        <div className="note" style={{ marginTop: 10 }}>单字跳转字形谱系；词语在器铭库中检索，也可前往“AI释读”提问。</div>
      </Modal>
    </div>
  )
}
