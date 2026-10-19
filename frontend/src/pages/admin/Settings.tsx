import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, App, AutoComplete, Button, Form, Input, InputNumber, Popconfirm, Select, Space, Switch } from 'antd'
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
  const probeSequence = useRef(0)
  const resetModels = () => { probeSequence.current++; setModels([]); setProbeResult(''); setProbing(false) }
  useEffect(() => { if (data) f.setFieldsValue({ ...data, model_api_key: '' }) }, [data, f])
  const save = async () => {
    try {
      const v = await f.validateFields()
      setSaving(true)
      const body = { model_provider: v.model_provider, model_base_url: v.model_base_url, model_name: v.model_name.trim(), model_api_key: v.model_api_key?.trim(), model_timeout: v.model_timeout, sensitive_words: v.sensitive_words }
      if (!v.model_api_key?.trim()) delete body.model_api_key
      await api.put('/admin/settings', body)
      f.setFieldValue('model_api_key', '')
      message.success('已保存，密钥加密存储')
      await Promise.all([refetch(), rh()])
    } catch (e: any) { if (e.message) message.error(e.message) }
    finally { setSaving(false) }
  }
  const probe = async () => {
    const sequence = ++probeSequence.current
    try {
      await f.validateFields(['model_base_url'])
      setProbing(true)
      setProbeResult('')
      const result = await api.post('/admin/settings/models', {
        model_base_url: f.getFieldValue('model_base_url'), model_api_key: f.getFieldValue('model_api_key')?.trim() || undefined,
      })
      if (sequence !== probeSequence.current) return
      setModels(result.models)
      setProbeResult(`连接成功，可用模型 ${result.models.length} 个。${result.models.length ? '请选择模型后保存。' : '该分组未返回模型，可手动填写模型名称。'}`)
      f.setFieldValue('model_base_url', result.base_url)
    } catch (e: any) { if (sequence === probeSequence.current) message.error(e.message) }
    finally { if (sequence === probeSequence.current) setProbing(false) }
  }
  const chooseProvider = (id: string) => {
    const provider = data?.providers?.find((p: any) => p.id === id)
    f.setFieldsValue({ model_provider: id, model_base_url: provider?.base_url || f.getFieldValue('model_base_url'), model_name: '', model_api_key: '' })
    resetModels()
  }
  return <div className="page">
    <PageHead title="模型与 API 设置" desc="自由选择 TokenOne 分组模型、服务商官方模型或自定义接口；模型名称可手动输入。" extra={<Button type="primary" loading={saving} onClick={save}>保存设置</Button>} />
    <div className="panel" style={{ maxWidth: 880 }}>
      <Alert type="info" showIcon style={{ marginBottom: 24 }} message={`当前模型：${health?.model || '—'}`}
        description="选择接入方案，填写对应密钥，再读取模型列表或直接填写准确模型 ID。无需配置价格。读取列表不发起对话生成；未配置密钥时使用库内检索摘引。" />
      <Form form={f} layout="vertical" onValuesChange={(v) => { if ('model_base_url' in v || 'model_api_key' in v) resetModels() }}>
        <Form.Item name="model_provider" label="模型服务商 / 接入方案" rules={[{ required: true, message: '请选择接入方案' }]} extra="选择方案会填入默认 API 地址，并清空待选模型；接口地址仍可自行修改。">
          <Select aria-label="模型服务商" options={(data?.providers || []).map((p: any) => ({ value: p.id, label: p.name }))} onChange={chooseProvider} />
        </Form.Item>
        <Form.Item name="model_base_url" label="接口地址（OpenAI 兼容）" rules={[{ required: true, message: '请输入接口地址' }, { type: 'url', message: '请输入完整的 http(s) 地址' }]}
          extra="支持服务商根地址（自动补 /v1）或完整 API 基址；请勿填写 /chat/completions。">
          <Input placeholder="https://token.agentone.work" />
        </Form.Item>
        <Form.Item name="model_api_key" label={`API 密钥（已保存：${data?.model_api_key_tail || '未配置'}）`} extra="由你自行填写对应分组或官方密钥。同一接口留空保留密钥；切换 API 地址时须输入对应密钥，或先清除原密钥。保存后输入框清空，仅显示末四位。">
          <Input.Password placeholder="输入当前服务商 / 分组的 API 密钥" autoComplete="new-password" />
        </Form.Item>
        <Space wrap style={{ marginBottom: 22 }}>
          <Button loading={probing} onClick={probe}>连接并读取可用模型</Button>
          <Popconfirm title="清除已保存的模型密钥？" description="清除后将使用库内检索摘引。" onConfirm={async () => {
            try { await api.put('/admin/settings', { model_api_key: '' }); f.setFieldValue('model_api_key', ''); resetModels(); await Promise.all([refetch(), rh()]); message.success('密钥已清除') } catch (e: any) { message.error(e.message) }
          }}><Button danger disabled={!data?.model_api_key_tail}>清除密钥</Button></Popconfirm>
        </Space>
        {probeResult && <Alert type="success" showIcon message={probeResult} style={{ marginBottom: 20 }} />}
        <Form.Item name="model_name" label="模型 ID（可直接手动输入）" rules={[{ required: true, whitespace: true, message: '请选择或填写模型 ID' }]} extra="可填写服务商支持的任意准确模型 ID，不限定品牌或版本。TokenOne 可用模型由密钥所属分组决定；拓片释读需要支持图像的模型。">
          <AutoComplete allowClear options={models.map(value => ({ value }))} placeholder="选择可用模型，或直接输入准确模型 ID" filterOption={(v, o) => !!o?.value.toLowerCase().includes(v.toLowerCase())} />
        </Form.Item>
        <Form.Item name="model_timeout" label="超时（秒，超时自动退回积分）"><InputNumber min={5} max={120} /></Form.Item>
        <Form.Item name="sensitive_words" label="内容安全词表（英文逗号分隔）"><Input.TextArea autoSize={{ minRows: 2 }} /></Form.Item>
        <Form.Item label="L2/L3 数据允许送云端模型" extra="当前锁定为否；问答检索自动排除内部资料。"><Switch checked={false} disabled /></Form.Item>
      </Form>
    </div>
  </div>
}
