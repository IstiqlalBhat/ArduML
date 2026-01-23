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
    dayOfWeek: number // 0 = Sunday, 6 = Saturday
    weekIndex: number
    date: Date
    value: number
    readings: number
    dateKey: string
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

    // Process data into a grid format (weeks x days of week)
    const processToGrid = useCallback((data: HeatmapDataPoint[]): HeatmapCell[] => {
        if (!data || data.length === 0) return []

        // Group by day (not hour)
        const dayMap = new Map<string, { total: number; count: number; date: Date }>()

        data.forEach(point => {
            const date = new Date(point.timestamp * 1000)
            const dateKey = date.toDateString()

            const existing = dayMap.get(dateKey) || { total: 0, count: 0, date: new Date(date.getFullYear(), date.getMonth(), date.getDate()) }
            existing.total += point.value * point.readings
            existing.count += point.readings
            dayMap.set(dateKey, existing)
        })

        // Find the start date (first Sunday before earliest data)
        const allDates = Array.from(dayMap.keys()).map(k => new Date(k)).sort((a, b) => a.getTime() - b.getTime())
        if (allDates.length === 0) return []

        const firstDate = allDates[0]
        const startDate = new Date(firstDate)
        startDate.setDate(startDate.getDate() - startDate.getDay()) // Go back to Sunday

        const cells: HeatmapCell[] = []

        // Create cells for all days up to now
        const now = new Date()
        const currentDate = new Date(startDate)
        let weekIndex = 0

        while (currentDate <= now) {
            const dateKey = currentDate.toDateString()
            const dayData = dayMap.get(dateKey)

            cells.push({
                dayOfWeek: currentDate.getDay(),
                weekIndex,
                date: new Date(currentDate),
                value: dayData ? dayData.total / dayData.count : 0,
                readings: dayData ? dayData.count : 0,
                dateKey
            })

            currentDate.setDate(currentDate.getDate() + 1)
            if (currentDate.getDay() === 0 && currentDate > startDate) {
                weekIndex++
            }
        }

        return cells
    }, [])

    // Group cells by week for grid display
    const groupByWeek = useCallback((cells: HeatmapCell[]) => {
        const weekMap = new Map<number, HeatmapCell[]>()

        cells.forEach(cell => {
            const existing = weekMap.get(cell.weekIndex) || []
            existing.push(cell)
            weekMap.set(cell.weekIndex, existing)
        })

        return Array.from(weekMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([weekIndex, weekCells]) => ({
                weekIndex,
                cells: weekCells.sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            }))
    }, [])

    const lightGrid = useMemo(() => groupByWeek(processToGrid(lightData)), [lightData, processToGrid, groupByWeek])
    const motionGrid = useMemo(() => groupByWeek(processToGrid(motionData)), [motionData, processToGrid, groupByWeek])

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
        grid: { weekIndex: number; cells: HeatmapCell[] }[],
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

        const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

        return (
            <div className="overflow-x-auto pb-2 -mx-4 sm:mx-0 px-4 sm:px-0">
                <div className="flex gap-[3px] min-w-fit">
                    {/* Day of week labels (vertical) */}
                    <div className="flex flex-col gap-[3px] pr-2 sticky left-0 bg-zinc-900/95 z-10">
                        <div className="h-3" /> {/* Spacer for month labels */}
                        {dayLabels.map((day, idx) => (
                            <div
                                key={day}
                                className={`text-[9px] text-zinc-500 flex items-center justify-end h-[11px] ${idx % 2 === 1 ? 'opacity-0' : ''}`}
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Week columns */}
                    {grid.map(({ weekIndex, cells }) => {
                        // Get the month label for first day of week
                        const firstDayOfWeek = cells.find(c => c.dayOfWeek === 0)
                        const monthLabel = (firstDayOfWeek && firstDayOfWeek.date.getDate() <= 7)
                            ? firstDayOfWeek.date.toLocaleDateString('en-US', { month: 'short' })
                            : ''

                        return (
                            <div key={weekIndex} className="flex flex-col gap-[3px]">
                                {/* Month label */}
                                <div className="h-3 text-[8px] text-zinc-400 font-medium">
                                    {monthLabel}
                                </div>

                                {/* Day cells (Sun-Sat) */}
                                {Array.from({ length: 7 }, (_, dayOfWeek) => {
                                    const cell = cells.find(c => c.dayOfWeek === dayOfWeek)
                                    const isHovered = hoveredCell?.sensor === sensor &&
                                        hoveredCell?.cell.dateKey === cell?.dateKey

                                    return (
                                        <motion.div
                                            key={dayOfWeek}
                                            className={`w-[11px] h-[11px] rounded-[2px] cursor-pointer transition-all duration-100 ${
                                                isHovered ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-zinc-900 z-20' : ''
                                            }`}
                                            style={cell && cell.readings > 0 ? getCellStyle(cell.value, color) : { backgroundColor: 'rgba(39, 39, 42, 0.4)' }}
                                            whileHover={{ scale: 1.2 }}
                                            whileTap={{ scale: 1.1 }}
                                            onMouseEnter={() => cell && cell.readings > 0 && setHoveredCell({ sensor, cell })}
                                            onMouseLeave={() => setHoveredCell(null)}
                                            onClick={() => cell && cell.readings > 0 && setHoveredCell({ sensor, cell })}
                                        />
                                    )
                                })}
                            </div>
                        )
                    })}
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
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
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
                    <span className="hidden sm:inline">Rows: Days of week | Columns: Weeks</span>
                    <span className="sm:hidden">Activity by day</span>
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
