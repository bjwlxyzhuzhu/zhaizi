import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { App, Button, InputNumber, Table } from 'antd'
import { api } from '../../api'
import { PageHead } from '../../components/ui'

export default function Rules() {
  const { message } = App.useApp()
  const { data = [], refetch } = useQuery({ queryKey: ['rules'], queryFn: () => api.get('/admin/point-rules') })
  const [vals, setVals] = useState<Record<string, number>>({})
  useEffect(() => {
    setVals(Object.fromEntries(data.map((r: any) => [r.key, r.value])))
  }, [data])
  const save = async () => {
    try {
      await api.put('/admin/point-rules', vals)
      message.success('已保存，立即对新请求生效；修改记录写入审计日志')
      refetch()
    } catch (e: any) {
      message.error(e.message)
    }
  }
  return (
    <div className="page">
      <PageHead title="积分规则" desc="各操作扣分值、任务奖励值、新用户默认积分与每日消耗上限。修改不影响历史流水。" extra={<Button type="primary" onClick={save}>保存规则</Button>} />
      <div className="panel" style={{ maxWidth: 900 }}>
        <Table rowKey="key" pagination={false} dataSource={data}
          columns={[
            { title: '规则', dataIndex: 'label' },
            { title: '键', dataIndex: 'key', render: (v) => <span className="mono note">{v}</span> },
            { title: '数值', dataIndex: 'key', width: 160, render: (k) => <InputNumber min={0} value={vals[k]} onChange={(v) => setVals({ ...vals, [k]: v ?? 0 })} /> },
            { title: '最近修改', dataIndex: 'updated_at', render: (v) => v.replace('T', ' ') },
          ]} />
        <div className="note" style={{ marginTop: 14 }}>管理员、研究员调用 AI 不扣积分，但调用量照常记录（影子消耗），在运营视图中按角色统计。</div>
      </div>
    </div>
  )
}
