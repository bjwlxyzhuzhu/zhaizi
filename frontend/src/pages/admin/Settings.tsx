import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, App, AutoComplete, Button, Form, Input, InputNumber, Popconfirm, Space, Switch } from 'antd'
import { api } from '../../api'
import { PageHead } from '../../components/ui'

export default function Settings() {
  const { message } = App.useApp()
  const { data, refetch } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/admin/settings') })
  const { data: health, refetch: rh } = useQuery({ queryKey: ['health'], queryFn: () => api.get('/health') })
  const [f] = Form.useForm()
  const [models, setModels] = useState<string[]>([])
  const [probing, setProbing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [probeResult, setProbeResult] = useState('')
  useEffect(() => { if (data) f.setFieldsValue({ ...data, model_api_key: '' }) }, [data, f])
  const save = async () => {
    try {
      const v = await f.validateFields()
      setSaving(true)
      const body = { ...v }
      if (!v.model_api_key?.trim()) delete body.model_api_key
      await api.put('/admin/settings', body)
      f.setFieldValue('model_api_key', '')
      message.success('已保存，密钥加密存储')
      await Promise.all([refetch(), rh()])
    } catch (e: any) { if (e.message) message.error(e.message) }
    finally { setSaving(false) }
  }
  const probe = async () => {
    try {
      await f.validateFields(['model_base_url'])
      setProbing(true)
      setProbeResult('')
      const result = await api.post('/admin/settings/models', {
        model_base_url: f.getFieldValue('model_base_url'), model_api_key: f.getFieldValue('model_api_key')?.trim() || undefined,
      })
      setModels(result.models)
      setProbeResult(`连接成功，可用模型 ${result.models.length} 个。${result.models.length ? '请选择模型后保存。' : '该分组未返回模型，可手动填写模型名称。'}`)
      f.setFieldValue('model_base_url', result.base_url)
    } catch (e: any) { message.error(e.message) }
    finally { setProbing(false) }
  }
  return <div className="page">
    <PageHead title="模型与 API 设置" desc="管理员可配置 OpenAI 兼容接口；分组及模型权限由服务商密钥决定。" extra={<Button type="primary" loading={saving} onClick={save}>保存设置</Button>} />
    <div className="panel" style={{ maxWidth: 880 }}>
      <Alert type="info" showIcon style={{ marginBottom: 24 }} message={`当前模型：${health?.model || '—'}`}
        description="先填写接口地址和密钥，再读取可用模型。读取列表不发起对话生成。未配置密钥时平台使用库内检索摘引。" />
      <Form form={f} layout="vertical" onValuesChange={(v) => { if ('model_base_url' in v || 'model_api_key' in v) { setModels([]); setProbeResult('') } }}>
        <Form.Item name="model_base_url" label="接口地址（OpenAI 兼容）" rules={[{ required: true, message: '请输入接口地址' }, { type: 'url', message: '请输入完整的 http(s) 地址' }]}
          extra="支持服务商根地址（自动补 /v1）或完整 API 基址；请勿填写 /chat/completions。">
          <Input placeholder="https://token.agentone.work" />
        </Form.Item>
        <Button style={{ marginBottom: 22 }} onClick={() => { f.setFieldValue('model_base_url', 'https://token.agentone.work/v1'); setModels([]); setProbeResult('') }}>使用 TokenOne 接口地址</Button>
        <Form.Item name="model_api_key" label={`API 密钥（当前：${data?.model_api_key_tail || '未配置'}）`} extra="请自行输入密钥。留空保留原密钥；保存后输入框清空。前端只显示已保存密钥的末四位。">
          <Input.Password placeholder="输入该分组的 API 密钥" autoComplete="new-password" />
        </Form.Item>
        <Space wrap style={{ marginBottom: 22 }}>
          <Button loading={probing} onClick={probe}>连接并读取可用模型</Button>
          <Popconfirm title="清除已保存的模型密钥？" description="清除后将使用库内检索摘引。" onConfirm={async () => {
            try { await api.put('/admin/settings', { model_api_key: '' }); f.setFieldValue('model_api_key', ''); setModels([]); setProbeResult(''); await Promise.all([refetch(), rh()]); message.success('密钥已清除') } catch (e: any) { message.error(e.message) }
          }}><Button danger disabled={!data?.model_api_key_tail}>清除密钥</Button></Popconfirm>
        </Space>
        {probeResult && <Alert type="success" showIcon message={probeResult} style={{ marginBottom: 20 }} />}
        <Form.Item name="model_name" label="模型名称" rules={[{ required: true, whitespace: true, message: '请选择或填写模型名称' }]} extra="下拉选择该密钥可用的模型，也可手动填写服务商提供的准确模型 ID。">
          <AutoComplete options={models.map(value => ({ value }))} placeholder="读取列表后选择，或手动输入模型 ID" filterOption={(v, o) => !!o?.value.toLowerCase().includes(v.toLowerCase())} />
        </Form.Item>
        <Form.Item name="model_timeout" label="超时（秒，超时自动退回积分）"><InputNumber min={5} max={120} /></Form.Item>
        <Form.Item name="price_in" label="输入单价（元 / 千 token）"><InputNumber min={0} step={0.0001} /></Form.Item>
        <Form.Item name="price_out" label="输出单价（元 / 千 token）"><InputNumber min={0} step={0.0001} /></Form.Item>
        <Form.Item name="sensitive_words" label="内容安全词表（英文逗号分隔）"><Input.TextArea autoSize={{ minRows: 2 }} /></Form.Item>
        <Form.Item label="L2/L3 数据允许送云端模型" extra="当前锁定为否；问答检索自动排除内部资料。"><Switch checked={false} disabled /></Form.Item>
      </Form>
    </div>
  </div>
}
