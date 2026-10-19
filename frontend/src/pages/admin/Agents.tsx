import { RareText } from '../../components/RareText'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, App, Button, Checkbox, Form, Input, Modal, Select, Space, Switch, Table, Tag } from 'antd'
import { api } from '../../api'
import { PageHead } from '../../components/ui'

function AgentCard({ agent, bases, collections, onSave }: { agent: any; bases: any[]; collections: Record<string, string>; onSave: () => void }) {
  const { message } = App.useApp()
  const [config, setConfig] = useState(agent)
  const [saving, setSaving] = useState(false)
  useEffect(() => setConfig(agent), [agent])
  return <div className="panel agent-card">
    <div className="panel-head"><span className="panel-title"><RareText>{agent.name}</RareText></span><Switch checked={config.enabled} checkedChildren="启用" unCheckedChildren="暂停" onChange={enabled => setConfig({ ...config, enabled })} /></div>
    <p className="note"><RareText>{agent.description}</RareText></p>
    <p>关联平台资料库</p>
    <Checkbox.Group value={config.collections} options={Object.entries(collections).map(([value, label]) => ({ value, label }))} onChange={value => setConfig({ ...config, collections: value })} />
    <p>关联自建知识库</p>
    <Select mode="multiple" style={{ width: '100%', marginBottom: 18 }} placeholder="选择自建知识库" value={config.knowledge_base_ids} options={bases.map(b => ({ value: b.id, label: b.name }))} onChange={ids => setConfig({ ...config, knowledge_base_ids: ids })} />
    <Space><Button type="primary" loading={saving} onClick={async () => {
      try { setSaving(true); await api.put(`/admin/agents/${agent.id}`, { enabled: config.enabled, collections: config.collections, knowledge_base_ids: config.knowledge_base_ids }); message.success('智能体关联已更新'); onSave() }
      catch (e: any) { message.error(e.message) } finally { setSaving(false) }
    }}>保存关联</Button><a href={agent.route}>打开智能体 →</a></Space>
  </div>
}

