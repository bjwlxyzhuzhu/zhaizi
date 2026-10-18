import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, Radio, Select, Table } from 'antd'
import { api } from '../../api'
import { PageHead } from '../../components/ui'

export default function Notifications() {
  const { message } = App.useApp()
  const [f] = Form.useForm()
  const audience = Form.useWatch('audience', f) || 'users'
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const { data: users } = useQuery({ queryKey: ['notice-users', q], queryFn: () => api.get(`/admin/users?size=50&status=active&q=${encodeURIComponent(q)}`) })
  const { data: history, refetch } = useQuery({ queryKey: ['notice-history'], queryFn: () => api.get('/admin/notifications/history') })
  const spec = () => {
    const v = f.getFieldsValue()
    return { audience: v.audience, user_ids: v.audience === 'users' ? v.user_ids || [] : [],
      role: v.audience === 'group' ? v.role || '' : '', org: v.audience === 'group' ? v.org || '' : '', identity_type: v.audience === 'group' ? v.identity_type || '' : '' }
  }
  const check = async () => {
    try { await f.validateFields(); setBusy(true); setPreview(await api.post('/admin/notifications/preview', spec())) }
    catch (e: any) { if (e.message) message.error(e.message) }
    finally { setBusy(false) }
  }
  const send = async () => {
    try {
      const v = await f.validateFields()
      setBusy(true)
      const result = await api.post('/admin/notifications/send', { ...spec(), title: v.title, body: v.body, recipient_signature: preview.recipient_signature })
      message.success(`已发送给 ${result.sent} 名用户`)
      setPreview(null)
      f.resetFields(['title', 'body'])
      refetch()
    } catch (e: any) { setPreview(null); if (e.message) message.error(e.message) }
    finally { setBusy(false) }
  }
  return <div className="page">
    <PageHead title="站内通知" desc="向指定用户或用户群体发送通知，收件人可在顶部铃铛中查看。" />
    <div className="panel" style={{ maxWidth: 960, marginBottom: 24 }}>
      <Form form={f} layout="vertical" initialValues={{ audience: 'users' }} onValuesChange={() => setPreview(null)}>
        <Form.Item label="通知标题" name="title" rules={[{ required: true, whitespace: true, message: '请填写通知标题' }]}><Input maxLength={120} showCount /></Form.Item>
        <Form.Item label="通知内容" name="body" rules={[{ required: true, whitespace: true, message: '请填写通知内容' }]}><Input.TextArea rows={4} maxLength={300} showCount /></Form.Item>
        <Form.Item label="收件范围" name="audience"><Radio.Group options={[{ value: 'users', label: '指定用户' }, { value: 'group', label: '指定群体' }, { value: 'all', label: '全体启用用户' }]} /></Form.Item>
        {audience === 'users' && <Form.Item label="选择收件人" name="user_ids" rules={[{ required: true, type: 'array', min: 1, message: '请选择用户' }]} extra="按姓名或账号搜索，支持多选。已停用账号不会收到通知。">
          <Select mode="multiple" showSearch filterOption={false} onSearch={setQ} placeholder="搜索姓名 / 账号" options={(users?.items || []).map((u: any) => ({ value: u.id, label: `${u.name} · ${u.account} · ${u.org}` }))} />
        </Form.Item>}
        {audience === 'group' && <>
          <Alert message="多个条件同时满足才会收到通知；至少选择一个条件。" type="info" showIcon style={{ marginBottom: 18 }} />
          <Form.Item label="角色" name="role"><Select allowClear placeholder="不限" options={[{ value: 'user', label: '用户' }, { value: 'researcher', label: '研究员' }, { value: 'admin', label: '管理员' }]} /></Form.Item>
          <Form.Item label="单位" name="org"><Select allowClear showSearch placeholder="不限" options={(users?.orgs || []).map((o: string) => ({ label: o, value: o }))} /></Form.Item>
          <Form.Item label="身份类别" name="identity_type"><Select allowClear placeholder="不限" options={['教师', '研究生', '本科生', '文博人员', '中小学教师', '其他'].map(value => ({ value, label: value }))} /></Form.Item>
        </>}
        <Button loading={busy} onClick={check}>预览收件人</Button>
      </Form>
      {preview && <div style={{ marginTop: 22 }}>
        <Alert type={preview.count ? 'info' : 'warning'} showIcon message={`共 ${preview.count} 名启用用户将收到通知`}
          description={preview.sample.map((u: any) => `${u.name}（${u.account}）`).join('、') + (preview.count > 10 ? ' 等' : '')} />
        <Button type="primary" style={{ marginTop: 14 }} loading={busy} disabled={!preview.count} onClick={send}>确认发送给 {preview.count} 人</Button>
      </div>}
    </div>
    <div className="panel"><div className="panel-head"><span className="panel-title">最近发送记录</span></div>
      <Table rowKey="id" dataSource={history || []} pagination={{ pageSize: 10 }} columns={[
        { title: '通知标题', dataIndex: 'title' }, { title: '发送人', dataIndex: 'by' }, { title: '送达人数', dataIndex: 'count' },
        { title: '发送时间', dataIndex: 'created_at', render: (v: string) => v.replace('T', ' ') },
      ]} />
    </div>
  </div>
}
