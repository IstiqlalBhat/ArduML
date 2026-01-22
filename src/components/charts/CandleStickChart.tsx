"use client"

import dynamic from "next/dynamic"
import { Card } from "@/components/ui/card"
import { formatToDateEst, formatToTimeEst } from "@/lib/dateUtils"
import { motion } from "framer-motion"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { useMemo } from "react"

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false })

export interface OhlcDataPoint {
  x: number
  y: [number, number, number, number] // [open, high, low, close]
}

interface CandleStickChartProps {
  title: string
  data: OhlcDataPoint[]
  liveValue?: number | null
  unit?: string
  icon?: React.ReactNode
}

export function CandleStickChart({
  title,
  data,
  liveValue,
  unit = "",
  icon,
}: CandleStickChartProps) {
  // Calculate statistics
  const stats = useMemo(() => {
    if (data.length === 0) return null

    const allHighs = data.map(d => d.y[1])
    const allLows = data.map(d => d.y[2])
    const allCloses = data.map(d => d.y[3])

    const min = Math.min(...allLows)
    const max = Math.max(...allHighs)
    const latest = allCloses[allCloses.length - 1]
    const first = data[0].y[0] // First open
    const change = latest - first
    const changePercent = first !== 0 ? ((latest - first) / first) * 100 : 0

    // Count green/red candles
    const greenCandles = data.filter(d => d.y[3] >= d.y[0]).length
    const redCandles = data.length - greenCandles

    return { min, max, latest, change, changePercent, greenCandles, redCandles }
  }, [data])

  const series = [{
    name: title,
    data: data,
  }]

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "candlestick",
      background: "transparent",
      toolbar: {
        show: true,
        tools: {
          download: false,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
        },
        autoSelected: "zoom",
      },
      animations: {
        enabled: false,
      },
      zoom: {
        enabled: true,
        type: "xy",
        autoScaleYaxis: true,
      },
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: "#22c55e", // Green for up
          downward: "#ef4444", // Red for down
        },
        wick: {
          useFillColor: true,
        },
      },
    },
    xaxis: {
      type: "datetime",
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: {
          colors: "#71717a",
          fontSize: "10px",
          fontFamily: "inherit",
        },
        datetimeUTC: false,
        datetimeFormatter: {
          year: "yyyy",
          month: "MMM 'yy",
          day: "dd MMM",
          hour: "HH:mm",
        },
      },
      crosshairs: {
        show: true,
        width: 1,
        position: "back",
        opacity: 0.9,
        stroke: {
          color: "#a1a1aa",
          width: 1,
          dashArray: 0,
        },
      },
      tooltip: {
        enabled: true,
        formatter: (val: string) => formatToDateEst(val),
        offsetY: 0,
        style: {
          fontSize: "11px",
        },
      },
    },
    yaxis: {
      opposite: true, // Price axis on right like trading charts
      labels: {
        style: {
          colors: "#71717a",
          fontSize: "10px",
          fontFamily: "inherit",
        },
        formatter: (val) => `${val.toFixed(1)}`,
      },
      crosshairs: {
        show: true,
        position: "back",
        stroke: {
          color: "#a1a1aa",
          width: 1,
          dashArray: 0,
        },
      },
      tooltip: {
        enabled: true,
      },
    },
    grid: {
      borderColor: "#27272a",
      strokeDashArray: 0,
      xaxis: {
        lines: {
          show: true,
        },
      },
      yaxis: {
        lines: {
          show: true,
        },
      },
      padding: {
        top: 10,
        right: 10,
        bottom: 0,
        left: 10,
      },
    },
    tooltip: {
      enabled: true,
      shared: false,
      theme: "dark",
      custom: function({ seriesIndex, dataPointIndex, w }) {
        if (dataPointIndex < 0 || !data[dataPointIndex]) return ""

        const point = data[dataPointIndex]
        const time = formatToDateEst(point.x)
        const open = point.y[0]
        const high = point.y[1]
        const low = point.y[2]
        const close = point.y[3]
        const change = close - open
        const changePercent = open !== 0 ? ((close - open) / open) * 100 : 0
        const isUp = close >= open

        return `
          <div style="background: rgba(24, 24, 27, 0.98); border: 1px solid #3f3f46; border-radius: 8px; padding: 12px; min-width: 200px; font-family: inherit;">
            <div style="color: #a1a1aa; font-size: 11px; margin-bottom: 8px; font-weight: 500;">${time}</div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 12px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #71717a;">O</span>
                <span style="color: #e4e4e7; font-family: monospace;">${open.toFixed(2)}${unit}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #71717a;">H</span>
                <span style="color: #22c55e; font-family: monospace;">${high.toFixed(2)}${unit}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #71717a;">L</span>
                <span style="color: #ef4444; font-family: monospace;">${low.toFixed(2)}${unit}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #71717a;">C</span>
                <span style="color: ${isUp ? '#22c55e' : '#ef4444'}; font-family: monospace; font-weight: 600;">${close.toFixed(2)}${unit}</span>
              </div>
            </div>

            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #3f3f46; display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #71717a; font-size: 11px;">Change</span>
              <span style="color: ${isUp ? '#22c55e' : '#ef4444'}; font-size: 12px; font-weight: 600; font-family: monospace;">
                ${isUp ? '+' : ''}${change.toFixed(2)} (${isUp ? '+' : ''}${changePercent.toFixed(2)}%)
              </span>
            </div>
          </div>
        `
      },
    },
    annotations: liveValue !== null && liveValue !== undefined
      ? {
          yaxis: [
            {
              y: liveValue,
              borderColor: "#a855f7",
              borderWidth: 1,
              strokeDashArray: 4,
              label: {
                borderColor: "#a855f7",
                borderWidth: 1,
                borderRadius: 4,
                style: {
                  color: "#fff",
                  background: "#a855f7",
                  fontSize: "11px",
                  fontWeight: "600",
                  padding: {
                    left: 8,
                    right: 8,
                    top: 4,
                    bottom: 4,
                  },
                },
                text: `${liveValue.toFixed(2)}${unit}`,
                position: "right",
                offsetX: 0,
              },
            },
          ],
        }
      : undefined,
  }

  const TrendIcon = stats
    ? stats.change > 0
      ? TrendingUp
      : stats.change < 0
      ? TrendingDown
      : Minus
    : Minus

  const trendColor = stats
    ? stats.change > 0
      ? "text-emerald-400"
      : stats.change < 0
      ? "text-red-400"
      : "text-zinc-400"
    : "text-zinc-400"

  return (
    <Card className="h-full bg-zinc-900/60 backdrop-blur-xl border-zinc-800/50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 pb-2 flex items-start justify-between border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="p-2 rounded-lg bg-zinc-800/50">
              {icon}
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-zinc-200">
              {title}
            </h3>
            {stats && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-zinc-500">
                  L: <span className="text-red-400 font-mono">{stats.min.toFixed(1)}</span>
                </span>
                <span className="text-[10px] text-zinc-500">
                  H: <span className="text-emerald-400 font-mono">{stats.max.toFixed(1)}</span>
                </span>
                <span className="text-[10px] text-zinc-500">
                  <span className="text-emerald-400">{stats.greenCandles}</span>
                  {" / "}
                  <span className="text-red-400">{stats.redCandles}</span>
                  {" candles"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Live value display */}
        <div className="flex flex-col items-end">
          {liveValue !== null && liveValue !== undefined ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              key={liveValue}
              className="flex flex-col items-end"
            >
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2 h-2 rounded-full bg-purple-500"
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-2xl font-bold text-white font-mono">
                  {liveValue.toFixed(2)}
                </span>
                <span className="text-sm text-zinc-500">{unit}</span>
              </div>
              {stats && (
                <div className={`flex items-center gap-1 mt-1 ${trendColor}`}>
                  <TrendIcon className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold font-mono">
                    {stats.change > 0 ? "+" : ""}{stats.change.toFixed(2)} ({stats.changePercent.toFixed(2)}%)
                  </span>
                </div>
              )}
            </motion.div>
          ) : (
            <span className="text-zinc-500 text-sm">No live data</span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 p-2 min-h-0">
        {data.length > 0 ? (
          <Chart
            options={options}
            series={series}
            type="candlestick"
            height="100%"
          />
        ) : (
          <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
            No data available
          </div>
        )}
      </div>
    </Card>
  )
}
