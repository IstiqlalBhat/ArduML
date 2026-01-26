"use client"

import { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    AlertTriangle,
    Thermometer,
    Droplets,
    TrendingUp,
    BarChart2,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    Bell,
    BellOff,
    X
} from "lucide-react"

interface Anomaly {
    id: number
    timestamp: string
    metric: 'temperature' | 'humidity'
    value: number
    expectedRange: [number, number]
    deviation: number
    detectionMethod: 'zscore' | 'rate_of_change' | 'combined'
    severity: 'low' | 'medium' | 'high'
    message: string
}

interface AnomalySummary {
    dataPointsAnalyzed: number
    timeRange: {
        start: string
        end: string
    }
    statistics: {
        temperature: { mean: number; std: number; min: number; max: number }
        humidity: { mean: number; std: number; min: number; max: number }
    }
    totalAnomalies: number
    bySeverity: { high: number; medium: number; low: number }
    byMetric: { temperature: number; humidity: number }
    byMethod: { zscore: number; rateOfChange: number }
}

interface AnomalyResponse {
    anomalies: Anomaly[]
    summary: AnomalySummary
}

const severityConfig = {
    high: {
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        text: "text-red-400",
        icon: "text-red-500",
        badge: "bg-red-500/20 text-red-400 border-red-500/30"
    },
    medium: {
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        text: "text-amber-400",
        icon: "text-amber-500",
        badge: "bg-amber-500/20 text-amber-400 border-amber-500/30"
    },
    low: {
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
        text: "text-emerald-400",
        icon: "text-emerald-500",
        badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    }
}

const methodConfig = {
    zscore: { label: "Statistical Outlier", icon: BarChart2 },
    rate_of_change: { label: "Sudden Change", icon: TrendingUp },
    combined: { label: "Combined", icon: AlertTriangle }
}

