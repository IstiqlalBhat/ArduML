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

interface TimeBox {
    index: number
    startTime: Date
    endTime: Date
    hasEvent: boolean
    eventCount: number
    label: string
}

const TIME_RANGES = {
    '1m': { label: '1 Minute', apiRange: '1h', description: 'Last minute in seconds', boxes: 60, boxDuration: 1000 }, // 60 seconds
    '1h': { label: '1 Hour', apiRange: '1h', description: 'Last hour in minutes', boxes: 60, boxDuration: 60000 }, // 60 minutes
    '6h': { label: '6 Hours', apiRange: '6h', description: 'Last 6 hours', boxes: 6, boxDuration: 3600000 }, // 6 hours
    '24h': { label: '24 Hours', apiRange: '24h', description: 'Last 24 hours', boxes: 24, boxDuration: 3600000 }, // 24 hours
    '3d': { label: '3 Days', apiRange: '3d', description: 'Last 3 days', boxes: 3, boxDuration: 86400000 }, // 3 days
    '7d': { label: '7 Days', apiRange: '7d', description: 'Last week', boxes: 7, boxDuration: 86400000 }, // 7 days
    '30d': { label: '30 Days', apiRange: '7d', description: 'Last month', boxes: 30, boxDuration: 86400000 }, // 30 days
} as const

type TimeRangeKey = keyof typeof TIME_RANGES

