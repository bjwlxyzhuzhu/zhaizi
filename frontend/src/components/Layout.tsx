import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Badge, ConfigProvider, Drawer, Dropdown, Empty, Input, Modal } from 'antd'
import {
  AppstoreOutlined, BellOutlined, CheckSquareOutlined, ClusterOutlined, DashboardOutlined, DatabaseOutlined,
  ExperimentOutlined, HomeOutlined, LogoutOutlined, SearchOutlined, SettingOutlined, UserOutlined, KeyOutlined,
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
  const role = user?.role
  const site = useSite()
  const { data: notes, refetch } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get('/auth/notifications'), refetchInterval: 60_000 })
  const unread = (notes || []).filter((n: any) => !n.read).length

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [loc.pathname])

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
      to: '/qa', label: 'AI释读', icon: <ExperimentOutlined />, show: true, match: ['/qa'],
      subs: [{ to: '/qa', label: '可信问答' }, { to: '/qa/vision', label: '拓片图像释读' }],
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
    { to: '/dashboard', label: '数据驾驶舱', icon: <DashboardOutlined />, show: can.dashboard(role), match: ['/dashboard'] },
    {
      to: '/admin/users', label: '管理后台', icon: <SettingOutlined />, show: can.admin(role), match: ['/admin'],
      subs: [
        { to: '/admin/users', label: '用户管理' }, { to: '/admin/import', label: 'Excel 导入' },
        { to: '/admin/points', label: '积分流水' }, { to: '/admin/rules', label: '积分规则' },
        { to: '/admin/tasks', label: '任务模板' }, { to: '/admin/audit', label: '审计日志' },
        { to: '/admin/settings', label: '系统设置', show: !!user?.is_super },
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
          {visible.map((i) => (
            <NavLink key={i.to} to={i.to} className={isActive(i) ? 'active' : ''}>
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          {role === 'user' ? (
            <span className="pill" title="我的积分" onClick={() => nav('/me')} style={{ cursor: 'pointer' }}>
              积分 {user?.points ?? 0}
            </span>
          ) : (
            <span className="pill">{user?.role_label} · AI 调用免积分</span>
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
        {!fullBleed && (
          <aside className="sidebar">
            <div className="side-cap">WORKSPACE / 研究空间</div>
            {visible.map((i) => (
              <div key={i.to}>
                <NavLink to={i.to} className={`side-link ${isActive(i) ? 'active' : ''}`}>
                  {i.icon}
                  <span>{i.label}</span>
                </NavLink>
                {isActive(i) && i.subs && (
                  <div className="side-sub">
                    {i.subs.filter((s) => s.show !== false).map((s) => (
                      <NavLink key={s.to} to={s.to} end className={({ isActive: a }) => (a ? 'active' : '')}>
                        {s.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="side-foot">
              周秦出土文献研究
              <br />
              证据可循，学术可证
              <br />© 宅兹平台{site.orgShort ? ` · ${site.orgShort}` : ''}
            </div>
          </aside>
        )}
        {paper ? <ConfigProvider theme={paperTheme}>{content}</ConfigProvider> : content}
      </div>

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
                <div style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
                {n.body && <div className="note">{n.body}</div>}
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
            if (q.trim().length === 1) nav(`/library/characters/${encodeURIComponent(q.trim())}`)
            else nav(`/library/vessels?q=${encodeURIComponent(q.trim())}`)
          }}
        />
        <div className="note" style={{ marginTop: 10 }}>单字跳转字形谱系；词语在器铭库中检索，也可前往“AI释读”提问。</div>
      </Modal>
    </div>
  )
}
