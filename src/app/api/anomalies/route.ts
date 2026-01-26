import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Anomaly detection thresholds
const ZSCORE_THRESHOLD = 3.0
const TEMP_RATE_THRESHOLD = 2.0  // degrees
const HUMIDITY_RATE_THRESHOLD = 5.0  // percent

interface SensorReading {
    id: number
    temperature: number | null
    humidity: number | null
    created_at: string
}

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

interface Stats {
    mean: number
    std: number
    min: number
    max: number
    q1: number
    q3: number
}

function calculateStats(values: number[]): Stats {
    if (values.length === 0) {
        return { mean: 0, std: 0, min: 0, max: 0, q1: 0, q3: 0 }
    }

    const sorted = [...values].sort((a, b) => a - b)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length
    const std = Math.sqrt(variance)

    return {
        mean,
        std,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        q1: sorted[Math.floor(sorted.length * 0.25)],
        q3: sorted[Math.floor(sorted.length * 0.75)]
    }
}

function detectZScoreAnomalies(
    data: SensorReading[],
    metric: 'temperature' | 'humidity'
): Anomaly[] {
    const anomalies: Anomaly[] = []
    const values = data
        .map(r => r[metric])
        .filter((v): v is number => v !== null)

    if (values.length < 10) return anomalies

    const stats = calculateStats(values)
    if (stats.std === 0) return anomalies

    for (const reading of data) {
        const value = reading[metric]
        if (value === null) continue

        const zscore = Math.abs(value - stats.mean) / stats.std

        if (zscore > ZSCORE_THRESHOLD) {
            const severity: Anomaly['severity'] =
                zscore > 4 ? 'high' : zscore > 3.5 ? 'medium' : 'low'

            anomalies.push({
                id: reading.id,
                timestamp: reading.created_at,
                metric,
                value,
                expectedRange: [
                    Math.round((stats.mean - 2 * stats.std) * 100) / 100,
                    Math.round((stats.mean + 2 * stats.std) * 100) / 100
                ],
                deviation: Math.round(zscore * 100) / 100,
                detectionMethod: 'zscore',
                severity,
                message: `${metric.charAt(0).toUpperCase() + metric.slice(1)} of ${value} is ${zscore.toFixed(1)} standard deviations from mean (${stats.mean.toFixed(1)})`
            })
        }
    }

    return anomalies
}