export function HeatmapController() {
    const [resolution, setResolution] = useState<TimeRangeKey>('24h')
    const [lightData, setLightData] = useState<HeatmapDataPoint[]>([])
    const [motionData, setMotionData] = useState<HeatmapDataPoint[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
    const [hoveredBox, setHoveredBox] = useState<{ sensor: 'light' | 'motion', box: TimeBox } | null>(null)

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

    // Process data into time boxes - only fill boxes with state changes
    const processToTimeBoxes = useCallback((data: HeatmapDataPoint[]): TimeBox[] => {
        const config = TIME_RANGES[resolution]
        const boxes: TimeBox[] = []

        const now = Date.now()
        const totalDuration = config.boxes * config.boxDuration
        const startTime = now - totalDuration

        // Create all boxes (initially empty)
        for (let i = 0; i < config.boxes; i++) {
            const boxStart = new Date(startTime + (i * config.boxDuration))
            const boxEnd = new Date(startTime + ((i + 1) * config.boxDuration))

            // Format label based on resolution
            let label = ''
            if (resolution === '1m') {
                label = boxStart.getSeconds() + 's'
            } else if (resolution === '1h') {
                label = boxStart.getMinutes() + 'm'
            } else if (resolution === '6h' || resolution === '24h') {
                label = boxStart.getHours() + 'h'
            } else {
                label = boxStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }

            boxes.push({
                index: i,
                startTime: boxStart,
                endTime: boxEnd,
                hasEvent: false,
                eventCount: 0,
                label
            })
        }

        if (!data || data.length === 0) return boxes

        // Sort data by timestamp to detect state changes
        const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp)

        // Detect state changes (transitions between 0 and 1)
        let previousValue: number | null = null
        sortedData.forEach(point => {
            const pointTime = point.timestamp * 1000 // Convert to milliseconds
            const currentValue = point.value >= 0.5 ? 1 : 0

            // Check if this is a state change
            if (previousValue !== null && previousValue !== currentValue) {
                // Find which box this event falls into
                const boxIndex = Math.floor((pointTime - startTime) / config.boxDuration)
                if (boxIndex >= 0 && boxIndex < boxes.length) {
                    boxes[boxIndex].hasEvent = true
                    boxes[boxIndex].eventCount++
                }
            }

            previousValue = currentValue
        })

        return boxes
    }, [resolution])

    const lightBoxes = useMemo(() => processToTimeBoxes(lightData), [lightData, processToTimeBoxes])
    const motionBoxes = useMemo(() => processToTimeBoxes(motionData), [motionData, processToTimeBoxes])

    // Stats
    const lightStats = useMemo(() => {
        const totalEvents = lightBoxes.reduce((sum, box) => sum + box.eventCount, 0)
        const boxesWithEvents = lightBoxes.filter(box => box.hasEvent).length
        return { events: totalEvents, activeBoxes: boxesWithEvents, totalBoxes: lightBoxes.length }
    }, [lightBoxes])

    const motionStats = useMemo(() => {
        const totalEvents = motionBoxes.reduce((sum, box) => sum + box.eventCount, 0)
        const boxesWithEvents = motionBoxes.filter(box => box.hasEvent).length
        return { events: totalEvents, activeBoxes: boxesWithEvents, totalBoxes: motionBoxes.length }
    }, [motionBoxes])

    const isLightActive = liveData.light !== null && liveData.light >= 0.5
    const isMotionActive = liveData.motion !== null && liveData.motion >= 0.5

    // Get box style - only show color if there's an event
    const getBoxStyle = (box: TimeBox, baseColor: string) => {
        if (!box.hasEvent) {
            return {
                backgroundColor: 'rgba(39, 39, 42, 0.3)',
                border: '1px solid rgba(63, 63, 70, 0.5)'
            }
        }

        // Parse hex color
        const r = parseInt(baseColor.slice(1, 3), 16)
        const g = parseInt(baseColor.slice(3, 5), 16)
        const b = parseInt(baseColor.slice(5, 7), 16)

        // Intensity based on event count
        const alpha = Math.min(0.4 + box.eventCount * 0.2, 1)
        const glowIntensity = box.eventCount > 1 ? 0.4 : 0.2

        return {
            backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})`,
            border: `1px solid rgba(${r}, ${g}, ${b}, 0.6)`,
            boxShadow: `0 0 ${Math.round(glowIntensity * 8)}px rgba(${r}, ${g}, ${b}, ${glowIntensity})`
        }
    }

    const renderTimeBoxes = (
        boxes: TimeBox[],
        sensor: 'light' | 'motion',
        color: string
    ) => {
        if (boxes.length === 0) {
            return (
                <div className="h-[60px] flex items-center justify-center text-zinc-500 text-sm">
                    {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'No data available'}
                </div>
            )
        }

        const config = TIME_RANGES[resolution]

        // Calculate box size based on number of boxes
        const getBoxWidth = () => {
            if (config.boxes <= 24) return 'w-8 sm:w-10 md:w-12'
            if (config.boxes <= 60) return 'w-4 sm:w-5 md:w-6'
            return 'w-3 sm:w-4'
        }

        return (
            <div className="overflow-x-auto pb-2 -mx-4 sm:mx-0 px-4 sm:px-0">
                <div className="flex gap-[2px] min-w-fit">
                    {boxes.map((box) => {
                        const isHovered = hoveredBox?.sensor === sensor && hoveredBox?.box.index === box.index

                        return (
                            <div key={box.index} className="flex flex-col items-center gap-1">
                                <motion.div
                                    className={`${getBoxWidth()} h-12 sm:h-14 rounded-md cursor-pointer transition-all duration-100 ${
                                        isHovered ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-zinc-900 z-20' : ''
                                    }`}
                                    style={getBoxStyle(box, color)}
                                    whileHover={{ scale: 1.1, y: -2 }}
                                    whileTap={{ scale: 1.05 }}
                                    onMouseEnter={() => setHoveredBox({ sensor, box })}
                                    onMouseLeave={() => setHoveredBox(null)}
                                    onClick={() => setHoveredBox({ sensor, box })}
                                />
                                {/* Show label for every nth box to avoid clutter */}
                                {(config.boxes <= 24 || box.index % Math.ceil(config.boxes / 12) === 0) && (
                                    <span className="text-[8px] sm:text-[9px] text-zinc-500 font-medium">
                                        {box.label}
                                    </span>
                                )}
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

            {/* Hovered Box Info */}
            <AnimatePresence>
                {hoveredBox && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-3 sm:mb-4 px-3 sm:px-4 py-2 sm:py-3 rounded-xl bg-zinc-800/70 border border-zinc-700/50"
                    >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 text-xs sm:text-sm">
                            <div className="flex items-center gap-2 sm:gap-3">
                                {hoveredBox.sensor === 'light' ? (
                                    <Sun className="w-4 h-4 text-yellow-400" />
                                ) : (
                                    <Activity className="w-4 h-4 text-emerald-400" />
                                )}
                                <span className="text-zinc-300 font-medium capitalize">{hoveredBox.sensor}</span>
                                <span className="text-zinc-500">|</span>
                                <span className="text-zinc-400">
                                    {hoveredBox.box.startTime.toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: resolution === '1m' ? '2-digit' : undefined
                                    })}
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <span style={{ color: hoveredBox.sensor === 'light' ? '#eab308' : '#22c55e' }}>
                                    {hoveredBox.box.hasEvent ? `${hoveredBox.box.eventCount} event${hoveredBox.box.eventCount > 1 ? 's' : ''}` : 'No events'}
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
                                <span className="text-sm font-semibold text-zinc-300">Light Changes</span>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                    <span>{lightStats.events} state changes</span>
                                    <span>•</span>
                                    <span style={{ color: '#eab308' }}>{lightStats.activeBoxes}/{lightStats.totalBoxes} boxes</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                            {/* Legend */}
                            <div className="flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[9px] text-zinc-500">
                                <span className="hidden sm:inline">Empty</span>
                                <div className="flex gap-0.5">
                                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm" style={{ backgroundColor: 'rgba(39, 39, 42, 0.3)', border: '1px solid rgba(63, 63, 70, 0.5)' }} />
                                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm" style={{ backgroundColor: 'rgba(234, 179, 8, 0.6)', border: '1px solid rgba(234, 179, 8, 0.6)' }} />
                                </div>
                                <span className="hidden sm:inline">Event</span>
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

                    {renderTimeBoxes(lightBoxes, 'light', '#eab308')}
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
                                <span className="text-sm font-semibold text-zinc-300">Motion Changes</span>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                    <span>{motionStats.events} state changes</span>
                                    <span>•</span>
                                    <span style={{ color: '#22c55e' }}>{motionStats.activeBoxes}/{motionStats.totalBoxes} boxes</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                            {/* Legend */}
                            <div className="flex items-center gap-1 sm:gap-1.5 text-[8px] sm:text-[9px] text-zinc-500">
                                <span className="hidden sm:inline">Empty</span>
                                <div className="flex gap-0.5">
                                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm" style={{ backgroundColor: 'rgba(39, 39, 42, 0.3)', border: '1px solid rgba(63, 63, 70, 0.5)' }} />
                                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)', border: '1px solid rgba(34, 197, 94, 0.6)' }} />
                                </div>
                                <span className="hidden sm:inline">Event</span>
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

                    {renderTimeBoxes(motionBoxes, 'motion', '#22c55e')}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-zinc-800/50 flex items-center justify-between text-[10px] text-zinc-500">
                <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span className="hidden sm:inline">Boxes show state change events only</span>
                    <span className="sm:hidden">Event-based timeline</span>
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
