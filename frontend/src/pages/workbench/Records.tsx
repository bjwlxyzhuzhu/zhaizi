import { RareText } from '../../components/RareText'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { App, Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Upload } from 'antd'
import { DownloadOutlined, HistoryOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { api, download } from '../../api'
import { useAuth } from '../../store'
import { PageHead, StatusTag } from '../../components/ui'

type F = { name: string; label: string; type?: 'text' | 'area' | 'num' | 'grade' | 'level' | 'script' | 'vessel' | 'file'; required?: boolean }
const LEVEL: F = { name: 'level', label: '数据分级', type: 'level', required: true }
const SOURCE: F = { name: 'source', label: '来源', required: true }
const FIELDS: Record<string, F[]> = {
  vessels: [
    { name: 'name', label: '器名', required: true }, { name: 'category', label: '类别' }, { name: 'period', label: '时代' },
    { name: 'find_place', label: '出土地' }, { name: 'district', label: '所属区县' }, { name: 'find_date', label: '出土时间' },
    { name: 'collection', label: '现藏地' }, { name: 'catalog_refs', label: '著录号' }, { name: 'description', label: '简介', type: 'area' },
    { name: 'image', label: '图片', type: 'file' }, { name: 'evidence_grade', label: '证据等级', type: 'grade' }, LEVEL, SOURCE,
  ],
  inscriptions: [
    { name: 'vessel_id', label: '所属器物', type: 'vessel', required: true }, { name: 'transcription', label: '原文隶定 / 释文', type: 'area', required: true },
    { name: 'interpretation', label: '通读', type: 'area' }, { name: 'char_count', label: '字数（留空自动统计）', type: 'num' },
    { name: 'evidence_grade', label: '证据等级', type: 'grade' }, LEVEL, SOURCE,
  ],
  glyphs: [
    { name: 'character', label: '字头', required: true }, { name: 'script', label: '书体', type: 'script', required: true },
    { name: 'vessel_id', label: '所见器物', type: 'vessel' }, { name: 'image_path', label: '字形切图（透明底PNG/SVG）', type: 'file' },
    { name: 'note', label: '说明', type: 'area' }, LEVEL, SOURCE,
  ],
  dialect_entries: [
    { name: 'district', label: '区县', required: true }, { name: 'speaker_code', label: '发音人编号（脱敏）' }, { name: 'word', label: '词条', required: true },
    { name: 'ipa', label: '国际音标' }, { name: 'meaning', label: '词义' }, { name: 'audio_path', label: '音频', type: 'file' }, LEVEL, SOURCE,
  ],
  texts: [
    { name: 'title', label: '书名', required: true }, { name: 'chapter', label: '篇章' }, { name: 'content', label: '段落', type: 'area', required: true },
    { name: 'related_vessel_id', label: '对读器物', type: 'vessel' }, LEVEL, SOURCE,
  ],
}
const TABLES = [['vessels', '器物'], ['inscriptions', '铭文'], ['glyphs', '字形'], ['dialect_entries', '方言条目'], ['texts', '传世文献']] as const

export default function Records() {
  const user = useAuth((s) => s.user)!
  const readonly = user.role !== 'researcher'
  const { message } = App.useApp()
  const [params] = useSearchParams()
  const [table, setTable] = useState<string>(() => TABLES.some(([key]) => key === params.get('table')) ? params.get('table')! : 'vessels')
  const [status, setStatus] = useState(() => ['pending', 'approved', 'rejected', ''].includes(params.get('status') ?? 'pending') ? params.get('status') ?? 'pending' : 'pending')
  const [mine, setMine] = useState(false)
  const [edit, setEdit] = useState<any>(null) // {id?, data}
  const [versions, setVersions] = useState<any>(null)
  const [reject, setReject] = useState<any>(null)
  const [form] = Form.useForm()
  const { data, refetch } = useQuery({ queryKey: ['records', table, status, mine], queryFn: () => api.get(`/res/records?table=${table}&status=${status}&mine=${mine}`) })
  const { data: vessels = [] } = useQuery({ queryKey: ['res-vessels'], queryFn: () => api.get('/res/records?table=vessels') })
  const vesselOpts = (vessels.items || []).map((v: any) => ({ value: v.id, label: v.title }))

  const openEdit = (row?: any) => {
    setEdit(row || { data: { level: 'L1', evidence_grade: 'B' } })
    form.setFieldsValue(row ? row.data : { level: 'L1', evidence_grade: 'B' })
  }
  const save = async () => {
    const v = await form.validateFields()
    try {
      if (edit.id) await api.put(`/res/records/${table}/${edit.id}`, { table, data: v })
      else await api.post('/res/records', { table, data: v })
      message.success('已保存，状态为“待审”，需另一名研究员审核')
      setEdit(null)
      refetch()
    } catch (e: any) {
      message.error(e.message)
    }
  }
  const review = async (row: any, approve: boolean, reason = '') => {
    try {
      await api.post(`/res/records/${table}/${row.id}/review`, { approve, reason })
      message.success(approve ? '已审核通过，进入问答检索与图谱' : '已驳回')
      setReject(null)
      refetch()
    } catch (e: any) {
      message.error(e.message)
    }
  }
  const showVersions = async (row: any) => setVersions({ row, list: await api.get(`/res/records/${table}/${row.id}/versions`) })

  return (
    <div className="page">
      <PageHead
        title="数据录入与审核"
        desc="每条记录必须填写来源与数据分级；新录入为“待审”，须另一名研究员审核通过后才进入问答检索（双人原则）。"
        extra={!readonly ? (
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => download('GET', `/res/import/template?kind=${table === 'dialect_entries' ? 'dialect_entries' : 'vessels'}`, `${table === 'dialect_entries' ? '方言' : '器铭'}录入模板.xlsx`)}>
              {table === 'dialect_entries' ? '方言' : '器铭'}模板
            </Button>
            <Upload showUploadList={false} accept=".xlsx" beforeUpload={(f) => {
              const fd = new FormData()
              fd.append('file', f)
              const kind = table === 'dialect_entries' ? 'dialect_entries' : 'vessels'
              api.post(`/res/import?kind=${kind}`, fd).then((r) => {
                message.success(`批量录入 ${r.ok} 条，失败 ${r.errors.length} 条`)
                r.errors.slice(0, 5).forEach((e: any) => message.warning(`第 ${e.line} 行：${e.error}`))
                refetch()
              }).catch((e) => message.error(e.message))
              return false
            }}>
              <Button icon={<UploadOutlined />}>Excel 批量录入</Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>新增记录</Button>
          </Space>
        ) : <span className="tag-gold">管理员 · 只读</span>}
      />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABLES.map(([k, t]) => <span key={k} className={`chip ${table === k ? 'on' : ''}`} onClick={() => setTable(k)}><RareText>{t}</RareText></span>)}
        <span style={{ flex: 1 }} />
        {(['pending', 'approved', 'rejected', ''] as const).map((s) => (
          <span key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
            {{ pending: '待审', approved: '已审核', rejected: '已驳回', '': '全部' }[s]}{s && data?.counts ? ` ${data.counts[s]}` : ''}
          </span>
        ))}
        {!readonly && <span className={`chip ${mine ? 'on' : ''}`} onClick={() => setMine(!mine)}>只看我录入的</span>}
      </div>
      <div className="panel">
        <Table rowKey="id" dataSource={data?.items || []} pagination={{ pageSize: 12 }}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 64 },
            { title: '条目', dataIndex: 'title', render: (v) => <span className="serif" style={{ fontSize: 16 }}><RareText>{v}</RareText></span> },
            { title: '分级', dataIndex: 'level', width: 70, render: (v) => <Tag color={v === 'L1' ? 'green' : v === 'L2' ? 'gold' : 'red'}><RareText>{v}</RareText></Tag> },
            { title: '状态', dataIndex: 'status', width: 90, render: (s) => <StatusTag s={s} /> },
            { title: '录入人', dataIndex: 'created_by', width: 110 },
            { title: '审核人', dataIndex: 'reviewed_by', width: 110 },
            { title: '来源', dataIndex: 'source', ellipsis: true, render: (v) => <span className="note"><RareText>{v}</RareText></span> },
            { title: '更新', dataIndex: 'updated_at', width: 150, render: (v) => v.replace('T', ' ') },
            {
              title: '操作', width: 260, render: (_, r: any) => (
                <Space size={4}>
                  <Button size="small" icon={<HistoryOutlined />} onClick={() => showVersions(r)}>版本</Button>
                  {!readonly && <Button size="small" onClick={() => openEdit(r)}>编辑</Button>}
                  {!readonly && r.status === 'pending' && (
                    r.created_by_id === user.id ? <Tag>本人录入，待他人审核</Tag> : (
                      <>
                        <Popconfirm title="确认审核通过？通过后进入问答检索。" onConfirm={() => review(r, true)}><Button size="small" type="primary">通过</Button></Popconfirm>
                        <Button size="small" danger onClick={() => setReject(r)}>驳回</Button>
                      </>
                    )
                  )}
                </Space>
              ),
            },
          ]} />
      </div>

      <Drawer title={<RareText>{edit?.id ? `编辑 · ${edit.title}` : '新增记录'}</RareText>} open={!!edit} width={560} onClose={() => setEdit(null)}
        extra={<Button type="primary" onClick={save}>保存（进入待审）</Button>} destroyOnClose>
        <Form form={form} layout="vertical">
          {FIELDS[table].map((f) => (
            <Form.Item key={f.name} name={f.name} label={f.label} rules={f.required ? [{ required: true, message: `请填写${f.label}` }] : []}>
              {f.type === 'area' ? <Input.TextArea autoSize={{ minRows: 3 }} />
                : f.type === 'num' ? <InputNumber style={{ width: '100%' }} min={0} />
                : f.type === 'grade' ? <Select options={['A', 'B', 'C', 'D'].map((g) => ({ value: g, label: `${g} 级` }))} />
                : f.type === 'level' ? <Select options={[{ value: 'L1', label: 'L1 公开数据（可送云端模型）' }, { value: 'L2', label: 'L2 内部数据' }, { value: 'L3', label: 'L3 授权受限' }]} />
                : f.type === 'script' ? <Select options={['金文', '石鼓文', '小篆'].map((s) => ({ value: s, label: s }))} />
                : f.type === 'vessel' ? <Select allowClear showSearch optionFilterProp="label" labelRender={o => <RareText>{o.label}</RareText>} optionRender={o => <RareText>{o.label}</RareText>} options={vesselOpts} />
                : f.type === 'file' ? <FileField />
                : <Input />}
            </Form.Item>
          ))}
        </Form>
      </Drawer>

      <Modal title="驳回原因" open={!!reject} onCancel={() => setReject(null)} footer={null} destroyOnClose>
        <Input.TextArea id="rej" autoSize={{ minRows: 3 }} placeholder="请写明驳回理由" />
        <Button danger block style={{ marginTop: 12 }} onClick={() => review(reject, false, (document.getElementById('rej') as HTMLTextAreaElement).value)}>确认驳回</Button>
      </Modal>

      <Modal title={<RareText>{`版本记录 · ${versions?.row?.title || ''}`}</RareText>} open={!!versions} onCancel={() => setVersions(null)} footer={null} width={820}>
        <Table rowKey="version" size="small" pagination={false} dataSource={versions?.list || []}
          expandable={{ expandedRowRender: (r: any, i: number) => <Diff a={versions.list[i + 1]?.data} b={r.data} /> }}
          columns={[
            { title: '版本', dataIndex: 'version', width: 60 }, { title: '操作', dataIndex: 'action' },
            { title: '编辑人', dataIndex: 'editor' }, { title: '时间', dataIndex: 'created_at', render: (v) => v.replace('T', ' ') },
            {
              title: '', width: 90, render: (_, r: any, i: number) => !readonly && i > 0 && (
                <Popconfirm title={`回退到 v${r.version}？回退后重新进入待审。`} onConfirm={async () => {
                  await api.post(`/res/records/${table}/${versions.row.id}/rollback/${r.version}`)
                  message.success('已回退')
                  setVersions(null)
                  refetch()
                }}><a>回退</a></Popconfirm>
              ),
            },
          ]} />
      </Modal>
    </div>
  )
}

