import { RareText } from '../../components/RareText'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, Space, Table, Tag } from 'antd'
import { api } from '../../api'
import { useAuth } from '../../store'
import { PageHead } from '../../components/ui'

export default function Submissions() {
  const user = useAuth((s) => s.user)!
  const { message } = App.useApp()
  const [status, setStatus] = useState('pending')
  const [reject, setReject] = useState<any>(null)
  const [publish, setPublish] = useState(false)
  const [reason, setReason] = useState('')
  const [pf] = Form.useForm()
  const { data = [], refetch } = useQuery({ queryKey: ['subs', status], queryFn: () => api.get(`/res/submissions?status=${status}`) })

  const review = async (r: any, approve: boolean, why = '') => {
    try {
      await api.post(`/res/submissions/${r.id}/review`, { approve, reason: why })
      message.success(approve ? '已通过，积分已自动发放（TASK_REWARD）' : '已驳回，用户将收到站内消息')
      setReject(null)
      setReason('')
      refetch()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  return (
    <div className="page">
      <PageHead title="任务审核" desc="查看用户提交的释文纠错与方言标注，通过或驳回（驳回须写原因）；通过后自动发放积分并发送站内消息。"
        extra={user.role === 'researcher' && <Button type="primary" onClick={() => setPublish(true)}>发布方言标注批次</Button>} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[['pending', '待审核'], ['approved', '已通过'], ['rejected', '已驳回']].map(([k, t]) => (
          <span key={k} className={`chip ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}><RareText>{t}</RareText></span>
        ))}
      </div>
      <div className="panel">
        <Table rowKey="id" dataSource={data}
          expandable={{
            expandedRowRender: (r: any) => (
              <div style={{ lineHeight: 1.9 }}>
                {r.content.opinion && <div><b>意见：</b><RareText>{r.content.opinion}</RareText></div>}
                {r.content.basis && <div><b>依据：</b><RareText>{r.content.basis}</RareText></div>}
                {r.content.context && <div className="note" style={{ whiteSpace: 'pre-wrap' }}><b>问答上下文：</b><RareText>{r.content.context}</RareText></div>}
                {r.content.ipa && <div><b>音标：</b><span className="mono">{r.content.original?.ipa ? `${r.content.original.ipa} → ` : ''}{r.content.ipa}</span></div>}
                {r.content.meaning && <div><b>词义：</b>{r.content.original?.meaning && r.content.original.meaning !== r.content.meaning ? `${r.content.original.meaning} → ` : ''}{r.content.meaning}</div>}
                {r.image_url && <img src={r.image_url} style={{ maxHeight: 200, marginTop: 8, borderRadius: 8 }} />}
              </div>
            ),
          }}
          columns={[
            { title: '任务', dataIndex: 'template', width: 130, render: (v) => <Tag color="gold"><RareText>{v}</RareText></Tag> },
            { title: '提交人', dataIndex: 'user', width: 110 },
            { title: '条目', dataIndex: 'target_title', render: (value: string) => <RareText>{value}</RareText> },
            { title: '摘要', render: (_, r: any) => <span className="note"><RareText>{(r.content.opinion || r.content.ipa || '').slice(0, 40)}</RareText></span> },
            { title: '提交时间', dataIndex: 'created_at', width: 150, render: (v) => v.replace('T', ' ') },
            status === 'pending'
              ? { title: '操作', width: 170, render: (_, r: any) => (
                  <Space>
                    <Button size="small" type="primary" onClick={() => review(r, true)}>通过</Button>
                    <Button size="small" danger onClick={() => setReject(r)}>驳回</Button>
                  </Space>
                ) }
              : { title: '结果', width: 220, render: (_, r: any) => (r.status === 'approved' ? `+${r.reward} 积分 · ${r.reviewer}` : `${r.reject_reason} · ${r.reviewer}`) },
          ]} />
      </div>
      <Modal title="驳回原因" open={!!reject} onCancel={() => setReject(null)} onOk={() => review(reject, false, reason)} okButtonProps={{ danger: true, disabled: !reason.trim() }} okText="确认驳回">
        <Input.TextArea value={reason} onChange={(e) => setReason(e.target.value)} autoSize={{ minRows: 3 }} placeholder="驳回须写原因，用户会收到站内消息" />
      </Modal>
      <Modal title="发布方言条目标注批次" open={publish} onCancel={() => setPublish(false)} onOk={async () => {
        const v = await pf.validateFields()
        await api.post('/res/task-batches', { template_code: 'dialect', title: v.title, description: v.description || '' })
        message.success('已发布，用户可在任务中心领取')
        setPublish(false)
      }}>
        <Form form={pf} layout="vertical">
          <Form.Item name="title" label="批次名称" rules={[{ required: true }]}><Input placeholder="如：关陇方言条目标注·第三批" /></Form.Item>
          <Form.Item name="description" label="说明"><Input.TextArea /></Form.Item>
          <div className="note">默认纳入前 20 条已审核方言条目。</div>
        </Form>
      </Modal>
    </div>
  )
}
