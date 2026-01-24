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

interface TimelineSegment {
    id: number
    start: number // timestamp in ms
    end: number // timestamp in ms
    hasEvent: boolean
    eventCount: number
    intensity: number
}

const TIME_RANGES = {
    '1m': { label: '1 Minute', apiRange: '1m', description: 'Last minute', duration: 60000, tickInterval: 10000 },
    '1h': { label: '1 Hour', apiRange: '1h', description: 'Last hour', duration: 3600000, tickInterval: 900000 },
    '6h': { label: '6 Hours', apiRange: '6h', description: 'Last 6 hours', duration: 21600000, tickInterval: 3600000 },
    '24h': { label: '24 Hours', apiRange: '24h', description: 'Last 24 hours', duration: 86400000, tickInterval: 14400000 },
    '3d': { label: '3 Days', apiRange: '3d', description: 'Last 3 days', duration: 259200000, tickInterval: 86400000 },
    '7d': { label: '7 Days', apiRange: '7d', description: 'Last week', duration: 604800000, tickInterval: 86400000 },
    '30d': { label: '30 Days', apiRange: '30d', description: 'Last month', duration: 2592000000, tickInterval: 604800000 },
} as const

type TimeRangeKey = keyof typeof TIME_RANGES

// Format time labels based on resolution - show dates for multi-day views
function formatTimeLabel(timestamp: number, resolution: TimeRangeKey): string {
    const date = new Date(timestamp)

    switch (resolution) {
        case '1m':
        case '1h':
            // Short time ranges: just show time
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        case '6h':
            // 6 hours: show time with hours
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        case '24h':
            // 24 hours: show day and time to distinguish same-time different days
            return date.toLocaleDateString([], { weekday: 'short' }) + ' ' +
                   date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        case '3d':
        case '7d':
            // Multi-day views: show day and date
            return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' })
        case '30d':
            // Month view: show month and day
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
        default:
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
}

export function HeatmapController() {
    const [resolution, setResolution] = useState<TimeRangeKey>('24h')
    const [lightData, setLightData] = useState<HeatmapDataPoint[]>([])
    const [motionData, setMotionData] = useState<HeatmapDataPoint[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
    const [hoveredSegment, setHoveredSegment] = useState<{ sensor: 'light' | 'motion', segment: TimelineSegment, x: number } | null>(null)

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

    // Process data into timeline segments
    const processToSegments = useCallback((data: HeatmapDataPoint[]): TimelineSegment[] => {
        const config = TIME_RANGES[resolution]
        if (!data || data.length === 0) return []

        const now = Date.now()
        // We use the full requested duration. The API returns buckets.
        // We will map each bucket to a segment.

        return data.map((point, i) => {
            const t = point.timestamp * 1000

            // Determine activity intensity
            // For longer time ranges, the average becomes very low because events are brief
            // Use adaptive thresholds based on bucket size
            let hasEvent = false
            let intensity = 0
            let threshold = 0.05

            switch (resolution) {
                case '1m':
                    // 1-second buckets: value is either 0 or 1
                    threshold = 0.1
                    hasEvent = point.value > threshold
                    intensity = hasEvent ? 1 : 0
                    break
                case '1h':
                    // 1-minute buckets
                    threshold = 0.05
                    hasEvent = point.value > threshold
                    intensity = Math.min(point.value * 2, 1)
                    break
                case '6h':
                case '24h':
                    // 1-hour buckets: even 1 minute of activity = 1/60 = 0.017
                    threshold = 0.01
                    hasEvent = point.value > threshold
                    // Boost visibility since values are low
                    intensity = Math.min(point.value * 5, 1)
                    break
                case '3d':
                case '7d':
                case '30d':
                    // Daily buckets: even 15 minutes of activity = 15/1440 = 0.01
                    // Any value > 0 means there was some activity that day
                    threshold = 0.001
                    hasEvent = point.value > threshold
                    // Strongly boost visibility for sparse daily data
                    intensity = hasEvent ? Math.max(0.4, Math.min(point.value * 20, 1)) : 0
                    break
                default:
                    threshold = 0.05
                    hasEvent = point.value > threshold
                    intensity = Math.min(point.value * 1.2, 1)
            }

            return {
                id: i,
                start: t,
                end: t + (config.duration / 60), // fallback width, actually API bucket width varies
                hasEvent,
                eventCount: point.readings || 1,
                intensity
            }
        })
    }, [resolution])

    const lightSegments = useMemo(() => processToSegments(lightData), [lightData, processToSegments])
    const motionSegments = useMemo(() => processToSegments(motionData), [motionData, processToSegments])

    // Stats calculation based on new segments
    const lightStats = useMemo(() => {
        const segmentsWithEvents = lightSegments.filter(s => s.hasEvent).length
        return { events: segmentsWithEvents, activeSegments: segmentsWithEvents, totalSegments: lightSegments.length }
    }, [lightSegments])

    const motionStats = useMemo(() => {
        const segmentsWithEvents = motionSegments.filter(s => s.hasEvent).length
        return { events: segmentsWithEvents, activeSegments: segmentsWithEvents, totalSegments: motionSegments.length }
    }, [motionSegments])

    const isLightActive = liveData.light !== null && liveData.light >= 0.5
    const isMotionActive = liveData.motion !== null && liveData.motion >= 0.5

    const renderTimeline = (
        segments: TimelineSegment[],
        sensor: 'light' | 'motion',
        color: string
    ) => {
        const config = TIME_RANGES[resolution]

        if (segments.length === 0) {
            return (
                <div className="h-[60px] flex items-center justify-center text-zinc-500 text-sm">
                    {isLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'No data available'}
                </div>
            )
        }

        // SVG rendering logic
        const now = Date.now()
        const endTime = now
        const startTime = now - config.duration

        // Calculate bucket width based on resolution
        let bucketMs = 0
        switch (resolution) {
            case '1m': bucketMs = 1000; break;
            case '1h': bucketMs = 60000; break;
            case '6h': case '24h': bucketMs = 3600000; break;
            case '3d': case '7d': case '30d': bucketMs = 86400000; break;
        }

        // Calculate relative width in percentage
        const segmentWidthPercent = (bucketMs / config.duration) * 100

        return (
            <div className="w-full relative h-[60px] select-none group">
                {/* Timeline Grid Lines */}
                <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="w-px h-full bg-zinc-500" />
                    ))}
                </div>

                {/* Barcode SVG */}
                <div className="absolute top-2 bottom-6 left-0 right-0 flex items-center">
                    {/* Background Track */}
                    <div className="absolute inset-0 bg-zinc-800/50 rounded-md" />

                    {segments.map((s) => {
                        // Calculate position
                        // s.start is typically older than now.
                        // x=0 is startTime, x=100% is endTime
                        const relativeStart = s.start - startTime
                        const leftPercent = Math.max(0, Math.min(100, (relativeStart / config.duration) * 100))

                        if (leftPercent >= 100 || leftPercent + segmentWidthPercent < 0) return null
                        if (!s.hasEvent) return null

                        return (
                            <motion.div
                                key={s.id}
                                className="absolute top-0 bottom-0 rounded-[1px]"
                                style={{
                                    left: `${leftPercent}%`,
                                    width: `${Math.max(0.2, segmentWidthPercent - 0.1)}%`, // -0.1 for gap
                                    backgroundColor: color,
                                    opacity: 0.4 + (s.intensity * 0.6)
                                }}
                                initial={{ scaleY: 0 }}
                                animate={{ scaleY: 1 }}
                                whileHover={{ scaleY: 1.5, opacity: 1, zIndex: 10 }}
                                onMouseEnter={(e) => setHoveredSegment({ sensor, segment: s, x: e.clientX })}
                                onMouseLeave={() => setHoveredSegment(null)}
                            />
                        )
                    })}
                </div>

                {/* Time Axis Labels */}
                <div className="absolute bottom-0 left-0 right-0 h-4 text-[9px] text-zinc-500 font-medium flex justify-between px-1">
                    <span>
                        {formatTimeLabel(startTime, resolution)}
                    </span>
                    <span>
                        {formatTimeLabel(startTime + config.duration / 2, resolution)}
                    </span>
                    <span>
                        {formatTimeLabel(endTime, resolution)}
                    </span>
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

                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Time Range Selector - Mobile Safe */}
                    <div className="relative">
                        <select
                            value={resolution}
                            onChange={(e) => setResolution(e.target.value as TimeRangeKey)}
                            className="bg-zinc-800/80 text-zinc-300 text-xs font-semibold rounded-lg border border-zinc-700/50 px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none pr-8 cursor-pointer"
                        >
                            {(Object.keys(TIME_RANGES) as TimeRangeKey[]).map((key) => (
                                <option key={key} value={key} className="bg-zinc-900 text-zinc-300">
                                    {TIME_RANGES[key].label}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                        </div>
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
            {/* Hovered Box Info */}
            <AnimatePresence>
                {hoveredSegment && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute z-50 px-3 py-2 rounded-xl bg-zinc-900/90 backdrop-blur-md border border-zinc-700 shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2"
                        style={{ left: hoveredSegment.x, top: -10 }}
                    >
                        <div className="flex items-center gap-2 text-xs">
                            {hoveredSegment.sensor === 'light' ? (
                                <Sun className="w-3.5 h-3.5 text-yellow-400" />
                            ) : (
                                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            <span className="text-zinc-300 font-medium">
                                {formatTimeLabel(hoveredSegment.segment.start, resolution)}
                            </span>
                            <span className="text-zinc-500">|</span>
                            <span className={hoveredSegment.sensor === 'light' ? 'text-yellow-400' : 'text-emerald-400'}>
                                {Math.round(hoveredSegment.segment.intensity * 100)}% Active Time
                            </span>
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
                                    <span>{lightStats.events} active events</span>
                                    <span>•</span>
                                    <span style={{ color: '#eab308' }}>{Math.round(lightStats.activeSegments / lightStats.totalSegments * 100 || 0)}% density</span>
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

                </div>

                {renderTimeline(lightSegments, 'light', '#eab308')}


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
                                    <span>{motionStats.events} active events</span>
                                    <span>•</span>
                                    <span style={{ color: '#22c55e' }}>{Math.round(motionStats.activeSegments / motionStats.totalSegments * 100 || 0)}% density</span>
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

                    {renderTimeline(motionSegments, 'motion', '#22c55e')}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-4 border-t border-zinc-800/50 flex items-center justify-between text-[10px] text-zinc-500">
                <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span className="hidden sm:inline">Barcode shows activity intensity over time</span>
                    <span className="sm:hidden">Activity intensity</span>
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
