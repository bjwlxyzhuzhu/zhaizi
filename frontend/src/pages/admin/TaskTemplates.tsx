import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { App, Button, Form, Input, InputNumber, Modal, Switch, Table, Tag } from 'antd'
import { api } from '../../api'
import { PageHead } from '../../components/ui'

export default function TaskTemplates() {
  const { message } = App.useApp()
  const { data = [], refetch } = useQuery({ queryKey: ['task-templates'], queryFn: () => api.get('/admin/task-templates') })
  const [edit, setEdit] = useState<any>(null)
  const [f] = Form.useForm()
  return (
    <div className="page">
      <PageHead title="任务模板" desc="维护任务类型：名称、说明、奖励积分、是否需要审核、每人每日上限。“释文纠错”“方言条目标注”的奖励值以积分规则为准。"
        extra={<Button type="primary" onClick={() => { setEdit({}); f.resetFields(); f.setFieldsValue({ need_review: true, enabled: true, daily_limit: 10, reward: 5 }) }}>新增任务类型</Button>} />
      <div className="panel">
        <Table rowKey="id" pagination={false} dataSource={data}
          columns={[
            { title: '代码', dataIndex: 'code', render: (v) => <span className="mono">{v}</span> }, { title: '名称', dataIndex: 'name' },
            { title: '说明', dataIndex: 'description' }, { title: '奖励', dataIndex: 'reward' },
            { title: '需审核', dataIndex: 'need_review', render: (v) => (v ? '是' : '否') }, { title: '每日上限', dataIndex: 'daily_limit' },
            { title: '状态', dataIndex: 'enabled', render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? '启用' : '停用'}</Tag> },
            { title: '', render: (_, r: any) => <a onClick={() => { setEdit(r); f.setFieldsValue(r) }}>编辑</a> },
          ]} />
      </div>
      <Modal title={edit?.id ? '编辑任务类型' : '新增任务类型'} open={!!edit} onCancel={() => setEdit(null)} destroyOnClose
        onOk={async () => {
          const v = await f.validateFields()
          try {
            await api.post('/admin/task-templates', v)
            message.success('已保存')
            setEdit(null)
            refetch()
          } catch (e: any) { message.error(e.message) }
        }}>
        <Form form={f} layout="vertical">
          <Form.Item name="code" label="代码" rules={[{ required: true }]}><Input disabled={!!edit?.id} /></Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="说明"><Input.TextArea /></Form.Item>
          <Form.Item name="reward" label="奖励积分"><InputNumber min={0} /></Form.Item>
          <Form.Item name="daily_limit" label="每人每日上限"><InputNumber min={1} /></Form.Item>
          <Form.Item name="need_review" label="需要审核" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
