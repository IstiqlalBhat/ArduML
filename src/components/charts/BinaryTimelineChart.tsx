"use client"

import dynamic from "next/dynamic"
import { Card } from "@/components/ui/card"
import { formatToDateEst, formatToTimeEst } from "@/lib/dateUtils"
import { motion, AnimatePresence } from "framer-motion"
import { useMemo, useState } from "react"
import { Clock, Zap, Activity } from "lucide-react"

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false })

interface BinaryTimelineChartProps {
  title: string
  data: { x: number; y: number }[]
  color: string
  activeLabel?: string
  inactiveLabel?: string
  currentState?: number | null
  icon?: React.ReactNode
}

interface StateEvent {
  startTime: number
  endTime: number
  state: boolean
  duration: number
}

export function BinaryTimelineChart({
  title,
  data,
  color,
  activeLabel = "ON",
  inactiveLabel = "OFF",
  currentState,
  icon,
}: BinaryTimelineChartProps) {
  const [selectedEvent, setSelectedEvent] = useState<{
    time: string
    state: string
    duration?: string
  } | null>(null)

  // Analyze state transitions and events
  const analysis = useMemo(() => {
    if (data.length === 0) return null

    const events: StateEvent[] = []
    let activeTime = 0
    let inactiveTime = 0
    let transitions = 0
    let lastTransitionTime: number | null = null

    for (let i = 0; i < data.length; i++) {
      const current = data[i]
      const isActive = current.y >= 0.5
      const next = data[i + 1]

      if (i > 0) {
        const prev = data[i - 1]
        const prevActive = prev.y >= 0.5
        if (isActive !== prevActive) {
          transitions++
          lastTransitionTime = current.x
        }
      }

      // Calculate duration to next point
      if (next) {
        const duration = next.x - current.x
        if (isActive) {
          activeTime += duration
        } else {
          inactiveTime += duration
        }

        events.push({
          startTime: current.x,
          endTime: next.x,
          state: isActive,
          duration,
        })
      }
    }

    const totalTime = activeTime + inactiveTime
    const dutyCycle = totalTime > 0 ? (activeTime / totalTime) * 100 : 0

    // Calculate average active/inactive durations
    const activePeriods = events.filter(e => e.state)
    const inactivePeriods = events.filter(e => !e.state)

    const avgActiveDuration = activePeriods.length > 0
      ? activePeriods.reduce((sum, e) => sum + e.duration, 0) / activePeriods.length
      : 0

    const avgInactiveDuration = inactivePeriods.length > 0
      ? inactivePeriods.reduce((sum, e) => sum + e.duration, 0) / inactivePeriods.length
      : 0

    return {
      events,
      activeTime,
      inactiveTime,
      totalTime,
      dutyCycle,
      transitions,
      lastTransitionTime,
      avgActiveDuration,
      avgInactiveDuration,
      activePeriods: activePeriods.length,
      inactivePeriods: inactivePeriods.length,
    }
  }, [data])

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m`
  }

  const isActive = currentState !== null && currentState !== undefined && currentState >= 0.5

  const series = [{
    name: title,
    data: data,
  }]

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "area",
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
        enabled: true,
        speed: 300,
      },
      zoom: {
        enabled: true,
        type: "x",
      },
      events: {
        dataPointSelection: function(event, chartContext, config) {
          if (config.dataPointIndex >= 0 && data[config.dataPointIndex]) {
            const point = data[config.dataPointIndex]
            const state = point.y >= 0.5
            const nextPoint = data[config.dataPointIndex + 1]
            const duration = nextPoint ? formatDuration(nextPoint.x - point.x) : "ongoing"

            setSelectedEvent({
              time: formatToDateEst(point.x),
              state: state ? activeLabel : inactiveLabel,
              duration,
            })
          }
        },
        mouseMove: function(event, chartContext, config) {
          if (config.dataPointIndex >= 0 && data[config.dataPointIndex]) {
            const point = data[config.dataPointIndex]
            const state = point.y >= 0.5
            const nextPoint = data[config.dataPointIndex + 1]
            const duration = nextPoint ? formatDuration(nextPoint.x - point.x) : "ongoing"

            setSelectedEvent({
              time: formatToDateEst(point.x),
              state: state ? activeLabel : inactiveLabel,
              duration,
            })
          }
        },
        mouseLeave: function() {
          setSelectedEvent(null)
        },
      },
    },
    stroke: {
      curve: "stepline",
      width: 2,
      colors: [color],
    },
    fill: {
      type: "gradient",
      gradient: {
        type: "vertical",
        shadeIntensity: 0.8,
        opacityFrom: 0.6,
        opacityTo: 0,
        stops: [0, 100],
        colorStops: [
          { offset: 0, color: color, opacity: 0.5 },
          { offset: 100, color: color, opacity: 0 },
        ],
      },
    },
    markers: {
      size: 4,
      colors: [color],
      strokeColors: "#18181b",
      strokeWidth: 2,
      hover: {
        size: 7,
        sizeOffset: 2,
      },
      discrete: data.length > 0 ? data.map((point, index) => {
        // Only show markers at transition points
        const prevPoint = data[index - 1]
        const isTransition = prevPoint && (point.y >= 0.5) !== (prevPoint.y >= 0.5)
        return {
          seriesIndex: 0,
          dataPointIndex: index,
          fillColor: point.y >= 0.5 ? color : "#52525b",
          strokeColor: "#18181b",
          size: isTransition ? 6 : 3,
        }
      }) : [],
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
        stroke: {
          color: color,
          width: 1,
          dashArray: 0,
        },
      },
      tooltip: {
        enabled: true,
        formatter: (val: string) => formatToDateEst(val),
      },
    },
    yaxis: {
      min: -0.1,
      max: 1.2,
      tickAmount: 2,
      labels: {
        style: {
          colors: "#71717a",
          fontSize: "10px",
          fontFamily: "inherit",
        },
        formatter: (val) => {
          if (val >= 0.8) return activeLabel
          if (val <= 0.2) return inactiveLabel
          return ""
        },
      },
    },
    grid: {
      borderColor: "#27272a",
      strokeDashArray: 4,
      padding: {
        top: 10,
        right: 10,
        bottom: 0,
        left: 10,
      },
    },
    tooltip: {
      enabled: true,
      theme: "dark",
      custom: function({ series, seriesIndex, dataPointIndex, w }) {
        if (dataPointIndex < 0 || !data[dataPointIndex]) return ""

        const point = data[dataPointIndex]
        const state = point.y >= 0.5
        const time = formatToDateEst(point.x)
        const nextPoint = data[dataPointIndex + 1]
        const duration = nextPoint ? formatDuration(nextPoint.x - point.x) : "ongoing"

        const stateColor = state ? color : "#52525b"
        const stateLabel = state ? activeLabel : inactiveLabel

        return `
          <div class="bg-zinc-900/95 border border-zinc-700 rounded-lg p-3 shadow-xl backdrop-blur-sm min-w-[180px]">
            <div class="text-xs text-zinc-400 mb-2 font-medium">${time}</div>
            <div class="flex items-center gap-2 mb-2">
              <div class="w-3 h-3 rounded-full" style="background-color: ${stateColor}"></div>
              <span class="text-sm font-semibold" style="color: ${stateColor}">${stateLabel}</span>
            </div>
            <div class="flex items-center gap-2 text-xs text-zinc-500">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Duration: <span class="text-zinc-300">${duration}</span>
            </div>
          </div>
        `
      },
    },
    dataLabels: {
      enabled: false,
    },
  }

  return (
    <Card className="h-full bg-zinc-900/60 backdrop-blur-xl border-zinc-800/50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 pb-2 flex items-start justify-between">
        <div className="flex items-center gap-3">
          {icon && (
            <motion.div
              className="p-2 rounded-lg transition-colors duration-300"
              style={{
                backgroundColor: isActive ? `${color}30` : "rgba(63, 63, 70, 0.3)",
              }}
              animate={isActive ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 1, repeat: Infinity }}
            >
              {icon}
            </motion.div>
          )}
          <div>
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
              {title}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-zinc-500">
                {data.length} readings
              </span>
              {analysis && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span className="text-[10px] text-zinc-500">
                    {analysis.transitions} transitions
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Current state indicator */}
        <AnimatePresence mode="wait">
          <motion.div
            key={isActive ? "active" : "inactive"}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="flex flex-col items-end"
          >
            <div className="flex items-center gap-2">
              <motion.div
                className={`w-3 h-3 rounded-full`}
                style={{ backgroundColor: isActive ? color : "#52525b" }}
                animate={isActive ? {
                  scale: [1, 1.3, 1],
                  boxShadow: [
                    `0 0 0 0 ${color}00`,
                    `0 0 0 8px ${color}40`,
                    `0 0 0 0 ${color}00`,
                  ],
                } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span
                className="text-lg font-bold"
                style={{ color: isActive ? color : "#71717a" }}
              >
                {currentState !== null && currentState !== undefined
                  ? (isActive ? activeLabel : inactiveLabel)
                  : "---"}
              </span>
            </div>
            {analysis && (
              <span className="text-[10px] text-zinc-500 mt-0.5">
                {analysis.dutyCycle.toFixed(1)}% duty cycle
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Stats grid */}
      {analysis && (
        <div className="px-4 pb-2 grid grid-cols-4 gap-2">
          <div className="bg-zinc-800/50 rounded-lg p-2">
            <div className="text-[10px] text-zinc-500 mb-1">Active Time</div>
            <div className="text-xs font-semibold" style={{ color }}>
              {formatDuration(analysis.activeTime)}
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-2">
            <div className="text-[10px] text-zinc-500 mb-1">Inactive Time</div>
            <div className="text-xs font-semibold text-zinc-400">
              {formatDuration(analysis.inactiveTime)}
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-2">
            <div className="text-[10px] text-zinc-500 mb-1">Avg {activeLabel}</div>
            <div className="text-xs font-semibold" style={{ color }}>
              {formatDuration(analysis.avgActiveDuration)}
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-2">
            <div className="text-[10px] text-zinc-500 mb-1">Avg {inactiveLabel}</div>
            <div className="text-xs font-semibold text-zinc-400">
              {formatDuration(analysis.avgInactiveDuration)}
            </div>
          </div>
        </div>
      )}

      {/* Duty cycle bar */}
      {analysis && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-20">{activeLabel}</span>
            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
              <motion.div
                className="h-full rounded-l-full"
                style={{ backgroundColor: color }}
                initial={{ width: 0 }}
                animate={{ width: `${analysis.dutyCycle}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
              <motion.div
                className="h-full bg-zinc-600 rounded-r-full"
                initial={{ width: 0 }}
                animate={{ width: `${100 - analysis.dutyCycle}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
            <span className="text-[10px] text-zinc-500 w-20 text-right">{inactiveLabel}</span>
          </div>
          <div className="flex justify-between text-[10px] text-zinc-600 mt-1 px-20">
            <span>{analysis.dutyCycle.toFixed(1)}%</span>
            <span>{(100 - analysis.dutyCycle).toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* Selected event detail */}
      <AnimatePresence>
        {selectedEvent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mb-2 px-3 py-2 bg-zinc-800/80 rounded-lg border border-zinc-700/50 overflow-hidden"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-zinc-500" />
                <span className="text-zinc-400">{selectedEvent.time}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="font-semibold"
                  style={{
                    color: selectedEvent.state === activeLabel ? color : "#71717a",
                  }}
                >
                  {selectedEvent.state}
                </span>
                {selectedEvent.duration && (
                  <span className="text-zinc-500">
                    for {selectedEvent.duration}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chart */}
      <div className="flex-1 px-2 pb-2 min-h-0">
        {data.length > 0 ? (
          <Chart
            options={options}
            series={series}
            type="area"
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