export default function Agents() {
  const { message } = App.useApp()
  const { data: agents, refetch: reloadAgents } = useQuery({ queryKey: ['agents'], queryFn: () => api.get('/agents') })
  const { data, refetch: reloadBases } = useQuery({ queryKey: ['knowledge-bases'], queryFn: () => api.get('/admin/knowledge-bases') })
  const bases = data?.items || []
  const [baseId, setBaseId] = useState<number | undefined>()
  const selectedId = baseId || bases[0]?.id
  const base = bases.find((b: any) => b.id === selectedId)
  const { data: docs, refetch: reloadDocs } = useQuery({ queryKey: ['knowledge-docs', selectedId], queryFn: () => api.get(`/admin/knowledge-bases/${selectedId}/documents`), enabled: !!selectedId })
  const { data: runs, refetch: reloadRuns } = useQuery({ queryKey: ['knowledge-runs', selectedId], queryFn: () => api.get(`/admin/knowledge-bases/${selectedId}/training-runs`), enabled: !!selectedId })
  const [baseOpen, setBaseOpen] = useState(false)
  const [docEdit, setDocEdit] = useState<any>(null)
  const [bf] = Form.useForm(), [df] = Form.useForm()
  const [training, setTraining] = useState(false)
  const [saving, setSaving] = useState(false)
  const refresh = () => Promise.all([reloadBases(), reloadDocs(), reloadRuns()])
  const edit = (doc?: any) => {
    df.resetFields()
    df.setFieldsValue(doc || { title: '', content: '', source: '', level: 'L1', status: 'draft' })
    setDocEdit(doc || {})
  }
  return <div className="page">
    <PageHead title="智能体与知识库" desc="管理研究智能体的知识来源、动态资料及检索训练，所有更新保留审计记录。" />
    <Alert type="info" showIcon style={{ marginBottom: 24 }} message="知识库训练：文本处理 → 分段 → 检索索引 → 引用核验"
      description="当前采用检索增强（RAG）与关键词索引。发布资料后增量更新，重建可统一处理全部资料；此操作不修改云端模型参数。仅公开等级 L1 且已发布的资料参与云端问答。" />
    <div className="agent-grid">{(agents || []).map((a: any) => <AgentCard key={a.id} agent={a} bases={bases} collections={data?.collections || {}} onSave={reloadAgents} />)}</div>
    <div className="panel" style={{ marginTop: 24 }}>
      <div className="panel-head"><span className="panel-title">自建知识库</span><Button onClick={() => { bf.resetFields(); setBaseOpen(true) }}>创建知识库</Button></div>
      {bases.length ? <>
        <Space wrap style={{ marginBottom: 20 }}><Select aria-label="选择知识库" style={{ minWidth: 240 }} value={selectedId} onChange={setBaseId} options={bases.map((b: any) => ({ value: b.id, label: b.name }))} />
          <Button onClick={() => edit()}>添加资料</Button><Button type="primary" loading={training} onClick={async () => {
            try { setTraining(true); const r = await api.post(`/admin/knowledge-bases/${selectedId}/train`); message.success(`索引训练完成：${r.documents} 篇发布资料，${r.chunks} 个检索分段`); await refresh() }
            catch (e: any) { message.error(e.message) } finally { setTraining(false) }
          }}>训练 / 重建索引</Button>
        </Space>
        <div className="knowledge-stats"><span>资料 <b>{base?.documents}</b> 篇</span><span>检索分段 <b>{base?.chunks}</b> 个</span><span>最近重建：{base?.trained_at ? base.trained_at.replace('T', ' ') : '尚无重建记录'}</span></div>
        {base?.description && <p className="note"><RareText>{base.description}</RareText></p>}
        <Table rowKey="id" dataSource={docs || []} pagination={{ pageSize: 8 }} scroll={{ x: 720 }} columns={[
          { title: '资料标题', dataIndex: 'title', render: (value: string) => <RareText>{value}</RareText> }, { title: '来源 / 著录', dataIndex: 'source', render: (value: string) => <RareText>{value}</RareText>, ellipsis: true },
          { title: '分级', dataIndex: 'level', width: 80 }, { title: '状态', dataIndex: 'status', width: 110, render: (v: string) => <Tag color={v === 'approved' ? 'green' : 'default'}>{{ draft: '草稿', approved: '已发布', disabled: '已停用' }[v]}</Tag> },
          { title: '更新时间', dataIndex: 'updated_at', render: (v: string) => v.replace('T', ' ') }, { title: '操作', width: 80, render: (_: any, row: any) => <Button type="link" onClick={() => edit(row)}>编辑</Button> },
        ]} />
        <details style={{ marginTop: 22 }}><summary style={{ cursor: 'pointer' }}>索引训练记录（{runs?.length || 0}）</summary><Table rowKey="id" size="small" style={{ marginTop: 15 }} dataSource={runs || []} pagination={{ pageSize: 5 }} columns={[
          { title: '时间', dataIndex: 'created_at', render: (v: string) => v.replace('T', ' ') }, { title: '操作人', dataIndex: 'actor' }, { title: '发布资料', dataIndex: 'documents' }, { title: '分段数', dataIndex: 'chunks' }, { title: '处理耗时（ms）', dataIndex: 'elapsed_ms' },
        ]} /></details>
      </> : <div className="empty">请先创建知识库，再添加有来源的资料并关联到智能体。</div>}
    </div>
    <Modal title="创建知识库" open={baseOpen} onCancel={() => setBaseOpen(false)} confirmLoading={saving} onOk={async () => {
      try { const v = await bf.validateFields(); setSaving(true); const r = await api.post('/admin/knowledge-bases', v); setBaseId(r.id); setBaseOpen(false); await reloadBases(); message.success('知识库已创建') }
      catch (e: any) { if (e.message) message.error(e.message) } finally { setSaving(false) }
    }}><Form form={bf} layout="vertical"><Form.Item name="name" label="知识库名称" rules={[{ required: true, whitespace: true }]}><Input maxLength={80} /></Form.Item><Form.Item name="description" label="用途说明"><Input.TextArea maxLength={300} rows={3} /></Form.Item></Form></Modal>
    <Modal title={docEdit?.id ? '编辑知识资料' : '添加知识资料'} width={880} open={!!docEdit} onCancel={() => setDocEdit(null)} confirmLoading={saving} onOk={async () => {
      try {
        const v = await df.validateFields(); setSaving(true)
        const url = `/admin/knowledge-bases/${selectedId}/documents${docEdit.id ? '/' + docEdit.id : ''}`
        if (docEdit.id) await api.put(url, v); else await api.post(url, v)
        setDocEdit(null); await refresh(); message.success('已保存，发布资料的索引已动态更新')
      } catch (e: any) { if (e.message) message.error(e.message) } finally { setSaving(false) }
    }}>
      <Form form={df} layout="vertical">
        <Form.Item name="title" label="资料标题" rules={[{ required: true, whitespace: true }]}><Input maxLength={120} /></Form.Item>
        <Form.Item name="source" label="来源 / 著录 / 原文链接" rules={[{ required: true, whitespace: true }]}><Input maxLength={500} placeholder="填写可追溯的来源，作为回答引用依据" /></Form.Item>
        <Space style={{ marginBottom: 15 }}>导入文本：<input type="file" accept=".txt,.md" aria-label="导入知识库文本" onChange={async e => {
          const file = e.target.files?.[0]; if (!file) return
          if (file.size > 1000000) { message.error('文件不能超过 1 MB'); return }
          const text = await file.text()
          if (text.length > 100000) { message.error('正文不能超过 10 万字'); return }
          df.setFieldValue('content', text); if (!df.getFieldValue('title')) df.setFieldValue('title', file.name)
          e.target.value = ''
        }} /></Space>
        <Form.Item name="content" label="资料正文" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={10} maxLength={100000} showCount /></Form.Item>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Form.Item name="level" label="数据分级"><Select options={[{ value: 'L1', label: 'L1 · 可公开' }, { value: 'L2', label: 'L2 · 内部' }, { value: 'L3', label: 'L3 · 受限' }]} /></Form.Item>
          <Form.Item name="status" label="发布状态"><Select options={[{ value: 'draft', label: '草稿' }, { value: 'approved', label: '已发布（确认来源后选择）' }, { value: 'disabled', label: '停用（退出检索）' }]} /></Form.Item>
        </div>
      </Form>
    </Modal>
  </div>
}
