import { useNavigate } from 'react-router-dom'
import { App, Button, Form, Input } from 'antd'
import { api } from '../api'
import { useAuth } from '../store'

export default function ChangePassword() {
  const { user, setSession, logout } = useAuth()
  const nav = useNavigate()
  const { message } = App.useApp()
  if (!user) {
    nav('/login', { replace: true })
    return null
  }
  const onFinish = async (v: any) => {
    try {
      const d = await api.post('/auth/change-password', { old_password: v.old, new_password: v.pwd })
      setSession(d.access_token, d.user)
      message.success('密码已修改')
      nav('/', { replace: true })
    } catch (e: any) {
      message.error(e.message)
    }
  }
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'radial-gradient(1000px 600px at 50% 40%, #13201c, #070a09)' }}>
      <div className="panel glow rise" style={{ width: 460, padding: '40px 40px 30px' }}>
        <div className="eyebrow">SECURITY / 账号安全</div>
        <div className="serif" style={{ fontSize: 28, margin: '10px 0 6px' }}>{user.must_change_pwd ? '首次登录，请修改初始密码' : '修改密码'}</div>
        <div className="note" style={{ marginBottom: 24 }}>{user.name}（{user.account}）· 新密码至少 8 位，且须同时包含字母和数字。</div>
        <Form layout="vertical" size="large" onFinish={onFinish}>
          <Form.Item name="old" label="原密码" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="pwd"
            label="新密码"
            rules={[{ required: true }, { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/, message: '至少 8 位，含字母和数字' }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="pwd2"
            label="确认新密码"
            dependencies={['pwd']}
            rules={[{ required: true }, ({ getFieldValue }) => ({ validator: (_, v) => (v === getFieldValue('pwd') ? Promise.resolve() : Promise.reject(new Error('两次输入不一致'))) })]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button htmlType="submit" block className="btn-gold" style={{ height: 48 }}>确认修改</Button>
        </Form>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          {user.must_change_pwd ? <a onClick={() => { logout(); nav('/login') }}>退出登录</a> : <a onClick={() => nav(-1)}>返回</a>}
        </div>
      </div>
    </div>
  )
}
