import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { api } from '../../api'
import { useAuth } from '../../store'
import { PageHead } from '../../components/ui'

const IDS = ['教师', '研究生', '本科生', '文博人员', '中小学教师', '其他']
const ROLE_OPTS = [{ value: 'user', label: '用户' }, { value: 'researcher', label: '研究员' }, { value: 'admin', label: '管理员' }]

export function PasswordReveal({ title, account, pwd, onClose }: { title: string; account?: string; pwd: string | null; onClose: () => void }) {
  return (
    <Modal title={title} open={!!pwd} onCancel={onClose} onOk={onClose} cancelButtonProps={{ style: { display: 'none' } }} okText="我已记录">
      <div className="note">请将初始密码告知 {account}。用户首次登录须修改密码；关闭后不再显示明文。</div>
      <Typography.Paragraph copyable style={{ fontSize: 26, fontFamily: 'monospace', marginTop: 14 }}>{pwd}</Typography.Paragraph>
    </Modal>
  )
}

export default function Users() {
  const me = useAuth((s) => s.user)!
  const { message, modal } = App.useApp()
  const [filters, setFilters] = useState({ q: '', org: '', role: '', status: '', page: 1 })
  const [sel, setSel] = useState<number[]>([])
  const [edit, setEdit] = useState<any>(null)
  const [adjust, setAdjust] = useState<any>(null)
  const [grant, setGrant] = useState(false)
  const [pwd, setPwd] = useState<{ account: string; pwd: string } | null>(null)
  const [f] = Form.useForm()
  const [af] = Form.useForm()
  const [gf] = Form.useForm()
  const qs = new URLSearchParams({ ...filters, page: String(filters.page) } as any).toString()
  const { data, refetch, isFetching } = useQuery({ queryKey: ['admin-users', qs], queryFn: () => api.get(`/admin/users?${qs}`) })

  const save = async () => {
    const v = await f.validateFields()
    try {
      if (edit.id) {
        await api.patch(`/admin/users/${edit.id}`, v)
        message.success('已保存')
      } else {
        const r = await api.post('/admin/users', v)
        setPwd({ account: r.user.account, pwd: r.initial_password })
      }
      setEdit(null)
      refetch()
    } catch (e: any) {
      message.error(e.message)
    }
  }
  const batch = (action: string, extra: any = {}) =>
    modal.confirm({
      title: '批量操作确认',
      content: `将影响 ${sel.length} 人，确认执行？`,
      onOk: async () => {
        const r = await api.post('/admin/users/batch', { ids: sel, action, ...extra })
        message.success(`已处理 ${r.affected} 人`)
        setSel([])
        refetch()
      },
    })

  return (
    <div className="page">
      <PageHead title="用户管理" desc="按姓名、账号、单位、角色、状态筛选；角色变更、停用、重置密码均写入审计日志，下次请求生效。"
        extra={<Space><Button onClick={() => { setGrant(true); gf.resetFields() }}>批量发放积分</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => { setEdit({}); f.resetFields(); f.setFieldsValue({ role: 'user', identity_type: '研究生', status: 'active' }) }}>新增用户</Button></Space>} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <Input.Search placeholder="姓名或账号" allowClear style={{ width: 220 }} onSearch={(q) => setFilters({ ...filters, q, page: 1 })} />
        <Select style={{ width: 220 }} value={filters.org} onChange={(org) => setFilters({ ...filters, org, page: 1 })} options={[{ value: '', label: '全部单位' }, ...(data?.orgs || []).map((o: string) => ({ value: o, label: o }))]} />
        <Select style={{ width: 120 }} value={filters.role} onChange={(role) => setFilters({ ...filters, role, page: 1 })} options={[{ value: '', label: '全部角色' }, ...ROLE_OPTS]} />
        <Select style={{ width: 120 }} value={filters.status} onChange={(status) => setFilters({ ...filters, status, page: 1 })} options={[{ value: '', label: '全部状态' }, { value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]} />
        {sel.length > 0 && (
          <Space>
            <span className="note">已选 {sel.length} 人</span>
            <Select placeholder="批量改角色" style={{ width: 130 }} options={ROLE_OPTS.filter((r) => r.value !== 'admin' || me.is_super)} onChange={(role) => batch('role', { role })} />
            <Button onClick={() => batch('enable')}>启用</Button>
            <Button danger onClick={() => batch('disable')}>停用</Button>
          </Space>
        )}
      </div>
      <div className="panel">
        <Table rowKey="id" loading={isFetching} dataSource={data?.items || []}
          rowSelection={{ selectedRowKeys: sel, onChange: (k) => setSel(k as number[]), getCheckboxProps: (r: any) => ({ disabled: r.is_super }) }}
          pagination={{ total: data?.total, current: filters.page, pageSize: 20, onChange: (page) => setFilters({ ...filters, page }) }}
          columns={[
            { title: '账号', dataIndex: 'account', width: 130 },
            { title: '姓名', dataIndex: 'name', width: 100 },
            { title: '单位', dataIndex: 'org', ellipsis: true },
            { title: '身份', dataIndex: 'identity_type', width: 90 },
            { title: '角色', dataIndex: 'role_label', width: 110, render: (v, r: any) => <Tag color={r.role === 'admin' ? 'red' : r.role === 'researcher' ? 'green' : 'default'}>{v}{r.is_super ? '·超管' : ''}</Tag> },
            { title: '状态', dataIndex: 'status', width: 110, render: (s, r: any) => <Space size={4}><Tag color={s === 'active' ? 'green' : 'default'}>{s === 'active' ? '启用' : '停用'}</Tag>{r.locked && <Tag color="red">锁定</Tag>}{r.must_change_pwd && <Tag>待改密</Tag>}</Space> },
            { title: '积分', dataIndex: 'points', width: 80 },
            { title: '最近登录', dataIndex: 'last_login_at', width: 140, render: (v) => v.replace('T', ' ') },
            {
              title: '操作', width: 260, render: (_, r: any) => !r.is_super || me.is_super ? (
                <Space size={2} wrap>
                  <a onClick={() => { setEdit(r); f.setFieldsValue(r) }}>编辑</a>
                  <a onClick={() => { setAdjust(r); af.resetFields() }}>调积分</a>
                  <a onClick={() => modal.confirm({ title: `重置 ${r.name} 的密码？`, content: '将生成新的初始密码，用户下次登录须改密，现有登录立即失效。', onOk: async () => { const d = await api.post(`/admin/users/${r.id}/reset-password`); setPwd({ account: r.account, pwd: d.initial_password }); refetch() } })}>重置密码</a>
                  {r.locked && <a onClick={() => api.post(`/admin/users/${r.id}/unlock`).then(() => { message.success('已解锁'); refetch() })}>解锁</a>}
                  {!r.is_super && <a onClick={() => api.patch(`/admin/users/${r.id}`, { status: r.status === 'active' ? 'disabled' : 'active' }).then(() => refetch()).catch((e) => message.error(e.message))}>{r.status === 'active' ? '停用' : '启用'}</a>}
                </Space>
              ) : <span className="note">超级管理员</span>,
            },
          ]} />
      </div>

      <Modal title={edit?.id ? `编辑用户 · ${edit.account}` : '新增用户'} open={!!edit} onOk={save} onCancel={() => setEdit(null)} destroyOnClose>
        <Form form={f} layout="vertical">
          <Form.Item name="account" label="账号（学工号或手机号）" rules={[{ required: true }]}><Input disabled={!!edit?.id} /></Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, max: 20 }]}><Input /></Form.Item>
          <Form.Item name="org" label="单位" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="identity_type" label="身份类别"><Select options={IDS.map((i) => ({ value: i, label: i }))} /></Form.Item>
          <Form.Item name="role" label="角色" extra={!me.is_super ? '设为管理员需超级管理员操作' : undefined}>
            <Select options={ROLE_OPTS.map((r) => ({ ...r, disabled: r.value === 'admin' && !me.is_super }))} disabled={edit?.is_super} />
          </Form.Item>
          <Form.Item name="phone" label="手机号"><Input /></Form.Item>
          <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          {!edit?.id && <Form.Item name="initial_points" label="初始积分（留空按规则默认）"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>}
          <Form.Item name="remark" label="备注"><Input maxLength={100} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`调整积分 · ${adjust?.name}（当前 ${adjust?.points}）`} open={!!adjust} onCancel={() => setAdjust(null)} destroyOnClose
        onOk={async () => {
          const v = await af.validateFields()
          try {
            const r = await api.post('/admin/points/adjust', { user_id: adjust.id, amount: v.amount, reason: v.reason })
            message.success(`已调整，余额 ${r.balance}`)
            setAdjust(null)
            refetch()
          } catch (e: any) { message.error(e.message) }
        }}>
        <Form form={af} layout="vertical">
          <Form.Item name="amount" label="增减数值（负数为扣减，扣减后余额不得为负）" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="reason" label="原因（必填）" rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title="批量发放积分" open={grant} onCancel={() => setGrant(false)} destroyOnClose
        onOk={async () => {
          const v = await gf.validateFields()
          modal.confirm({
            title: '确认发放？', content: sel.length ? `向已勾选的 ${sel.length} 人发放 ${v.amount} 分` : `按筛选条件（单位：${v.org || '全部'}，角色：${v.role || '全部'}）发放 ${v.amount} 分`,
            onOk: async () => {
              const r = await api.post('/admin/points/grant', { user_ids: sel, org: v.org || '', role: v.role || '', amount: v.amount, reason: v.reason })
              message.success(`已向 ${r.affected} 人发放`)
              setGrant(false)
              refetch()
            },
          })
        }}>
        <Form form={gf} layout="vertical">
          {sel.length === 0 && (
            <>
              <Form.Item name="org" label="按单位"><Select allowClear options={(data?.orgs || []).map((o: string) => ({ value: o, label: o }))} /></Form.Item>
              <Form.Item name="role" label="按角色"><Select allowClear options={ROLE_OPTS} /></Form.Item>
            </>
          )}
          {sel.length > 0 && <div className="note" style={{ marginBottom: 12 }}>将向已勾选的 {sel.length} 人发放</div>}
          <Form.Item name="amount" label="积分" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="reason" label="原因" rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>
      <PasswordReveal title="初始密码" account={pwd?.account} pwd={pwd?.pwd || null} onClose={() => setPwd(null)} />
    </div>
  )
}
