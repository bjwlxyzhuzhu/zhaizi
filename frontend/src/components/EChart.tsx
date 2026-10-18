import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

export default function EChart({ option, height = 220 }: { option: any; height?: number | string }) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts>()
  useEffect(() => {
    chart.current = echarts.init(ref.current!, undefined, { renderer: 'canvas' })
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(ref.current!)
    return () => {
      ro.disconnect()
      chart.current?.dispose()
    }
  }, [])
  useEffect(() => {
    chart.current?.setOption(option, true)
  }, [option])
  return <div ref={ref} style={{ height, width: '100%' }} />
}

export const AXIS = {
  axisLine: { lineStyle: { color: '#2a3733' } },
  axisLabel: { color: '#9aa39e', fontSize: 11 },
  splitLine: { lineStyle: { color: '#1c2622' } },
}
