import { lazy, Suspense, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Checkbox, Form, Input } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import { api } from '../api'
import { useAuth, useSite } from '../store'

const LoginScene = lazy(() => import('../three/LoginScene'))

function webglOk() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export default function Login() {
  const nav = useNavigate()
  const loc = useLocation() as any
  const { user, setSession } = useAuth()
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const [gl] = useState(webglOk)
  const remembered = localStorageGet('zz_account')
  const site = useSite()

  useEffect(() => {
    if (user) nav(user.must_change_pwd ? '/change-password' : loc.state?.from || '/', { replace: true })
  }, [user, nav, loc.state])

  const onFinish = async (v: { account: string; password: string; remember: boolean }) => {
    setErr('')
    setLoading(true)
    try {
      const d = await api.post('/auth/login', { account: v.account, password: v.password })
      if (v.remember) localStorageSet('zz_account', v.account)
      else localStorageSet('zz_account', '')
      setSession(d.access_token, d.user)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onMouseMove={(e) => setMouse({ x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 })}
      style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'radial-gradient(1200px 700px at 55% 45%, #13201c, #070a09 70%)' }}
    >
      {/* 底层：去色场景底图，随鼠标轻微视差（全形拓高清图到位后替换） */}
      <div
        style={{
          position: 'absolute', inset: -40, opacity: 0.16, filter: 'grayscale(1) contrast(1.15)',
          background: "url('/img/hero.jpg') center/cover no-repeat",
          transform: `translate(${mouse.x * -18}px, ${mouse.y * -12}px)`, transition: 'transform 600ms var(--ease)',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(7,10,9,.92) 0%, rgba(7,10,9,.35) 40%, rgba(7,10,9,.35) 62%, rgba(7,10,9,.9) 100%)' }} />

      {/* 中层/上层：3D 粒子场景 */}
      <div style={{ position: 'absolute', left: '22%', right: '22%', top: 0, bottom: 0 }}>
        {gl ? (
          <Suspense fallback={null}>
            <LoginScene />
          </Suspense>
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', opacity: 0.5 }} className="serif">
            <span style={{ fontSize: 120, color: 'var(--gold)' }}>尊</span>
          </div>
        )}
      </div>

      <div style={{ position: 'absolute', left: '6.5vw', top: '22vh', maxWidth: 560 }} className="rise">
        <div className="eyebrow">ZHOU-QIN · RESEARCH PLATFORM</div>
        <div className="hero-title" style={{ fontSize: 112, margin: '18px 0 10px' }}>宅兹</div>
        <div className="serif" style={{ fontSize: 30, letterSpacing: 10, color: '#efe9d8' }}>周秦出土文献智能研究平台</div>
        <div className="serif" style={{ fontSize: 20, letterSpacing: 8, color: '#d8d2c0', marginTop: 46, lineHeight: 2 }}>
          让沉睡的文字，在数字世界再次发声。
          <br />人机协同 · 可信释读 · 证据可溯
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 34 }}>
          <span className="chip">◈ 青铜铭文</span>
          <span className="chip">◎ 三维图谱</span>
          <span className="chip">✦ 智能释读</span>
        </div>
      </div>

      <div
        className="float-panel rise"
        style={{ right: '6vw', top: 'calc(50% - 250px)', width: 440, padding: '44px 40px 34px', animationDelay: '200ms' }}
      >
        <div className="eyebrow">AUTHORIZED ACCESS / 授权访问</div>
        <div className="serif" style={{ fontSize: 30, margin: '10px 0 28px', letterSpacing: 2 }}>欢迎进入宅兹</div>
        {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" size="large" onFinish={onFinish} initialValues={{ account: remembered, remember: !!remembered }}>
          <Form.Item name="account" rules={[{ required: true, message: '请输入账号' }]}>
            <Input placeholder="账号 / 学工号 / 手机号" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="密码" autoComplete="current-password" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox>记住账号</Checkbox>
            </Form.Item>
            <a onClick={() => setErr('平台不开放自助找回，请联系平台管理员重置密码。')}>忘记密码？</a>
          </div>
          <Button htmlType="submit" block loading={loading} className="btn-gold" style={{ height: 52, fontSize: 17, letterSpacing: 6 }}>
            登录 <ArrowRightOutlined />
          </Button>
        </Form>
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 26, paddingTop: 18 }} className="note">
          平台仅面向授权研究人员与协作用户开放。
          <br />首次登录需修改初始密码；连续输错 5 次将锁定 15 分钟。
        </div>
      </div>

      <div style={{ position: 'absolute', left: '6.5vw', bottom: 34, fontSize: 13, letterSpacing: 2 }} className="dim">
        {site.orgLine || '周秦出土文献智能研究 · 人机协同可信释读'}
      </div>
      <div style={{ position: 'absolute', right: 24, bottom: 14, fontSize: 11 }} className="dim">
        何尊粒子由藏品照片深度采样生成，属艺术化呈现，非文物三维数字化成果{site.imageCredit ? ` · ${site.imageCredit}` : ''}
      </div>
    </div>
  )
}

function localStorageGet(k: string) {
  try {
    return localStorage.getItem(k) || ''
  } catch {
    return ''
  }
}
function localStorageSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* 隐私模式下忽略 */
  }
}
