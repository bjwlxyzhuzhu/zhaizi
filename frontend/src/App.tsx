import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import { useAuth, useSite, can, type Role } from './store'
import Layout from './components/Layout'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'

const Home = lazy(() => import('./pages/Home'))
const QA = lazy(() => import('./pages/QA'))
const Vision = lazy(() => import('./pages/Vision'))
const Vessels = lazy(() => import('./pages/library/Vessels'))
const VesselDetail = lazy(() => import('./pages/library/VesselDetail'))
const Characters = lazy(() => import('./pages/library/Characters'))
const Dialects = lazy(() => import('./pages/library/Dialects'))
const Texts = lazy(() => import('./pages/library/Texts'))
const Graph = lazy(() => import('./pages/Graph'))
const Tasks = lazy(() => import('./pages/Tasks'))
const Me = lazy(() => import('./pages/Me'))
const Records = lazy(() => import('./pages/workbench/Records'))
const Adjudications = lazy(() => import('./pages/workbench/Adjudications'))
const GraphEditor = lazy(() => import('./pages/workbench/GraphEditor'))
const Submissions = lazy(() => import('./pages/workbench/Submissions'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))
const AdminImport = lazy(() => import('./pages/admin/Import'))
const AdminPoints = lazy(() => import('./pages/admin/Points'))
const AdminRules = lazy(() => import('./pages/admin/Rules'))
const AdminTasks = lazy(() => import('./pages/admin/TaskTemplates'))
const AdminAudit = lazy(() => import('./pages/admin/Audit'))
const AdminSettings = lazy(() => import('./pages/admin/Settings'))

const Loading = () => (
  <div style={{ height: '60vh', display: 'grid', placeItems: 'center' }}>
    <Spin />
  </div>
)

function Guard({ allow, children }: { allow?: (r?: Role) => boolean; children: JSX.Element }) {
  const user = useAuth((s) => s.user)
  const loc = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />
  if (user.must_change_pwd) return <Navigate to="/change-password" replace />
  if (allow && !allow(user.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { ready, setSession, setReady } = useAuth()

  useEffect(() => useSite.getState().load(), [])
  useEffect(() => {
    // 刷新页面时用 HttpOnly 刷新令牌恢复会话
    fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => (d ? setSession(d.access_token, d.user) : setReady()))
      .catch(() => setReady())
  }, [setSession, setReady])

  if (!ready) return <Loading />

  const G = (el: JSX.Element, allow?: (r?: Role) => boolean) => <Guard allow={allow}>{el}</Guard>
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route element={G(<Layout />)}>
          <Route path="/dashboard" element={G(<Dashboard />, can.dashboard)} />
          <Route path="/" element={<Home />} />
          <Route path="/qa" element={<QA />} />
          <Route path="/qa/vision" element={<Vision />} />
          <Route path="/library" element={<Navigate to="/library/vessels" replace />} />
          <Route path="/library/vessels" element={<Vessels />} />
          <Route path="/library/vessels/:id" element={<VesselDetail />} />
          <Route path="/library/characters" element={<Characters />} />
          <Route path="/library/characters/:char" element={<Characters />} />
          <Route path="/library/dialects" element={<Dialects />} />
          <Route path="/library/texts" element={<Texts />} />
          <Route path="/graph" element={<Graph />} />
          <Route path="/tasks" element={G(<Tasks />, can.tasks)} />
          <Route path="/me" element={<Me />} />
          <Route path="/workbench" element={<Navigate to="/workbench/records" replace />} />
          <Route path="/workbench/records" element={G(<Records />, can.review)} />
          <Route path="/workbench/adjudications" element={G(<Adjudications />, can.review)} />
          <Route path="/workbench/graph-editor" element={G(<GraphEditor />, can.research)} />
          <Route path="/workbench/submissions" element={G(<Submissions />, can.review)} />
          <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
          <Route path="/admin/users" element={G(<AdminUsers />, can.admin)} />
          <Route path="/admin/import" element={G(<AdminImport />, can.admin)} />
          <Route path="/admin/points" element={G(<AdminPoints />, can.admin)} />
          <Route path="/admin/rules" element={G(<AdminRules />, can.admin)} />
          <Route path="/admin/tasks" element={G(<AdminTasks />, can.admin)} />
          <Route path="/admin/audit" element={G(<AdminAudit />, can.admin)} />
          <Route path="/admin/settings" element={G(<AdminSettings />, can.admin)} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