export function AnomalyAlert() {
    const [data, setData] = useState<AnomalyResponse | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isExpanded, setIsExpanded] = useState(false)
    const [alertsEnabled, setAlertsEnabled] = useState(true)
    const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set())
    const [lastFetch, setLastFetch] = useState<Date | null>(null)

    const fetchAnomalies = useCallback(async () => {
        try {
            setIsLoading(true)
            const res = await fetch('/api/anomalies?limit=500')
            if (res.ok) {
                const json = await res.json()
                setData(json)
                setLastFetch(new Date())
            }
        } catch (error) {
            console.error('Failed to fetch anomalies:', error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchAnomalies()
        // Refresh every 30 seconds
        const interval = setInterval(fetchAnomalies, 30000)
        return () => clearInterval(interval)
    }, [fetchAnomalies])

    const dismissAnomaly = (id: number) => {
        setDismissedIds(prev => new Set(prev).add(id))
    }

    const activeAnomalies = data?.anomalies.filter(a => !dismissedIds.has(a.id)) || []
    const highSeverityCount = activeAnomalies.filter(a => a.severity === 'high').length
    const hasHighSeverity = highSeverityCount > 0

    // Determine overall status
    const overallStatus = !data ? 'loading' :
        activeAnomalies.length === 0 ? 'normal' :
            hasHighSeverity ? 'critical' : 'warning'

    const statusConfig = {
        loading: { text: "Analyzing...", color: "text-zinc-400", bg: "bg-zinc-500/10" },
        normal: { text: "All Normal", color: "text-emerald-400", bg: "bg-emerald-500/10" },
        warning: { text: "Anomalies Detected", color: "text-amber-400", bg: "bg-amber-500/10" },
        critical: { text: "Critical Anomalies", color: "text-red-400", bg: "bg-red-500/10" }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`
                relative rounded-2xl
                bg-zinc-900/80 backdrop-blur-xl
                border ${hasHighSeverity && alertsEnabled ? 'border-red-500/50' : 'border-zinc-800/50'}
                transition-all duration-300
            `}
        >
            {/* Pulsing border for critical alerts */}
            {hasHighSeverity && alertsEnabled && (
                <motion.div
                    className="absolute inset-0 rounded-2xl border-2 border-red-500/50 pointer-events-none"
                    animate={{ opacity: [0.3, 0.8, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity }}
                />
            )}

            {/* Header */}
            <div className="relative z-10 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${statusConfig[overallStatus].bg}`}>
                            <AlertTriangle className={`w-5 h-5 ${statusConfig[overallStatus].color}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-200">
                                Anomaly Detection
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-xs font-medium ${statusConfig[overallStatus].color}`}>
                                    {statusConfig[overallStatus].text}
                                </span>
                                {activeAnomalies.length > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                                        {activeAnomalies.length} active
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Toggle alerts */}
                        <button
                            onClick={() => setAlertsEnabled(!alertsEnabled)}
                            className={`
                                p-2 rounded-lg transition-colors
                                ${alertsEnabled
                                    ? 'bg-zinc-800/50 text-zinc-400 hover:text-zinc-200'
                                    : 'bg-zinc-800/80 text-zinc-600'
                                }
                            `}
                            title={alertsEnabled ? 'Mute alerts' : 'Enable alerts'}
                        >
                            {alertsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                        </button>

                        {/* Refresh */}
                        <button
                            onClick={fetchAnomalies}
                            disabled={isLoading}
                            className="p-2 rounded-lg bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
                            title="Refresh"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>

                        {/* Expand/Collapse */}
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-2 rounded-lg bg-zinc-800/50 text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Summary badges */}
                {data && activeAnomalies.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        {data.summary.bySeverity.high > 0 && (
                            <span className={`text-[10px] px-2 py-1 rounded-full border ${severityConfig.high.badge}`}>
                                {data.summary.bySeverity.high} High
                            </span>
                        )}
                        {data.summary.bySeverity.medium > 0 && (
                            <span className={`text-[10px] px-2 py-1 rounded-full border ${severityConfig.medium.badge}`}>
                                {data.summary.bySeverity.medium} Medium
                            </span>
                        )}
                        {data.summary.bySeverity.low > 0 && (
                            <span className={`text-[10px] px-2 py-1 rounded-full border ${severityConfig.low.badge}`}>
                                {data.summary.bySeverity.low} Low
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Expanded content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-zinc-800/50"
                    >
                        <div className="px-4 pb-4 pt-4 space-y-4">
                            {/* Statistics */}
                            {data?.summary && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-xl bg-zinc-800/30 border border-zinc-800/50">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Thermometer className="w-4 h-4 text-orange-400" />
                                            <span className="text-xs font-medium text-zinc-400">Temperature</span>
                                        </div>
                                        <div className="text-lg font-bold text-zinc-200">
                                            {data.summary.statistics.temperature.mean.toFixed(1)}°C
                                        </div>
                                        <div className="text-[10px] text-zinc-500">
                                            Range: {data.summary.statistics.temperature.min.toFixed(1)} - {data.summary.statistics.temperature.max.toFixed(1)}°C
                                        </div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-zinc-800/30 border border-zinc-800/50">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Droplets className="w-4 h-4 text-cyan-400" />
                                            <span className="text-xs font-medium text-zinc-400">Humidity</span>
                                        </div>
                                        <div className="text-lg font-bold text-zinc-200">
                                            {data.summary.statistics.humidity.mean.toFixed(1)}%
                                        </div>
                                        <div className="text-[10px] text-zinc-500">
                                            Range: {data.summary.statistics.humidity.min.toFixed(1)} - {data.summary.statistics.humidity.max.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Anomaly list */}
                            {activeAnomalies.length > 0 ? (
                                <div style={{ maxHeight: '350px', overflowY: 'scroll', paddingRight: '8px' }}>
                                    <div className="space-y-2">
                                    {activeAnomalies.map((anomaly) => {
                                        const config = severityConfig[anomaly.severity]
                                        const method = methodConfig[anomaly.detectionMethod]
                                        const MethodIcon = method.icon

                                        return (
                                            <div
                                                key={`${anomaly.id}-${anomaly.detectionMethod}`}
                                                className={`
                                                    p-3 rounded-xl border
                                                    ${config.bg} ${config.border}
                                                    transition-colors duration-200
                                                `}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-start gap-2 flex-1 min-w-0">
                                                        <div className={`p-1.5 rounded-lg ${config.bg}`}>
                                                            {anomaly.metric === 'temperature' ? (
                                                                <Thermometer className={`w-4 h-4 ${config.icon}`} />
                                                            ) : (
                                                                <Droplets className={`w-4 h-4 ${config.icon}`} />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={`text-sm font-semibold ${config.text}`}>
                                                                    {anomaly.value.toFixed(1)}{anomaly.metric === 'temperature' ? '°C' : '%'}
                                                                </span>
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${config.badge}`}>
                                                                    {anomaly.severity.toUpperCase()}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                                                                {anomaly.message}
                                                            </p>
                                                            <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500">
                                                                <span className="flex items-center gap-1">
                                                                    <MethodIcon className="w-3 h-3" />
                                                                    {method.label}
                                                                </span>
                                                                <span>
                                                                    {new Date(anomaly.timestamp).toLocaleTimeString()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => dismissAnomaly(anomaly.id)}
                                                        className="p-1 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
                                                        title="Dismiss"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                                        <AlertTriangle className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <p className="text-sm text-zinc-400">No anomalies detected</p>
                                    <p className="text-xs text-zinc-600 mt-1">
                                        All {data?.summary.dataPointsAnalyzed || 0} readings are within normal range
                                    </p>
                                </div>
                            )}

                            {/* Footer info */}
                            <div className="pt-3 border-t border-zinc-800/50 flex items-center justify-between text-[10px] text-zinc-600">
                                <span>
                                    Analyzed {data?.summary.dataPointsAnalyzed || 0} data points
                                </span>
                                {lastFetch && (
                                    <span>
                                        Last updated: {lastFetch.toLocaleTimeString()}
                                    </span>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
