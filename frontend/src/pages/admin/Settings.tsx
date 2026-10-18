import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, App, Button, Form, Input, InputNumber, Switch } from 'antd'
import { api } from '../../api'
import { useAuth } from '../../store'
import { PageHead } from '../../components/ui'

export default function Settings() {
  const me = useAuth((s) => s.user)!
  const { message } = App.useApp()
  const { data, refetch } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/admin/settings'), enabled: me.is_super })
  const { data: health, refetch: rh } = useQuery({ queryKey: ['health'], queryFn: () => api.get('/health') })
  const [f] = Form.useForm()
  useEffect(() => {
    if (data) f.setFieldsValue({ ...data, model_api_key: '' })
  }, [data, f])
  if (!me.is_super) return <div className="page"><Alert type="warning" message="系统设置仅超级管理员可见" /></div>
  const save = async () => {
    const v = await f.validateFields()
    const body: any = { ...v }
    if (!v.model_api_key) delete body.model_api_key
    try {
      await api.put('/admin/settings', body)
      message.success('已保存（写入审计日志）')
      refetch()
      rh()
    } catch (e: any) {
      message.error(e.message)
    }
  }
  return (
    <div className="page">
      <PageHead title="系统设置" desc="模型接入、计费单价、内容安全词表与数据分级策略。仅超级管理员可见。" extra={<Button type="primary" onClick={save}>保存</Button>} />
      <div className="panel" style={{ maxWidth: 820 }}>
        <Alert type="info" showIcon style={{ marginBottom: 20 }} message={`当前模型：${health?.model || '—'}`}
          description="未配置密钥时使用“演示模型”：只摘引检索条目并带引用，不做自由发挥，用于跑通引证核验与积分流程。Qwen3.8-Max 的端点、鉴权与图片格式以官方文档为准（TBD-1），适配层按 OpenAI 兼容协议封装。" />
        <Form form={f} layout="vertical">
          <Form.Item name="model_api_key" label={`模型 API 密钥（加密存储，当前：${data?.model_api_key_tail || '未配置'}）`} extra="留空表示不修改；输入空格后保存可清除">
            <Input.Password placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="model_base_url" label="接口地址（OpenAI 兼容）"><Input /></Form.Item>
          <Form.Item name="model_name" label="模型名称"><Input /></Form.Item>
          <Form.Item name="model_timeout" label="超时（秒，超时自动退回积分）"><InputNumber min={5} max={120} /></Form.Item>
          <Form.Item name="price_in" label="输入单价（元 / 千 token）"><InputNumber min={0} step={0.0001} /></Form.Item>
          <Form.Item name="price_out" label="输出单价（元 / 千 token）"><InputNumber min={0} step={0.0001} /></Form.Item>
          <Form.Item name="sensitive_words" label="内容安全词表（英文逗号分隔）"><Input.TextArea autoSize={{ minRows: 2 }} /></Form.Item>
          <Form.Item label="L2/L3 数据允许送云端模型" extra="MVP 阶段锁定为“否”：问答检索自动排除，并提示“部分内部资料未参与本次回答”。">
            <Switch checked={false} disabled />
          </Form.Item>
        </Form>
      </div>
    </div>
  )
}
