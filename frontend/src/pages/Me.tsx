import { RareText } from '../components/RareText'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Descriptions, Progress, Table, Tag } from 'antd'
import { api } from '../api'
import { useAuth } from '../store'
import { PageHead } from '../components/ui'

const TYPE_LABEL: Record<string, string> = {
  GRANT: '发放', IMPORT: '导入发放', TASK_REWARD: '任务奖励', CONSUME: '消耗', FREEZE: '冻结', UNFREEZE: '解冻', REFUND: '退回', ADJUST: '调整',
}

export default function Me() {
  const user = useAuth((s) => s.user)!
  const nav = useNavigate()
  const { data } = useQuery({ queryKey: ['points-me'], queryFn: () => api.get('/points/me') })
  return (
    <div className="page">
      <PageHead title="个人中心" desc="账号信息、积分余额与近 30 天积分流水。" extra={<Button onClick={() => nav('/change-password')}>修改密码</Button>} />
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 14 }}>账号</div>
          <Descriptions column={1} size="small" items={[
            { label: '姓名', children: user.name }, { label: '账号', children: user.account }, { label: '单位', children: user.org },
            { label: '身份', children: user.identity_type }, { label: '角色', children: user.role_label + (user.is_super ? '（超级管理员）' : '') },
          ]} />
        </div>
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 14 }}>积分余额</div>
          <div className="stat-num" style={{ fontSize: 52 }}>{data?.balance ?? '—'}</div>
          {data?.free && <div className="note">研究员/管理员使用 AI 功能不扣积分，调用量照常记录。</div>}
        </div>
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 14 }}>今日可用额度</div>
          <div className="stat-num" style={{ fontSize: 52 }}>{data ? data.today_left : '—'}</div>
          <Progress percent={data ? Math.round((data.today_used / data.daily_limit) * 100) : 0} strokeColor={{ from: '#3F8F7A', to: '#C9A45C' }} />
          <div className="note">每日消耗上限 {data?.daily_limit} 分，已用 {data?.today_used}（含冻结中）</div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head"><span className="panel-title">近 30 天积分流水</span><span className="panel-cap">余额 = 流水合计</span></div>
        <Table rowKey="id" dataSource={data?.ledger || []} pagination={{ pageSize: 12 }}
          columns={[
            { title: '时间', dataIndex: 'created_at', render: (v) => v.replace('T', ' ') },
            { title: '类型', dataIndex: 'type', render: (v) => <Tag>{TYPE_LABEL[v] || v}</Tag> },
            { title: '变动', dataIndex: 'amount', render: (v) => <span style={{ color: v > 0 ? '#2f6f5e' : '#b5452f', fontWeight: 600 }}>{v > 0 ? '+' : ''}<RareText>{v}</RareText></span> },
            { title: '变动后余额', dataIndex: 'balance_after' },
            { title: '说明', dataIndex: 'reason' },
          ]} />
      </div>
    </div>
  )
}
