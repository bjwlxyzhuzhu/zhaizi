import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, Select, Table, Tooltip } from 'antd'
import { SoundOutlined } from '@ant-design/icons'
import { api } from '../../api'
import { PageHead } from '../../components/ui'

export default function Dialects() {
  const [q, setQ] = useState('')
  const [district, setDistrict] = useState('')
  const { data } = useQuery({
    queryKey: ['dialects', q, district],
    queryFn: () => api.get(`/lib/dialects?q=${encodeURIComponent(q)}&district=${encodeURIComponent(district)}`),
  })
  return (
    <div className="page">
      <PageHead title="关陇方言库" desc="按区县、词条检索；发音人信息已脱敏。方言今读只作辅助证据。" />
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <Input.Search size="large" placeholder="词条或词义" allowClear onSearch={setQ} style={{ maxWidth: 420 }} />
        <Select size="large" style={{ width: 180 }} value={district} onChange={setDistrict}
          options={[{ value: '', label: '全部区县' }, ...(data?.districts || []).map((d: string) => ({ value: d, label: d }))]} />
      </div>
      <div className="panel">
        <Table
          rowKey="id"
          dataSource={data?.items || []}
          pagination={{ pageSize: 15 }}
          columns={[
            { title: '区县', dataIndex: 'district', width: 110 },
            { title: '词条', dataIndex: 'word', render: (v) => <span className="serif" style={{ fontSize: 18 }}>{v}</span> },
            { title: '国际音标', dataIndex: 'ipa', render: (v) => <span className="mono">[{v}]</span> },
            { title: '词义', dataIndex: 'meaning' },
            { title: '发音人', dataIndex: 'speaker', width: 100 },
            {
              title: '音频', dataIndex: 'audio', width: 90,
              render: (a) => a ? (
                <Button size="small" icon={<SoundOutlined />} onClick={() => new Audio(`/api/files/${a}`).play()}>播放</Button>
              ) : (
                <Tooltip title="音频待研究员上传"><Button size="small" disabled icon={<SoundOutlined />} /></Tooltip>
              ),
            },
            { title: '来源', dataIndex: 'source', render: (v) => <span className="note">{v}</span> },
          ]}
        />
      </div>
    </div>
  )
}
