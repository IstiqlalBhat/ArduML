"use client"

import dynamic from "next/dynamic"
import { Card } from "@/components/ui/card"
import { formatToDateEst, formatToTimeEst } from "@/lib/dateUtils"
import { motion, AnimatePresence } from "framer-motion"
import { useMemo, useState, useCallback } from "react"
import {
  Clock,
  Zap,
  Grid3X3,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Timer,
  Activity
} from "lucide-react"

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false })

interface BinaryStepChartProps {
  title: string
  data: { x: number; y: number }[]
  color: string
  activeLabel?: string
  inactiveLabel?: string
  currentState?: number | null
  icon?: React.ReactNode
}

interface StateEvent {
  index: number
  startTime: number
  endTime: number
  state: boolean
  duration: number
}

interface HeatmapCell {
  hour: number
  dayKey: string
  date: Date
  activeCount: number
  inactiveCount: number
  totalReadings: number
  activePercentage: number
  transitions: number
}

type ViewMode = "step" | "heatmap" | "combined"

export function BinaryStepChart({
  title,
  data,
  color,
  activeLabel = "ON",
  inactiveLabel = "OFF",
  currentState,
  icon,
}: BinaryStepChartProps) {
  const [selectedEvent, setSelectedEvent] = useState<StateEvent | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("combined")
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null)
  const [selectedCell, setSelectedCell] = useState<HeatmapCell | null>(null)

  // Analyze state transitions and events
  const analysis = useMemo(() => {
    if (!data || data.length === 0) return null

    const events: StateEvent[] = []
    let activeTime = 0
    let inactiveTime = 0
    let transitions = 0
    let lastTransitionTime: number | null = null
    let longestActive = 0
    let longestInactive = 0
    let currentActiveStreak = 0
    let currentInactiveStreak = 0

    for (let i = 0; i < data.length; i++) {
      const current = data[i]
      if (current === undefined || current === null) continue

      const isActive = current.y >= 0.5
      const next = data[i + 1]

      if (i > 0) {
        const prev = data[i - 1]
        if (prev) {
          const prevActive = prev.y >= 0.5
          if (isActive !== prevActive) {
            transitions++
            lastTransitionTime = current.x
          }
        }
      }

      if (next) {
        const duration = next.x - current.x
        if (isActive) {
          activeTime += duration
          currentActiveStreak += duration
          if (currentActiveStreak > longestActive) {
            longestActive = currentActiveStreak
          }
          currentInactiveStreak = 0
        } else {
          inactiveTime += duration
          currentInactiveStreak += duration
          if (currentInactiveStreak > longestInactive) {
            longestInactive = currentInactiveStreak
          }
          currentActiveStreak = 0
        }

        events.push({
          index: i,
          startTime: current.x,
          endTime: next.x,
          state: isActive,
          duration,
        })
      }
    }

    const totalTime = activeTime + inactiveTime
    const dutyCycle = totalTime > 0 ? (activeTime / totalTime) * 100 : 0

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
      longestActive,
      longestInactive,
    }
  }, [data])

  // Generate heatmap data grouped by time buckets
  const heatmapData = useMemo(() => {
    if (!data || data.length === 0) return { cells: [], grid: [] }

    const cells: HeatmapCell[] = []
    const hourBuckets = new Map<string, { active: number; inactive: number; transitions: number; readings: number; date: Date }>()

    // Group data by hour
    for (let i = 0; i < data.length; i++) {
      const point = data[i]
      if (!point) continue

      const date = new Date(point.x)
      const hourKey = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}`

      const bucket = hourBuckets.get(hourKey) || { active: 0, inactive: 0, transitions: 0, readings: 0, date: new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()) }
      bucket.readings++

      if (point.y >= 0.5) {
        bucket.active++
      } else {
        bucket.inactive++
      }

      // Check for transition
      if (i > 0) {
        const prev = data[i - 1]
        if (prev && (point.y >= 0.5) !== (prev.y >= 0.5)) {
          bucket.transitions++
        }
      }

      hourBuckets.set(hourKey, bucket)
    }

    // Convert to cells
    hourBuckets.forEach((bucket, key) => {
      cells.push({
        hour: bucket.date.getHours(),
        dayKey: key.substring(0, 13), // YYYY-MM-DD-HH
        date: bucket.date,
        activeCount: bucket.active,
        inactiveCount: bucket.inactive,
        totalReadings: bucket.readings,
        activePercentage: bucket.readings > 0 ? (bucket.active / bucket.readings) * 100 : 0,
        transitions: bucket.transitions,
      })
    })

    // Group by day for grid display
    const dayMap = new Map<string, HeatmapCell[]>()
    cells.forEach(cell => {
      const dayKey = cell.date.toDateString()
      const existing = dayMap.get(dayKey) || []
      existing.push(cell)
      dayMap.set(dayKey, existing)
    })

    const grid = Array.from(dayMap.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([dayKey, dayCells]) => ({
        date: new Date(dayKey),
        cells: dayCells.sort((a, b) => a.hour - b.hour),
      }))

    return { cells, grid }
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

  // Navigate between events
  const navigateEvent = useCallback((direction: 'prev' | 'next') => {
    if (!analysis || !selectedEvent) return

    const currentIndex = analysis.events.findIndex(e => e.startTime === selectedEvent.startTime)
    let newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1

    if (newIndex < 0) newIndex = analysis.events.length - 1
    if (newIndex >= analysis.events.length) newIndex = 0

    setSelectedEvent(analysis.events[newIndex])
  }, [analysis, selectedEvent])

  const series = [{
    name: title,
    data: data || [],
  }]

  // Safe chart options without problematic annotations
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
        dataPointSelection: function(_event: unknown, _chartContext: unknown, config: { dataPointIndex: number }) {
          if (analysis && config.dataPointIndex >= 0 && config.dataPointIndex < analysis.events.length) {
            setSelectedEvent(analysis.events[config.dataPointIndex])
          }
        },
        markerClick: function(_event: unknown, _chartContext: unknown, opts: { dataPointIndex: number }) {
          if (analysis && opts.dataPointIndex >= 0 && opts.dataPointIndex < analysis.events.length) {
            setSelectedEvent(analysis.events[opts.dataPointIndex])
          }
        },
      },
    },
    stroke: {
      curve: "stepline",
      width: 3,
      colors: [color],
    },
    fill: {
      type: "gradient",
      gradient: {
        type: "vertical",
        shadeIntensity: 0.8,
        opacityFrom: 0.7,
        opacityTo: 0.05,
        stops: [0, 100],
        colorStops: [
          { offset: 0, color: color, opacity: 0.6 },
          { offset: 50, color: color, opacity: 0.2 },
          { offset: 100, color: color, opacity: 0 },
        ],
      },
    },
    markers: {
      size: 0,
      colors: [color],
      strokeColors: "#18181b",
      strokeWidth: 2,
      hover: {
        size: 8,
        sizeOffset: 3,
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
          width: 2,
          dashArray: 0,
        },
      },
    },
    yaxis: {
      min: -0.15,
      max: 1.25,
      tickAmount: 2,
      labels: {
        style: {
          colors: "#71717a",
          fontSize: "11px",
          fontFamily: "inherit",
          fontWeight: 600,
        },
        formatter: (val: number) => {
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
      custom: function({ dataPointIndex }: { dataPointIndex: number }) {
        if (!data || dataPointIndex < 0 || !data[dataPointIndex]) return ""

        const point = data[dataPointIndex]
        const state = point.y >= 0.5
        const time = formatToDateEst(point.x)
        const nextPoint = data[dataPointIndex + 1]
        const prevPoint = data[dataPointIndex - 1]
        const duration = nextPoint ? formatDuration(nextPoint.x - point.x) : "ongoing"
        const isTransition = prevPoint && (point.y >= 0.5) !== (prevPoint.y >= 0.5)

        const stateColor = state ? color : "#52525b"
        const stateLabel = state ? activeLabel : inactiveLabel

        return `
          <div style="background: rgba(24,24,27,0.95); border: 1px solid #3f3f46; border-radius: 12px; padding: 12px; min-width: 180px; backdrop-filter: blur(8px);">
            <div style="font-size: 11px; color: #71717a; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              ${time}
            </div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 14px; height: 14px; border-radius: 50%; background: ${stateColor}; box-shadow: 0 0 8px ${stateColor}80;"></div>
                <span style="font-size: 14px; font-weight: 700; color: ${stateColor};">${stateLabel}</span>
              </div>
              ${isTransition ? `<span style="font-size: 9px; padding: 2px 6px; border-radius: 9999px; background: ${stateColor}30; color: ${stateColor}; font-weight: 600;">CHANGE</span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #a1a1aa; background: rgba(39,39,42,0.5); border-radius: 8px; padding: 6px 8px;">
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Duration: <span style="color: #e4e4e7; font-weight: 600;">${duration}</span>
            </div>
          </div>
        `
      },
    },
    dataLabels: {
      enabled: false,
    },
  }

  // Get color intensity for heatmap cell
  const getHeatmapCellStyle = (cell: HeatmapCell) => {
    const intensity = cell.activePercentage / 100

    // Parse the hex color
    const r = parseInt(color.slice(1, 3), 16)
    const g = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)

    if (intensity === 0) {
      return {
        backgroundColor: 'rgba(39, 39, 42, 0.6)',
        boxShadow: 'none',
      }
    }

    return {
      backgroundColor: `rgba(${r}, ${g}, ${b}, ${0.2 + intensity * 0.8})`,
      boxShadow: intensity > 0.5 ? `0 0 ${Math.round(intensity * 12)}px rgba(${r}, ${g}, ${b}, ${intensity * 0.5})` : 'none',
    }
  }

  const displayCell = hoveredCell || selectedCell

  return (
    <Card className="h-full bg-zinc-900/60 backdrop-blur-xl border-zinc-800/50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 pb-2 flex items-start justify-between">
        <div className="flex items-center gap-3">
          {icon && (
            <motion.div
              className="p-2.5 rounded-xl transition-colors duration-300"
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
                {data?.length || 0} readings
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

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-zinc-800/80 rounded-lg p-0.5 border border-zinc-700/50">
            <button
              onClick={() => setViewMode("step")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "step"
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Step Chart"
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("heatmap")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "heatmap"
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Status Heatmap"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("combined")}
              className={`p-1.5 rounded-md transition-all ${
                viewMode === "combined"
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Combined View"
            >
              <Activity className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Current state indicator */}
          <AnimatePresence mode="wait">
            <motion.div
              key={isActive ? "active" : "inactive"}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{
                backgroundColor: isActive ? `${color}20` : "rgba(63, 63, 70, 0.3)",
              }}
            >
              <motion.div
                className="w-3 h-3 rounded-full"
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
                className="text-sm font-bold"
                style={{ color: isActive ? color : "#71717a" }}
              >
                {currentState !== null && currentState !== undefined
                  ? (isActive ? activeLabel : inactiveLabel)
                  : "---"}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Quick Stats Bar */}
      {analysis && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-3 text-[10px]">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800/50">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-zinc-400">{activeLabel}:</span>
              <span className="font-semibold" style={{ color }}>{formatDuration(analysis.activeTime)}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800/50">
              <div className="w-2 h-2 rounded-full bg-zinc-600" />
              <span className="text-zinc-400">{inactiveLabel}:</span>
              <span className="font-semibold text-zinc-300">{formatDuration(analysis.inactiveTime)}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-800/50">
              <Zap className="w-3 h-3 text-zinc-400" />
              <span className="text-zinc-400">Duty:</span>
              <span className="font-semibold" style={{ color }}>{analysis.dutyCycle.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Selected Event Detail Panel */}
      <AnimatePresence>
        {selectedEvent && (viewMode === "step" || viewMode === "combined") && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mb-2 overflow-hidden"
          >
            <div
              className="px-4 py-3 rounded-xl border overflow-hidden"
              style={{
                backgroundColor: selectedEvent.state ? `${color}10` : "rgba(63, 63, 70, 0.2)",
                borderColor: selectedEvent.state ? `${color}40` : "rgba(63, 63, 70, 0.4)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigateEvent('prev')}
                      className="p-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4 text-zinc-400" />
                    </button>
                    <button
                      onClick={() => navigateEvent('next')}
                      className="p-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: selectedEvent.state ? color : "#52525b" }}
                    />
                    <span
                      className="font-bold text-sm"
                      style={{ color: selectedEvent.state ? color : "#71717a" }}
                    >
                      {selectedEvent.state ? activeLabel : inactiveLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Clock className="w-3 h-3" />
                    <span>{formatToDateEst(selectedEvent.startTime)}</span>
                    <span className="text-zinc-600">→</span>
                    <span>{formatToTimeEst(selectedEvent.endTime)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/60">
                    <Timer className="w-3 h-3 text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-200">
                      {formatDuration(selectedEvent.duration)}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="p-1.5 rounded-lg hover:bg-zinc-700/50 transition-colors text-zinc-500 hover:text-zinc-300"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Step Chart */}
        {(viewMode === "step" || viewMode === "combined") && (
          <div className={`px-2 ${viewMode === "combined" ? "h-[200px]" : "flex-1"} min-h-0`}>
            {data && data.length > 0 ? (
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
        )}

        {/* Heatmap */}
        {(viewMode === "heatmap" || viewMode === "combined") && (
          <div className={`px-4 pb-4 ${viewMode === "combined" ? "pt-2" : "flex-1 pt-4"} flex flex-col overflow-hidden`}>
            {/* Heatmap Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Grid3X3 className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-semibold">
                  Activity Heatmap
                </span>
              </div>

              {/* Heatmap Legend */}
              <div className="flex items-center gap-2 text-[9px] text-zinc-500">
                <span>{inactiveLabel}</span>
                <div className="flex gap-0.5">
                  {[0, 25, 50, 75, 100].map(pct => (
                    <div
                      key={pct}
                      className="w-4 h-3 rounded-sm"
                      style={getHeatmapCellStyle({ activePercentage: pct } as HeatmapCell)}
                    />
                  ))}
                </div>
                <span>{activeLabel}</span>
              </div>
            </div>

            {/* Hovered/Selected Cell Info */}
            <AnimatePresence>
              {displayCell && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="mb-2 px-3 py-2 rounded-lg bg-zinc-800/70 border border-zinc-700/50"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-zinc-400" />
                      <span className="text-zinc-300 font-medium">
                        {displayCell.date.toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })} at {String(displayCell.hour).padStart(2, '0')}:00
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span style={{ color }}>{displayCell.activePercentage.toFixed(0)}% {activeLabel}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-zinc-400" />
                        <span className="text-zinc-300">{displayCell.transitions} changes</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-3 h-3 text-zinc-400" />
                        <span className="text-zinc-300">{displayCell.totalReadings} readings</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Heatmap Grid */}
            {heatmapData.grid.length > 0 ? (
              <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="flex gap-1 min-w-fit pb-2">
                  {/* Hour labels column */}
                  <div className="flex flex-col gap-[2px] pr-1 sticky left-0 bg-zinc-900/90 z-10">
                    <div className="h-5 text-[9px] text-zinc-600 flex items-center justify-end pr-1 font-medium">

                    </div>
                    {[0, 3, 6, 9, 12, 15, 18, 21].map(hour => (
                      <div
                        key={hour}
                        className="h-4 text-[9px] text-zinc-500 flex items-center justify-end pr-1"
                        style={{ marginTop: hour === 0 ? 0 : `${(3 - 1) * 18}px` }}
                      >
                        {String(hour).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* Day columns with cells */}
                  {heatmapData.grid.map(({ date, cells }) => (
                    <div key={date.toISOString()} className="flex flex-col gap-[2px]">
                      <div className="h-5 text-[9px] text-zinc-400 flex items-center justify-center font-medium px-1">
                        {date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                      </div>
                      {Array.from({ length: 24 }, (_, hour) => {
                        const cell = cells.find(c => c.hour === hour)
                        const isHovered = hoveredCell?.dayKey === cell?.dayKey && hoveredCell?.hour === hour
                        const isSelected = selectedCell?.dayKey === cell?.dayKey && selectedCell?.hour === hour

                        return (
                          <motion.div
                            key={hour}
                            className={`w-6 h-4 rounded-sm cursor-pointer transition-all duration-150 ${
                              isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-900' : ''
                            } ${isHovered ? 'scale-110 z-10' : ''}`}
                            style={cell ? getHeatmapCellStyle(cell) : { backgroundColor: 'rgba(39, 39, 42, 0.3)' }}
                            whileHover={{ scale: 1.15 }}
                            onMouseEnter={() => cell && setHoveredCell(cell)}
                            onMouseLeave={() => setHoveredCell(null)}
                            onClick={() => cell && setSelectedCell(isSelected ? null : cell)}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
                No heatmap data available
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