function detectRateAnomalies(
    data: SensorReading[],
    metric: 'temperature' | 'humidity'
): Anomaly[] {
    const anomalies: Anomaly[] = []
    const threshold = metric === 'temperature' ? TEMP_RATE_THRESHOLD : HUMIDITY_RATE_THRESHOLD

    let prevValue: number | null = null

    for (const reading of data) {
        const value = reading[metric]
        if (value === null) continue

        if (prevValue !== null) {
            const change = Math.abs(value - prevValue)

            if (change > threshold) {
                const severity: Anomaly['severity'] =
                    change > threshold * 2 ? 'high' : change > threshold * 1.5 ? 'medium' : 'low'

                anomalies.push({
                    id: reading.id,
                    timestamp: reading.created_at,
                    metric,
                    value,
                    expectedRange: [
                        Math.round((prevValue - threshold) * 100) / 100,
                        Math.round((prevValue + threshold) * 100) / 100
                    ],
                    deviation: Math.round(change * 100) / 100,
                    detectionMethod: 'rate_of_change',
                    severity,
                    message: `${metric.charAt(0).toUpperCase() + metric.slice(1)} changed by ${change.toFixed(1)} (from ${prevValue.toFixed(1)} to ${value.toFixed(1)}) - exceeds threshold of ${threshold}`
                })
            }
        }

        prevValue = value
    }

    return anomalies
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '500', 10)
    const includeLogged = searchParams.get('logged') === 'true'

    // Fetch last N sensor readings
    const { data, error } = await supabase
        .from('sensor_readings')
        .select('id, temperature, humidity, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('Error fetching sensor readings:', error)
        return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
    }

    // Also fetch recent logged anomalies if requested
    let loggedAnomalies: Anomaly[] = []
    if (includeLogged) {
        const { data: logs } = await supabase
            .from('anomaly_logs')
            .select('*')
            .eq('acknowledged', false)
            .order('detected_at', { ascending: false })
            .limit(20)

        if (logs) {
            loggedAnomalies = logs.map((log: any) => ({
                id: log.id,
                timestamp: log.detected_at,
                metric: log.metric as 'temperature' | 'humidity',
                value: log.value,
                expectedRange: [0, 0] as [number, number],
                deviation: log.deviation,
                detectionMethod: log.detection_method as any,
                severity: log.severity as 'low' | 'medium' | 'high',
                message: log.message
            }))
        }
    }

    if (!data || data.length === 0) {
        return NextResponse.json({
            anomalies: [],
            summary: {
                dataPointsAnalyzed: 0,
                totalAnomalies: 0
            }
        })
    }

    // Reverse to chronological order for rate detection
    const chronologicalData = [...data].reverse() as SensorReading[]

    // Run anomaly detection
    const allAnomalies: Anomaly[] = []

    // Z-score detection
    allAnomalies.push(...detectZScoreAnomalies(chronologicalData, 'temperature'))
    allAnomalies.push(...detectZScoreAnomalies(chronologicalData, 'humidity'))

    // Rate of change detection
    allAnomalies.push(...detectRateAnomalies(chronologicalData, 'temperature'))
    allAnomalies.push(...detectRateAnomalies(chronologicalData, 'humidity'))

    // Deduplicate by id and method
    const seen = new Set<string>()
    const uniqueAnomalies = allAnomalies.filter(a => {
        const key = `${a.id}-${a.detectionMethod}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })

    // Sort by timestamp (newest first)
    uniqueAnomalies.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    // Calculate statistics
    const tempValues = chronologicalData
        .map(r => r.temperature)
        .filter((v): v is number => v !== null)
    const humidityValues = chronologicalData
        .map(r => r.humidity)
        .filter((v): v is number => v !== null)

    const tempStats = calculateStats(tempValues)
    const humidityStats = calculateStats(humidityValues)

    // Combine real-time detected with logged anomalies
    const combinedAnomalies = [...loggedAnomalies, ...uniqueAnomalies]
    const seenIds = new Set<string>()
    const deduped = combinedAnomalies.filter(a => {
        const key = `${a.id}-${a.timestamp}`
        if (seenIds.has(key)) return false
        seenIds.add(key)
        return true
    })

    return NextResponse.json({
        anomalies: deduped.slice(0, 50), // Return top 50 anomalies
        summary: {
            dataPointsAnalyzed: chronologicalData.length,
            timeRange: {
                start: chronologicalData[0]?.created_at,
                end: chronologicalData[chronologicalData.length - 1]?.created_at
            },
            statistics: {
                temperature: {
                    mean: Math.round(tempStats.mean * 100) / 100,
                    std: Math.round(tempStats.std * 100) / 100,
                    min: tempStats.min,
                    max: tempStats.max
                },
                humidity: {
                    mean: Math.round(humidityStats.mean * 100) / 100,
                    std: Math.round(humidityStats.std * 100) / 100,
                    min: humidityStats.min,
                    max: humidityStats.max
                }
            },
            totalAnomalies: uniqueAnomalies.length,
            bySeverity: {
                high: uniqueAnomalies.filter(a => a.severity === 'high').length,
                medium: uniqueAnomalies.filter(a => a.severity === 'medium').length,
                low: uniqueAnomalies.filter(a => a.severity === 'low').length
            },
            byMetric: {
                temperature: uniqueAnomalies.filter(a => a.metric === 'temperature').length,
                humidity: uniqueAnomalies.filter(a => a.metric === 'humidity').length
            },
            byMethod: {
                zscore: uniqueAnomalies.filter(a => a.detectionMethod === 'zscore').length,
                rateOfChange: uniqueAnomalies.filter(a => a.detectionMethod === 'rate_of_change').length
            }
        }
    })
}
