'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useFirebaseSensor } from '@/hooks/useFirebaseSensor'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, RefreshCw, Sun, Activity, Zap, Grid3X3 } from 'lucide-react'

interface HeatmapDataPoint {
    timestamp: number
    value: number
    readings: number
}

interface HeatmapCell {
    hour: number
    dayIndex: number
    date: Date
    value: number
    readings: number
}

const TIME_RANGES = {
    '1h': { label: '1 Hour', apiRange: '1h', description: 'Last hour, per minute' },
    '6h': { label: '6 Hours', apiRange: '6h', description: 'Last 6 hours' },
    '24h': { label: '24 Hours', apiRange: '24h', description: 'Last 24 hours' },
    '3d': { label: '3 Days', apiRange: '3d', description: 'Last 3 days' },
    '7d': { label: '7 Days', apiRange: '7d', description: 'Last week' },
} as const

type TimeRangeKey = keyof typeof TIME_RANGES

export function HeatmapController() {
    const [resolution, setResolution] = useState<TimeRangeKey>('24h')
    const [lightData, setLightData] = useState<HeatmapDataPoint[]>([])
    const [motionData, setMotionData] = useState<HeatmapDataPoint[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
    const [hoveredCell, setHoveredCell] = useState<{ sensor: 'light' | 'motion', cell: HeatmapCell } | null>(null)

    const { current: liveData, isConnected: isFirebaseConnected } = useFirebaseSensor()

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        try {
            const res = await fetch(`/api/heatmap?range=${TIME_RANGES[resolution].apiRange}`)
            if (res.ok) {
                const data = await res.json()
                setLightData(data.light || [])
                setMotionData(data.motion || [])
                setLastUpdate(new Date())
            }
        } catch (e) {
            console.error('Error fetching heatmap data:', e)
        } finally {
            setIsLoading(false)
        }
    }, [resolution])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 5000)
        return () => clearInterval(interval)
    }, [fetchData])

    // Process data into a grid format (days x hours)
    const processToGrid = useCallback((data: HeatmapDataPoint[]): HeatmapCell[] => {
        if (!data || data.length === 0) return []

        const cells: HeatmapCell[] = []
        const seen = new Set<string>()

        data.forEach(point => {
            const date = new Date(point.timestamp * 1000)
            const key = `${date.toDateString()}-${date.getHours()}`

            if (!seen.has(key)) {
                seen.add(key)
                cells.push({
                    hour: date.getHours(),
                    dayIndex: Math.floor(date.getTime() / (24 * 60 * 60 * 1000)),
                    date: new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()),
                    value: point.value,
                    readings: point.readings
                })
            }
        })

        return cells.sort((a, b) => a.date.getTime() - b.date.getTime())
    }, [])

    // Group cells by day for grid display
    const groupByDay = useCallback((cells: HeatmapCell[]) => {
        const dayMap = new Map<number, HeatmapCell[]>()

        cells.forEach(cell => {
            const existing = dayMap.get(cell.dayIndex) || []
            existing.push(cell)
            dayMap.set(cell.dayIndex, existing)
        })

        return Array.from(dayMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([dayIndex, dayCells]) => ({
                dayIndex,
                date: dayCells[0]?.date || new Date(),
                cells: dayCells.sort((a, b) => a.hour - b.hour)
            }))
    }, [])

    const lightGrid = useMemo(() => groupByDay(processToGrid(lightData)), [lightData, processToGrid, groupByDay])
    const motionGrid = useMemo(() => groupByDay(processToGrid(motionData)), [motionData, processToGrid, groupByDay])

    // Stats
    const lightStats = useMemo(() => {
        if (lightData.length === 0) return { avg: 0, total: 0 }
        const total = lightData.reduce((sum, d) => sum + d.readings, 0)
        const weightedSum = lightData.reduce((sum, d) => sum + d.value * d.readings, 0)
        return { avg: total > 0 ? (weightedSum / total) * 100 : 0, total }
    }, [lightData])

    const motionStats = useMemo(() => {
        if (motionData.length === 0) return { avg: 0, total: 0 }
        const total = motionData.reduce((sum, d) => sum + d.readings, 0)
        const weightedSum = motionData.reduce((sum, d) => sum + d.value * d.readings, 0)
        return { avg: total > 0 ? (weightedSum / total) * 100 : 0, total }
    }, [motionData])

    const isLightActive = liveData.light !== null && liveData.light >= 0.5
    const isMotionActive = liveData.motion !== null && liveData.motion >= 0.5

    // Color function for heatmap cells
    const getCellStyle = (value: number, baseColor: string) => {
        const intensity = Math.min(value, 1) // Clamp to 0-1

        // Parse hex color
        const r = parseInt(baseColor.slice(1, 3), 16)
        const g = parseInt(baseColor.slice(3, 5), 16)
        const b = parseInt(baseColor.slice(5, 7), 16)

        if (intensity < 0.05) {
            return {
                backgroundColor: 'rgba(39, 39, 42, 0.5)',
                boxShadow: 'none'
            }
        }

        const alpha = 0.2 + intensity * 0.8
        const glowIntensity = intensity > 0.5 ? intensity * 0.6 : 0

        return {
            backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})`,
            boxShadow: glowIntensity > 0 ? `0 0 ${Math.round(glowIntensity * 12)}px rgba(${r}, ${g}, ${b}, ${glowIntensity})` : 'none'
        }
    }

    const renderHeatmapGrid = (
        grid: { dayIndex: number; date: Date; cells: HeatmapCell[] }[],
        sensor: 'light' | 'motion',
        color: string
    ) => {
        if (grid.length === 0) {
            return (
                <div className="h-[120px] flex items-center justify-center text-zinc-500 text-sm">
                    {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'No data available'}
                </div>
            )
        }

        return (
            <div className="overflow-x-auto pb-2 -mx-4 sm:mx-0 px-4 sm:px-0">
                <div className="flex gap-[2px] min-w-fit">
                    {/* Hour labels */}
                    <div className="flex flex-col gap-[2px] pr-1 sm:pr-2 sticky left-0 bg-zinc-900/95 z-10">
                        <div className="h-4 sm:h-5" />
                        {[0, 6, 12, 18].map(hour => (
                            <div
                                key={hour}
                                className="text-[8px] sm:text-[9px] text-zinc-500 flex items-center justify-end h-[16px] sm:h-[18px]"
                                style={{ marginTop: hour === 0 ? 0 : `${5 * (16 + 2)}px` }}
                            >
                                {String(hour).padStart(2, '0')}h
                            </div>
                        ))}
                    </div>

                    {/* Day columns */}
                    {grid.map(({ dayIndex, date, cells }) => (
                        <div key={dayIndex} className="flex flex-col gap-[2px]">
                            <div className="h-4 sm:h-5 text-[8px] sm:text-[9px] text-zinc-400 flex items-center justify-center font-medium whitespace-nowrap px-0.5">
                                {date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                            </div>
                            {Array.from({ length: 24 }, (_, hour) => {
                                const cell = cells.find(c => c.hour === hour)
                                const isHovered = hoveredCell?.sensor === sensor &&
                                    hoveredCell?.cell.dayIndex === dayIndex &&
                                    hoveredCell?.cell.hour === hour

                                return (
                                    <motion.div
                                        key={hour}
                                        className={`w-5 sm:w-6 h-[16px] sm:h-[18px] rounded-[3px] cursor-pointer transition-all duration-100 ${isHovered ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-zinc-900 z-20' : ''
                                            }`}
                                        style={cell ? getCellStyle(cell.value, color) : { backgroundColor: 'rgba(39, 39, 42, 0.3)' }}
                                        whileHover={{ scale: 1.15 }}
                                        whileTap={{ scale: 1.1 }}
                                        onMouseEnter={() => cell && setHoveredCell({ sensor, cell })}
                                        onMouseLeave={() => setHoveredCell(null)}
                                        onClick={() => cell && setHoveredCell({ sensor, cell })}
                                    />
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="w-full bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/50 rounded-2xl p-4 sm:p-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div>
                    <h2 className="text-lg font-bold text-zinc-200 tracking-wide flex items-center gap-2">
                        <Grid3X3 className="w-5 h-5 text-purple-400" />
                        Activity Heatmap
                    </h2>
                    <p className="text-xs text-zinc-500 mt-1">
                        {TIME_RANGES[resolution].description}
                        {lastUpdate && ` • Updated ${lastUpdate.toLocaleTimeString()}`}
                    </p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto overflow-x-auto scrollbar-hide">
                    {/* Time Range Selector */}
                    <div className="flex bg-zinc-800/80 rounded-xl p-1 border border-zinc-700/50 overflow-x-auto scrollbar-hide">
                        {(Object.keys(TIME_RANGES) as TimeRangeKey[]).map((key) => (
                            <button
                                key={key}
                                onClick={() => setResolution(key)}
                                className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap ${resolution === key
                                        ? 'bg-purple-500/20 text-purple-400 shadow-lg shadow-purple-500/10'
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50'
                                    }`}
                            >
                                {TIME_RANGES[key].label}
                            </button>
                        ))}
                    </div>

                    {/* Refresh */}
                    <button
                        onClick={fetchData}
                        disabled={isLoading}
                        className="p-2 rounded-lg bg-zinc-800/80 border border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/80 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Hovered Cell Info */}
            <AnimatePresence>
                {hoveredCell && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-3 sm:mb-4 px-3 sm:px-4 py-2 sm:py-3 rounded-xl bg-zinc-800/70 border border-zinc-700/50"
                    >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 text-xs sm:text-sm">
                            <div className="flex items-center gap-2 sm:gap-3">
                                {hoveredCell.sensor === 'light' ? (
                                    <Sun className="w-4 h-4 text-yellow-400" />
                                ) : (
                                    <Activity className="w-4 h-4 text-emerald-400" />
                                )}
                                <span className="text-zinc-300 font-medium capitalize">{hoveredCell.sensor}</span>
                                <span className="text-zinc-500">|</span>
                                <span className="text-zinc-400">
                                    {hoveredCell.cell.date.toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric',
                                    })} at {String(hoveredCell.cell.hour).padStart(2, '0')}:00
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span style={{ color: hoveredCell.sensor === 'light' ? '#eab308' : '#22c55e' }}>
                                    {(hoveredCell.cell.value * 100).toFixed(0)}% active
                                </span>
                                <span className="text-zinc-400">
                                    {hoveredCell.cell.readings} readings
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Heatmaps */}
            <div className="space-y-6">
                {/* Light Heatmap */}
                <div className="space-y-2 sm:space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <motion.div
                                className="p-2 rounded-lg"
                                style={{ backgroundColor: isLightActive ? 'rgba(234, 179, 8, 0.2)' : 'rgba(63, 63, 70, 0.3)' }}
                                animate={isLightActive ? { scale: [1, 1.05, 1] } : {}}
                                transition={{ duration: 1, repeat: Infinity }}
                            >
                                <Sun className="w-4 h-4" style={{ color: isLightActive ? '#eab308' : '#71717a' }} />
                            </motion.div>
                            <div>
                                <span className="text-sm font-semibold text-zinc-300">Light Intensity</span>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                    <span>{lightStats.total} readings</span>
                                    <span>•</span>
                                    <span style={{ color: '#eab308' }}>{lightStats.avg.toFixed(1)}% BRIGHT</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                            {/* Legend */}
                            <div className="flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[9px] text-zinc-500">
                                <span className="hidden sm:inline">Dark</span>
                                <div className="flex gap-0.5">
                                    {[0, 0.25, 0.5, 0.75, 1].map(v => (
                                        <div
                                            key={v}
                                            className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm"
                                            style={getCellStyle(v, '#eab308')}
                                        />
                                    ))}
                                </div>
                                <span className="hidden sm:inline">Bright</span>
                            </div>

                            {/* Live indicator */}
                            <div
                                className="flex items-center gap-2 px-2.5 py-1 rounded-lg"
                                style={{ backgroundColor: isLightActive ? 'rgba(234, 179, 8, 0.15)' : 'rgba(63, 63, 70, 0.3)' }}
                            >
                                <motion.div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: isLightActive ? '#eab308' : '#52525b' }}
                                    animate={isLightActive ? { scale: [1, 1.3, 1] } : {}}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                />
                                <span className="text-[10px] font-semibold" style={{ color: isLightActive ? '#eab308' : '#71717a' }}>
                                    {liveData.light !== null ? (isLightActive ? 'BRIGHT' : 'DARK') : '---'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {renderHeatmapGrid(lightGrid, 'light', '#eab308')}
                </div>

                {/* Motion Heatmap */}
                <div className="space-y-2 sm:space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <motion.div
                                className="p-2 rounded-lg"
                                style={{ backgroundColor: isMotionActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(63, 63, 70, 0.3)' }}
                                animate={isMotionActive ? { scale: [1, 1.05, 1] } : {}}
                                transition={{ duration: 1, repeat: Infinity }}
                            >
                                <Activity className="w-4 h-4" style={{ color: isMotionActive ? '#22c55e' : '#71717a' }} />
                            </motion.div>
                            <div>
                                <span className="text-sm font-semibold text-zinc-300">Motion Activity</span>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                    <span>{motionStats.total} readings</span>
                                    <span>•</span>
                                    <span style={{ color: '#22c55e' }}>{motionStats.avg.toFixed(1)}% DETECTED</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                            {/* Legend */}
                            <div className="flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[9px] text-zinc-500">
                                <span className="hidden sm:inline">None</span>
                                <div className="flex gap-0.5">
                                    {[0, 0.25, 0.5, 0.75, 1].map(v => (
                                        <div
                                            key={v}
                                            className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm"
                                            style={getCellStyle(v, '#22c55e')}
                                        />
                                    ))}
                                </div>
                                <span className="hidden sm:inline">Detected</span>
                            </div>

                            {/* Live indicator */}
                            <div
                                className="flex items-center gap-2 px-2.5 py-1 rounded-lg"
                                style={{ backgroundColor: isMotionActive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(63, 63, 70, 0.3)' }}
                            >
                                <motion.div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: isMotionActive ? '#22c55e' : '#52525b' }}
                                    animate={isMotionActive ? { scale: [1, 1.3, 1] } : {}}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                />
                                <span className="text-[10px] font-semibold" style={{ color: isMotionActive ? '#22c55e' : '#71717a' }}>
                                    {liveData.motion !== null ? (isMotionActive ? 'DETECTED' : 'NONE') : '---'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {renderHeatmapGrid(motionGrid, 'motion', '#22c55e')}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-zinc-800/50 flex items-center justify-between text-[10px] text-zinc-500">
                <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span>Rows: Hours (0-23) | Columns: Days</span>
                </div>
                <div className="flex items-center gap-2">
                    {isFirebaseConnected && (
                        <span className="text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