function Diff({ a, b }: { a?: any; b: any }) {
  const keys = Object.keys(b || {})
  return (
    <div style={{ fontSize: 13 }}>
      {keys.map((k) => {
        const changed = a && JSON.stringify(a[k]) !== JSON.stringify(b[k])
        return (
          <div key={k} style={{ display: 'flex', gap: 10, padding: '2px 0', background: changed ? 'rgba(201,164,92,.15)' : undefined }}>
            <span style={{ width: 120, color: '#7c847f' }}>{k}</span>
            {changed && <span style={{ textDecoration: 'line-through', color: '#b5452f' }}><RareText>{String(a[k] ?? '')}</RareText></span>}
            <span><RareText>{String(b[k] ?? '')}</RareText></span>
          </div>
        )
      })}
    </div>
  )
}

function FileField({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const { message } = App.useApp()
  return (
    <Space>
      <Input value={value} onChange={(e) => onChange?.(e.target.value)} placeholder="上传后自动填入路径" style={{ width: 300 }} />
      <Upload showUploadList={false} beforeUpload={(f) => {
        const fd = new FormData()
        fd.append('file', f)
        api.post('/res/upload', fd).then((r) => onChange?.(r.path)).catch((e) => message.error(e.message))
        return false
      }}>
        <Button icon={<UploadOutlined />}>上传</Button>
      </Upload>
    </Space>
  )
}
