import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input, Select, Space, Table, Tag } from 'antd'
import { api } from '../../api'
import { PageHead } from '../../components/ui'

export default function Audit() {
  const [f, setF] = useState({ action: '', q: '', page: 1 })
  const qs = new URLSearchParams({ ...f, page: String(f.page) } as any).toString()
  const { data, isFetching } = useQuery({ queryKey: ['audit', qs], queryFn: () => api.get(`/admin/audit-logs?${qs}`) })
  return (
    <div className="page">
      <PageHead title="审计日志" desc="登录、角色变更、积分调整、导入、规则修改、数据审核、裁断等操作；日志不可删除，保留 ≥ 6 个月。" />
      <Space style={{ marginBottom: 14 }}>
        <Select style={{ width: 180 }} value={f.action} onChange={(action) => setF({ ...f, action, page: 1 })} options={[{ value: '', label: '全部操作' }, ...(data?.actions || []).map((a: string) => ({ value: a, label: a }))]} />
        <Input.Search placeholder="操作人或对象" allowClear onSearch={(q) => setF({ ...f, q, page: 1 })} style={{ width: 240 }} />
      </Space>
      <div className="panel">
        <Table rowKey="id" loading={isFetching} dataSource={data?.items || []} size="small"
          pagination={{ total: data?.total, current: f.page, pageSize: 30, onChange: (page) => setF({ ...f, page }) }}
          columns={[
            { title: '时间', dataIndex: 'created_at', width: 170, render: (v) => v.replace('T', ' ') },
            { title: '操作人', dataIndex: 'actor', width: 110 }, { title: '操作', dataIndex: 'action', width: 130, render: (v) => <Tag>{v}</Tag> },
            { title: '对象', dataIndex: 'target' },
            { title: '详情', dataIndex: 'detail', render: (d) => <span className="note mono">{JSON.stringify(d)}</span> },
            { title: 'IP', dataIndex: 'ip', width: 120 },
          ]} />
      </div>
    </div>
  )
}
