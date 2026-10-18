import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, DatePicker, Input, Select, Space, Table, Tag } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { api, download } from '../../api'
import { PageHead } from '../../components/ui'

const TYPES = ['GRANT', 'IMPORT', 'TASK_REWARD', 'CONSUME', 'FREEZE', 'UNFREEZE', 'REFUND', 'ADJUST']
const LABEL: Record<string, string> = { GRANT: '发放', IMPORT: '导入发放', TASK_REWARD: '任务奖励', CONSUME: '消耗', FREEZE: '冻结', UNFREEZE: '解冻', REFUND: '退回', ADJUST: '调整' }

export default function Points() {
  const [f, setF] = useState({ q: '', type: '', start: '', end: '', page: 1 })
  const qs = new URLSearchParams({ ...f, page: String(f.page) } as any).toString()
  const { data, isFetching } = useQuery({ queryKey: ['ledger', qs], queryFn: () => api.get(`/admin/points/ledger?${qs}`) })
  return (
    <div className="page">
      <PageHead title="积分流水" desc="只增不改的积分记录；任一用户余额 = 其流水合计。可按用户、类型、时间筛选并导出 Excel。"
        extra={<Button icon={<DownloadOutlined />} onClick={() => download('GET', `/admin/points/ledger?${qs}&export=true`, '积分流水.xlsx')}>导出 Excel</Button>} />
      <Space style={{ marginBottom: 14 }} wrap>
        <Input.Search placeholder="姓名或账号" allowClear onSearch={(q) => setF({ ...f, q, page: 1 })} style={{ width: 220 }} />
        <Select style={{ width: 150 }} value={f.type} onChange={(type) => setF({ ...f, type, page: 1 })} options={[{ value: '', label: '全部类型' }, ...TYPES.map((t) => ({ value: t, label: `${LABEL[t]} ${t}` }))]} />
        <DatePicker.RangePicker onChange={(d) => setF({ ...f, start: d?.[0]?.format('YYYY-MM-DD') || '', end: d?.[1]?.format('YYYY-MM-DD') || '', page: 1 })} />
      </Space>
      <div className="panel">
        <Table rowKey="id" loading={isFetching} dataSource={data?.items || []}
          pagination={{ total: data?.total, current: f.page, pageSize: 20, onChange: (page) => setF({ ...f, page }) }}
          columns={[
            { title: '流水号', dataIndex: 'id', width: 80 }, { title: '账号', dataIndex: 'account' }, { title: '姓名', dataIndex: 'name' },
            { title: '类型', dataIndex: 'type', render: (t) => <Tag>{LABEL[t]} · {t}</Tag> },
            { title: '变动', dataIndex: 'amount', render: (v) => <b style={{ color: v > 0 ? '#2f6f5e' : '#b5452f' }}>{v > 0 ? '+' : ''}{v}</b> },
            { title: '变动后余额', dataIndex: 'balance_after' }, { title: '原因', dataIndex: 'reason' },
            { title: '时间', dataIndex: 'created_at', render: (v) => v.replace('T', ' ') },
          ]} />
      </div>
    </div>
  )
}
