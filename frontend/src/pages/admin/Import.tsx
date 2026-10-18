import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, App, Button, Radio, Space, Steps, Table, Tag, Upload } from 'antd'
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons'
import { api, download } from '../../api'
import { PageHead } from '../../components/ui'

const ACT: Record<string, [string, string]> = { create: ['新增', 'green'], update: ['更新', 'blue'], skip: ['跳过', 'default'], error: ['错误', 'red'] }

export default function Import() {
  const { message } = App.useApp()
  const [mode, setMode] = useState('skip')
  const [preview, setPreview] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [onlyErr, setOnlyErr] = useState(false)
  const { data: jobs = [], refetch } = useQuery({ queryKey: ['import-jobs'], queryFn: () => api.get('/admin/import/jobs') })

  const upload = async (file: File) => {
    setBusy(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mode', mode)
      setPreview(await api.post('/admin/import/preview', fd))
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
    return false
  }
  const commit = async () => {
    setBusy(true)
    try {
      const r = await api.post(`/admin/import/${preview.job_id}/commit`)
      setResult(r)
      setPreview(null)
      refetch()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setBusy(false)
    }
  }
  const step = result ? 2 : preview ? 1 : 0
  return (
    <div className="page">
      <PageHead title="Excel 批量导入" desc="下载模板 → 上传并预览校验 → 确认导入 → 下载“账号—初始密码”清单（仅可下载一次）与错误清单。"
        extra={<Button icon={<DownloadOutlined />} onClick={() => download('GET', '/admin/import/template', '用户导入模板.xlsx')}>下载导入模板</Button>} />
      <div className="panel" style={{ marginBottom: 20 }}>
        <Steps current={step} items={[{ title: '上传文件' }, { title: '预览校验' }, { title: '导入结果' }]} style={{ marginBottom: 24 }} />
        {step === 0 && (
          <>
            <Space style={{ marginBottom: 14 }}>
              <span>已存在账号：</span>
              <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
                <Radio value="skip">跳过</Radio>
                <Radio value="update">更新信息（不覆盖密码，积分记“导入发放”流水）</Radio>
              </Radio.Group>
            </Space>
            <Upload.Dragger accept=".xlsx" showUploadList={false} beforeUpload={upload} disabled={busy}>
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p>点击或拖拽 .xlsx 文件到此处</p>
              <p className="note">单次 ≤ 2000 行；管理员不可通过导入设置</p>
            </Upload.Dragger>
          </>
        )}
        {step === 1 && (
          <>
            <Alert type={preview.error ? 'warning' : 'success'} showIcon style={{ marginBottom: 14 }}
              message={`共 ${preview.total} 行：将新增 ${preview.create} 人，将更新 ${preview.update} 人，跳过 ${preview.skip} 人，错误 ${preview.error} 行`}
              description={preview.error ? '错误行不会导入，确认后可下载错误清单（保留原行号与原始数据）。' : undefined} />
            <Space style={{ marginBottom: 10 }}>
              <Radio.Group value={onlyErr} onChange={(e) => setOnlyErr(e.target.value)} optionType="button" options={[{ value: false, label: '全部' }, { value: true, label: '只看错误' }]} />
            </Space>
            <Table rowKey="line" size="small" pagination={{ pageSize: 10 }}
              dataSource={preview.rows.filter((r: any) => !onlyErr || r.action === 'error')}
              rowClassName={(r: any) => (r.action === 'error' ? 'row-err' : '')}
              columns={[
                { title: '行号', dataIndex: 'line', width: 64 },
                { title: '处理', dataIndex: 'action', width: 80, render: (a) => <Tag color={ACT[a][1]}>{ACT[a][0]}</Tag> },
                { title: '账号', render: (_, r: any) => r.raw[0] }, { title: '姓名', render: (_, r: any) => r.raw[1] },
                { title: '单位', render: (_, r: any) => r.raw[2] }, { title: '角色', render: (_, r: any) => r.raw[4] },
                { title: '初始积分', render: (_, r: any) => r.data.points },
                { title: '错误原因', dataIndex: 'errors', render: (e: string[]) => <span style={{ color: '#b5452f' }}>{e.join('；')}</span> },
              ]} />
            <Space style={{ marginTop: 14 }}>
              <Button onClick={() => setPreview(null)}>重新上传</Button>
              <Button type="primary" loading={busy} disabled={!preview.create && !preview.update} onClick={commit}>确认导入</Button>
            </Space>
          </>
        )}
        {step === 2 && (
          <>
            <Alert type="success" showIcon message={`导入完成：新增 ${result.created} 人，更新 ${result.updated} 人，失败 ${result.failed} 行`} style={{ marginBottom: 14 }} />
            <Space>
              <Button type="primary" icon={<DownloadOutlined />} disabled={!result.created}
                onClick={() => download('GET', `/admin/import/${result.job_id}/result?kind=success`, `导入成功清单_${result.job_id}.xlsx`).then(() => refetch()).catch((e) => message.error(e.message))}>
                下载成功清单（含初始密码，仅一次）
              </Button>
              <Button icon={<DownloadOutlined />} onClick={() => download('GET', `/admin/import/${result.job_id}/result?kind=error`, `导入错误清单_${result.job_id}.xlsx`)}>下载错误清单</Button>
              <Button onClick={() => setResult(null)}>继续导入</Button>
            </Space>
          </>
        )}
      </div>
      <div className="panel">
        <div className="panel-head"><span className="panel-title">导入记录</span></div>
        <Table rowKey="id" size="small" dataSource={jobs}
          columns={[
            { title: '时间', dataIndex: 'created_at', render: (v) => v.replace('T', ' ') }, { title: '操作人', dataIndex: 'operator' },
            { title: '文件', dataIndex: 'filename' }, { title: '总行数', dataIndex: 'total' }, { title: '新增', dataIndex: 'created' },
            { title: '更新', dataIndex: 'updated' }, { title: '失败', dataIndex: 'failed' },
            { title: '密码清单', dataIndex: 'result_downloaded', render: (d) => (d ? <Tag>已下载</Tag> : <Tag color="gold">未下载</Tag>) },
            { title: '', render: (_, r: any) => <a onClick={() => download('GET', `/admin/import/${r.id}/result?kind=error`, `导入错误清单_${r.id}.xlsx`)}>错误清单</a> },
          ]} />
      </div>
    </div>
  )
}
