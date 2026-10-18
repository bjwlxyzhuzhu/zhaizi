import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, Progress, Table, Tag, Upload } from 'antd'
import { ArrowRightOutlined, AudioOutlined, EditOutlined, ReadOutlined, UploadOutlined } from '@ant-design/icons'
import { api } from '../api'
import { PageHead, refreshMe } from '../components/ui'

const ICON: Record<string, JSX.Element> = { correction: <EditOutlined />, dialect: <AudioOutlined />, source: <ReadOutlined /> }
const ST: Record<string, [string, string]> = { pending: ['待审核', 'gold'], approved: ['已通过', 'green'], rejected: ['已驳回', 'red'] }

export default function Tasks() {
  const { message } = App.useApp()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'open' | 'pending' | 'done' | 'ledger'>('open')
  const { data, refetch } = useQuery({ queryKey: ['tasks'], queryFn: () => api.get('/tasks') })
  const { data: pts } = useQuery({ queryKey: ['points-me'], queryFn: () => api.get('/points/me') })
  const [form, setForm] = useState<{ code: string; prefill?: any } | null>(null)
  const [batch, setBatch] = useState<any>(null)
  const [img, setImg] = useState<File | null>(null)
  const [f] = Form.useForm()

  // QA-9：从问答“标记有误”带入上下文
  useEffect(() => {
    if (params.get('correction')) {
      const raw = sessionStorage.getItem('zz_correction')
      if (raw) {
        const d = JSON.parse(raw)
        setForm({ code: 'correction', prefill: d })
        f.setFieldsValue({ target_title: d.target_title, opinion: '', basis: '', context: `问：${d.context.question}\n答：${d.context.answer}` })
        sessionStorage.removeItem('zz_correction')
      }
      setParams({}, { replace: true })
    }
  }, [params, setParams, f])

  const submit = async () => {
    const v = await f.validateFields()
    const fd = new FormData()
    const code = form!.code
    fd.append('target_type', form?.prefill?.target_type || (code === 'source' ? 'vessels' : 'inscriptions'))
    fd.append('target_id', form?.prefill?.target_id || v.target_title)
    fd.append('target_title', v.target_title)
    fd.append('content', JSON.stringify({ opinion: v.opinion, basis: v.basis, context: v.context, message_id: form?.prefill?.context?.message_id }))
    if (img) fd.append('image', img)
    try {
      await api.post(`/tasks/${code}/submissions`, fd)
      message.success('已提交，等待研究员审核')
      setForm(null)
      setImg(null)
      f.resetFields()
      refetch()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const openBatch = async (id: number) => setBatch(await api.get(`/tasks/batches/${id}`))
  const submitDialect = async (item: any, ipa: string, meaning: string) => {
    const fd = new FormData()
    fd.append('target_type', 'dialect_entries')
    fd.append('target_id', String(item.id))
    fd.append('target_title', `方言·${item.word}（${item.district}）`)
    fd.append('batch_id', String(batch.id))
    fd.append('content', JSON.stringify({ ipa, meaning, original: { ipa: item.ipa, meaning: item.meaning } }))
    try {
      await api.post('/tasks/dialect/submissions', fd)
      message.success('已提交')
      openBatch(batch.id)
      refetch()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  const mine: any[] = data?.mine || []
  const rules = pts?.rules || {}
  return (
    <div className="page">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'end', marginBottom: 20 }}>
        <PageHead title="任务中心" desc="以研究任务参与文化资料整理，在审核通过后获得积分；所有奖励均有流水记录。" />
        <div className="panel" style={{ padding: '18px 24px', marginBottom: 26 }}>
          <div className="note">我的积分余额</div>
          <div className="serif" style={{ fontSize: 44, color: '#2f6f5e' }}>{pts?.balance ?? '—'} <span style={{ fontSize: 18 }}>pts</span></div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {([['open', '可领取任务'], ['pending', `进行中（${mine.filter((m) => m.status === 'pending').length}）`], ['done', '已完成'], ['ledger', '积分流水']] as const).map(([k, t]) => (
          <span key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{t}</span>
        ))}
      </div>

      {tab === 'open' && (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            {(data?.templates || []).map((t: any) => (
              <div key={t.id} className="panel">
                <div style={{ fontSize: 24, color: '#b7893a' }}>{ICON[t.code] || <EditOutlined />}</div>
                <div className="serif" style={{ fontSize: 24, margin: '10px 0 8px' }}>{t.name}</div>
                <div className="note" style={{ fontSize: 14, minHeight: 44 }}>{t.description}</div>
                <div className="row-line" style={{ borderBottom: 0, paddingBottom: 0 }}>
                  <span className="tag-gold" style={{ color: '#8a6a2b' }}>+{t.reward} 积分{t.code === 'dialect' ? ' / 条' : t.code === 'correction' ? ' / 采纳' : ''}</span>
                  <span className="note">今日 {t.today}/{t.daily_limit}</span>
                  {t.code === 'dialect' ? (
                    <a onClick={() => data?.batches?.[0] && openBatch(data.batches[0].id)}>查看任务 <ArrowRightOutlined /></a>
                  ) : (
                    <a onClick={() => { setForm({ code: t.code }); f.resetFields() }}>参与任务 <ArrowRightOutlined /></a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 20 }}>
            <div className="panel">
              <div className="panel-head"><span className="panel-title">研究员发布的任务批次</span><span className="panel-cap">IN PROGRESS</span></div>
              {(data?.batches || []).map((b: any) => (
                <div key={b.id} style={{ padding: '10px 0', cursor: 'pointer' }} onClick={() => openBatch(b.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{b.title}</span><span>{b.total ? Math.round((b.done / b.total) * 100) : 0}%</span></div>
                  <Progress percent={b.total ? Math.round((b.done / b.total) * 100) : 0} showInfo={false} strokeColor={{ from: '#3F8F7A', to: '#C9A45C' }} />
                  <div className="note">{b.description}</div>
                </div>
              ))}
            </div>
            <div className="panel">
              <div className="panel-head"><span className="panel-title">积分与贡献</span><span className="panel-cap">MY CONTRIBUTIONS</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                <div className="stat-card"><div className="stat-num">{pts?.summary?.granted ?? 0}</div><div className="stat-label">发放积分</div></div>
                <div className="stat-card"><div className="stat-num">+{pts?.summary?.task_reward ?? 0}</div><div className="stat-label">任务奖励</div></div>
                <div className="stat-card"><div className="stat-num">{mine.filter((m) => m.status === 'approved').length}</div><div className="stat-label">通过的提交</div></div>
              </div>
              <div className="note" style={{ marginTop: 16, fontSize: 13 }}>
                文字问答 −{rules.cost_qa}分/次；图像释读 −{rules.cost_vision}分/次；导出报告 −{rules.cost_export}分/次；每日消耗上限 {rules.daily_limit} 分。请求失败时自动退还冻结积分。
              </div>
            </div>
          </div>
        </>
      )}

      {(tab === 'pending' || tab === 'done') && (
        <div className="panel">
          <Table rowKey="id" dataSource={mine.filter((m) => (tab === 'pending' ? m.status === 'pending' : m.status !== 'pending'))}
            columns={[
              { title: '任务', dataIndex: 'template', width: 130 },
              { title: '条目', dataIndex: 'target_title' },
              { title: '内容', dataIndex: 'content', render: (c) => <span className="note">{c.opinion || c.ipa || ''} {c.meaning || ''}</span> },
              { title: '状态', dataIndex: 'status', width: 100, render: (s) => <Tag color={ST[s][1]}>{ST[s][0]}</Tag> },
              { title: '结果', render: (_, r: any) => (r.status === 'approved' ? <span className="gold">+{r.reward} 积分</span> : r.reject_reason) },
              { title: '提交时间', dataIndex: 'created_at', width: 160, render: (v) => v.replace('T', ' ') },
            ]} />
        </div>
      )}

      {tab === 'ledger' && (
        <div className="panel">
          <Table rowKey="id" dataSource={pts?.ledger || []} pagination={{ pageSize: 15 }}
            columns={[
              { title: '时间', dataIndex: 'created_at', render: (v) => v.replace('T', ' ') },
              { title: '类型', dataIndex: 'type', render: (v) => <Tag>{v}</Tag> },
              { title: '变动', dataIndex: 'amount', render: (v) => <span style={{ color: v > 0 ? '#2f6f5e' : '#b5452f' }}>{v > 0 ? '+' : ''}{v}</span> },
              { title: '余额', dataIndex: 'balance_after' },
              { title: '说明', dataIndex: 'reason' },
            ]} />
        </div>
      )}

      <Modal title={form?.code === 'source' ? '文献来源补充' : '释文纠错'} open={!!form} onCancel={() => setForm(null)} onOk={submit} okText="提交" width={620} destroyOnClose>
        <Form form={f} layout="vertical">
          <Form.Item name="target_title" label="条目" rules={[{ required: true, message: '请填写或选择条目' }]}>
            <Input placeholder="如：何尊·铭文" />
          </Form.Item>
          {form?.prefill && (
            <Form.Item name="context" label="问答上下文（自动带入）">
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} readOnly />
            </Form.Item>
          )}
          <Form.Item name="opinion" label={form?.code === 'source' ? '补充的著录 / 出处' : '修改意见'} rules={[{ required: true }]}>
            <Input.TextArea autoSize={{ minRows: 3 }} />
          </Form.Item>
          <Form.Item name="basis" label="依据" rules={[{ required: true }]}>
            <Input.TextArea autoSize={{ minRows: 2 }} placeholder="著录、拓片、论文等" />
          </Form.Item>
          <Upload beforeUpload={(file) => { setImg(file); return false }} maxCount={1} accept=".jpg,.jpeg,.png" onRemove={() => setImg(null)}>
            <Button icon={<UploadOutlined />}>上传依据图片（可选）</Button>
          </Upload>
        </Form>
      </Modal>

      <Modal title={batch?.title} open={!!batch} onCancel={() => setBatch(null)} footer={null} width={900} destroyOnClose>
        <div className="note" style={{ marginBottom: 12 }}>{batch?.description} 听音频（待上传时按词条校对），填写或校对音标与词义。</div>
        <Table rowKey="id" size="small" pagination={false} dataSource={batch?.items || []}
          columns={[
            { title: '区县', dataIndex: 'district', width: 80 },
            { title: '词条', dataIndex: 'word', width: 90, render: (v) => <span className="serif" style={{ fontSize: 16 }}>{v}</span> },
            { title: '现音标', dataIndex: 'ipa', width: 120, render: (v) => <span className="mono">{v}</span> },
            { title: '校对', render: (_, r: any) => (r.done ? <Tag color="green">已提交</Tag> : <DialectRow item={r} onSubmit={submitDialect} />) },
          ]} />
      </Modal>
    </div>
  )
}

function DialectRow({ item, onSubmit }: { item: any; onSubmit: (i: any, ipa: string, m: string) => void }) {
  const [ipa, setIpa] = useState(item.ipa)
  const [m, setM] = useState(item.meaning)
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <Input size="small" value={ipa} onChange={(e) => setIpa(e.target.value)} style={{ width: 130 }} className="mono" />
      <Input size="small" value={m} onChange={(e) => setM(e.target.value)} />
      <Button size="small" type="primary" onClick={() => { onSubmit(item, ipa, m); refreshMe() }}>提交</Button>
    </div>
  )
}
