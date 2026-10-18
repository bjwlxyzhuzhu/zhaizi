import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { App, AutoComplete, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { api } from '../../api'
import { NODE_COLORS } from '../../theme'
import { PageHead } from '../../components/ui'

const REL_TYPES = ['铸有', '含字', '字形', '上古音', '中古音', '今读', '义项', '提及', '器主', '记事', '记载', '礼制', '观念', '地点', '出土于', '对读', '相关', '所指', '主导']

function NodePicker({ value, onChange }: { value?: number; onChange?: (v: number) => void }) {
  const [q, setQ] = useState('')
  const [label, setLabel] = useState('')
  const { data = [] } = useQuery({ queryKey: ['kg-search', q], queryFn: () => api.get(`/kg/nodes?q=${encodeURIComponent(q)}&limit=15`), enabled: !!q })
  return (
    <AutoComplete value={label || (value ? `#${value}` : '')} onSearch={(v) => { setQ(v); setLabel(v) }}
      onSelect={(v, o: any) => { onChange?.(Number(v)); setLabel(o.text) }}
      options={data.map((n: any) => ({ value: String(n.id), text: `${n.type}·${n.name}`, label: `${n.type} · ${n.name}` }))} placeholder="输入名称搜索节点" />
  )
}

export default function GraphEditor() {
  const { message, modal } = App.useApp()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [sel, setSel] = useState<any>(null)
  const [nodeForm, setNodeForm] = useState<any>(null)
  const [edgeOpen, setEdgeOpen] = useState(false)
  const [nf] = Form.useForm()
  const [ef] = Form.useForm()
  const { data: list = [], refetch } = useQuery({ queryKey: ['kg-edit', q, type], queryFn: () => api.get(`/kg/nodes?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&limit=100`) })
  const { data: detail, refetch: refetchDetail } = useQuery({ queryKey: ['kg-node', sel?.id], queryFn: () => api.get(`/kg/nodes/${sel.id}`), enabled: !!sel })

  const saveNode = async () => {
    const v = await nf.validateFields()
    const body = { type: v.type, name: v.name, level: v.level, props: { ...(nodeForm?.props || {}), desc: v.desc, grade: v.grade } }
    try {
      if (nodeForm?.id) await api.put(`/kg/nodes/${nodeForm.id}`, body)
      else await api.post('/kg/nodes', body)
      message.success('已保存')
      setNodeForm(null)
      refetch()
      refetchDetail()
    } catch (e: any) {
      message.error(e.message)
    }
  }
  const delNode = (n: any) => {
    modal.confirm({
      title: `删除节点“${n.name}”？`,
      content: `该节点有 ${n.degree} 条关联关系，删除节点将一并删除这些关系。此操作写入审计日志。`,
      okButtonProps: { danger: true },
      onOk: async () => {
        const r = await api.del(`/kg/nodes/${n.id}`)
        message.success(`已删除，移除关系 ${r.edges_removed} 条`)
        setSel(null)
        refetch()
      },
    })
  }
  const saveEdge = async () => {
    const v = await ef.validateFields()
    try {
      await api.post('/kg/edges', v)
      message.success('关系已添加')
      setEdgeOpen(false)
      refetchDetail()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const neighbors = Object.values(detail?.neighbors || {}).flat() as any[]
  return (
    <div className="page">
      <PageHead title="图谱编辑" desc="新增、修改、删除节点和关系；关系须选择类型并附出处。所有修改写入审计日志。"
        extra={<Space><Button icon={<PlusOutlined />} onClick={() => { setEdgeOpen(true); ef.resetFields(); ef.setFieldsValue({ evidence_grade: 'B', src_id: sel?.id }) }}>新增关系</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setNodeForm({}); nf.resetFields(); nf.setFieldsValue({ type: '义', level: 'L1', grade: 'B' }) }}>新增节点</Button></Space>} />
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.1fr', alignItems: 'start' }}>
        <div className="panel">
          <Space style={{ marginBottom: 12 }}>
            <Input.Search placeholder="节点名称" allowClear onSearch={setQ} style={{ width: 240 }} />
            <Select value={type} onChange={setType} style={{ width: 120 }} options={[{ value: '', label: '全部类型' }, ...Object.keys(NODE_COLORS).map((t) => ({ value: t, label: t }))]} />
          </Space>
          <Table rowKey="id" size="small" dataSource={list} pagination={{ pageSize: 14 }}
            onRow={(r: any) => ({ onClick: () => setSel(r), style: { cursor: 'pointer', background: sel?.id === r.id ? 'rgba(47,111,94,.08)' : undefined } })}
            columns={[
              { title: 'ID', dataIndex: 'id', width: 60 },
              { title: '类型', dataIndex: 'type', width: 80, render: (t) => <Tag color={NODE_COLORS[t]} style={{ color: '#111' }}>{t}</Tag> },
              { title: '名称', dataIndex: 'name' },
            ]} />
        </div>
        <div className="panel">
          {!detail ? <div className="empty">选择左侧节点查看与编辑</div> : (
            <>
              <div className="panel-head">
                <span className="panel-title">{detail.type} · {detail.name}</span>
                <Space>
                  <Button size="small" onClick={() => { setNodeForm(detail); nf.setFieldsValue({ type: detail.type, name: detail.name, level: 'L1', desc: detail.props?.desc, grade: detail.props?.grade || 'B' }) }}>编辑</Button>
                  <Button size="small" danger onClick={() => delNode(detail)}>删除</Button>
                </Space>
              </div>
              {detail.props?.desc && <div className="note" style={{ fontSize: 14, marginBottom: 12 }}>{detail.props.desc}</div>}
              <Table rowKey="edge_id" size="small" dataSource={neighbors} pagination={{ pageSize: 10 }}
                columns={[
                  { title: '方向', dataIndex: 'direction', width: 60, render: (d) => (d === 'out' ? '→' : '←') },
                  { title: '关系', dataIndex: 'rel', width: 80 },
                  { title: '节点', render: (_, r: any) => `${r.type} · ${r.name}` },
                  { title: '出处', dataIndex: 'src', ellipsis: true },
                  { title: '', width: 60, render: (_, r: any) => <Popconfirm title="删除这条关系？" onConfirm={() => api.del(`/kg/edges/${r.edge_id}`).then(() => refetchDetail())}><a>删除</a></Popconfirm> },
                ]} />
            </>
          )}
        </div>
      </div>

      <Modal title={nodeForm?.id ? '编辑节点' : '新增节点'} open={!!nodeForm} onOk={saveNode} onCancel={() => setNodeForm(null)} destroyOnClose>
        <Form form={nf} layout="vertical">
          <Form.Item name="type" label="类型" rules={[{ required: true }]}><Select options={Object.keys(NODE_COLORS).map((t) => ({ value: t, label: t }))} /></Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="desc" label="说明（义、礼制、人物、事件、地点类节点的说明会进入问答检索）"><Input.TextArea autoSize={{ minRows: 3 }} /></Form.Item>
          <Form.Item name="grade" label="证据等级"><Select options={['A', 'B', 'C', 'D'].map((g) => ({ value: g, label: g }))} /></Form.Item>
          <Form.Item name="level" label="数据分级"><Select options={['L1', 'L2', 'L3'].map((g) => ({ value: g, label: g }))} /></Form.Item>
        </Form>
      </Modal>
      <Modal title="新增关系" open={edgeOpen} onOk={saveEdge} onCancel={() => setEdgeOpen(false)} destroyOnClose>
        <Form form={ef} layout="vertical">
          <Form.Item name="src_id" label="起点节点" rules={[{ required: true }]}><NodePicker /></Form.Item>
          <Form.Item name="rel_type" label="关系类型" rules={[{ required: true, message: '关系须选择类型' }]}><Select showSearch options={REL_TYPES.map((r) => ({ value: r, label: r }))} /></Form.Item>
          <Form.Item name="dst_id" label="终点节点" rules={[{ required: true }]}><NodePicker /></Form.Item>
          <Form.Item name="source" label="出处" rules={[{ required: true, message: '关系须附出处' }]}><Input placeholder="著录、文献或研究依据" /></Form.Item>
          <Form.Item name="evidence_grade" label="证据等级"><Select options={['A', 'B', 'C', 'D'].map((g) => ({ value: g, label: g }))} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
