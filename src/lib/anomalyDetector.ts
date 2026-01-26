/**
 * Anomaly Detection Engine
 * Runs automatically on new data ingestion and periodic checks
 */

import { supabase } from './supabase'

// Thresholds
const ZSCORE_THRESHOLD = 3.0
const TEMP_RATE_THRESHOLD = 2.0  // degrees
const HUMIDITY_RATE_THRESHOLD = 5.0  // percent
const WINDOW_SIZE = 500  // readings to analyze

// Minimum standard deviation to prevent false positives in stable conditions
const MIN_STD_TEMP = 0.5
const MIN_STD_HUMIDITY = 2.0

export interface Anomaly {
    id: number
    timestamp: string
    metric: 'temperature' | 'humidity'
    value: number
    expectedRange: [number, number]
    deviation: number
    detectionMethod: 'zscore' | 'rate_of_change' | 'realtime'
    severity: 'low' | 'medium' | 'high'
    message: string
}

interface SensorReading {
    id: number
    temperature: number | null
    humidity: number | null
    created_at: string
}

interface Stats {
    mean: number
    std: number
    min: number
    max: number
}

// In-memory cache for recent statistics (refreshed periodically)
let statsCache: {
    temperature: Stats | null
    humidity: Stats | null
    lastUpdated: Date | null
    recentReadings: SensorReading[]
} = {
    temperature: null,
    humidity: null,
    lastUpdated: null,
    recentReadings: []
}

function calculateStats(values: number[]): Stats {
    if (values.length === 0) {
        return { mean: 0, std: 0, min: 0, max: 0 }
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length
    return {
        mean,
        std: Math.sqrt(variance),
        min: Math.min(...values),
        max: Math.max(...values)
    }
}

/**
 * Refresh the statistics cache from database
 */
export async function refreshStatsCache(): Promise<void> {
    const { data, error } = await supabase
        .from('sensor_readings')
        .select('id, temperature, humidity, created_at')
        .order('created_at', { ascending: false })
        .limit(WINDOW_SIZE)

    if (error || !data) {
        console.error('Failed to refresh stats cache:', error)
        return
    }

    const readings = data as SensorReading[]
    // Filter out nulls AND zeros (zeros often indicate sensor errors)
    const tempValues = readings.map(r => r.temperature).filter((v): v is number => v !== null && v !== 0)
    const humidValues = readings.map(r => r.humidity).filter((v): v is number => v !== null && v !== 0)

    statsCache = {
        temperature: calculateStats(tempValues),
        humidity: calculateStats(humidValues),
        lastUpdated: new Date(),
        recentReadings: readings.slice(0, 10) // Keep last 10 for rate detection
    }
}

/**
 * Check a single reading for anomalies in real-time
 * Called immediately after data ingestion
 */
export async function checkRealtimeAnomaly(
    temperature: number,
    humidity: number
): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = []
    const now = new Date().toISOString()

    // Ensure we have fresh stats (refresh if older than 5 minutes)
    if (!statsCache.lastUpdated ||
        Date.now() - statsCache.lastUpdated.getTime() > 5 * 60 * 1000) {
        await refreshStatsCache()
    }

    // Z-score check for temperature
    if (statsCache.temperature && statsCache.temperature.mean !== 0) {
        // Enforce minimum std dev to prevent hypersensitivity
        const effectiveStd = Math.max(statsCache.temperature.std, MIN_STD_TEMP)
        const zscore = Math.abs(temperature - statsCache.temperature.mean) / effectiveStd

        if (zscore > ZSCORE_THRESHOLD) {
            const severity: Anomaly['severity'] = zscore > 4 ? 'high' : zscore > 3.5 ? 'medium' : 'low'
            anomalies.push({
                id: 0,
                timestamp: now,
                metric: 'temperature',
                value: temperature,
                expectedRange: [
                    Math.round((statsCache.temperature.mean - 2 * effectiveStd) * 100) / 100,
                    Math.round((statsCache.temperature.mean + 2 * effectiveStd) * 100) / 100
                ],
                deviation: Math.round(zscore * 100) / 100,
                detectionMethod: 'realtime',
                severity,
                message: `ALERT: Temperature of ${temperature}°C is ${zscore.toFixed(1)} std devs from mean (${statsCache.temperature.mean.toFixed(1)}°C)`
            })
        }
    }

    // Z-score check for humidity
    if (statsCache.humidity && statsCache.humidity.mean !== 0) {
        // Enforce minimum std dev
        const effectiveStd = Math.max(statsCache.humidity.std, MIN_STD_HUMIDITY)
        const zscore = Math.abs(humidity - statsCache.humidity.mean) / effectiveStd

        if (zscore > ZSCORE_THRESHOLD) {
            const severity: Anomaly['severity'] = zscore > 4 ? 'high' : zscore > 3.5 ? 'medium' : 'low'
            anomalies.push({
                id: 0,
                timestamp: now,
                metric: 'humidity',
                value: humidity,
                expectedRange: [
                    Math.round((statsCache.humidity.mean - 2 * effectiveStd) * 100) / 100,
                    Math.round((statsCache.humidity.mean + 2 * effectiveStd) * 100) / 100
                ],
                deviation: Math.round(zscore * 100) / 100,
                detectionMethod: 'realtime',
                severity,
                message: `ALERT: Humidity of ${humidity}% is ${zscore.toFixed(1)} std devs from mean (${statsCache.humidity.mean.toFixed(1)}%)`
            })
        }
    }

    // Rate of change check (compare with most recent reading)
    if (statsCache.recentReadings.length > 0) {
        const lastReading = statsCache.recentReadings[0]

        if (lastReading.temperature !== null && lastReading.temperature !== 0) {
            const tempChange = Math.abs(temperature - lastReading.temperature)
            if (tempChange > TEMP_RATE_THRESHOLD) {
                const severity: Anomaly['severity'] = tempChange > TEMP_RATE_THRESHOLD * 2 ? 'high' :
                    tempChange > TEMP_RATE_THRESHOLD * 1.5 ? 'medium' : 'low'
                anomalies.push({
                    id: 0,
                    timestamp: now,
                    metric: 'temperature',
                    value: temperature,
                    expectedRange: [
                        lastReading.temperature - TEMP_RATE_THRESHOLD,
                        lastReading.temperature + TEMP_RATE_THRESHOLD
                    ],
                    deviation: Math.round(tempChange * 100) / 100,
                    detectionMethod: 'rate_of_change',
                    severity,
                    message: `Temperature changed by ${tempChange.toFixed(1)} (from ${lastReading.temperature} to ${temperature}) - exceeds threshold of ${TEMP_RATE_THRESHOLD}`
                })
            }
        }

        if (lastReading.humidity !== null && lastReading.humidity !== 0) {
            const humidChange = Math.abs(humidity - lastReading.humidity)
            if (humidChange > HUMIDITY_RATE_THRESHOLD) {
                const severity: Anomaly['severity'] = humidChange > HUMIDITY_RATE_THRESHOLD * 2 ? 'high' :
                    humidChange > HUMIDITY_RATE_THRESHOLD * 1.5 ? 'medium' : 'low'
                anomalies.push({
                    id: 0,
                    timestamp: now,
                    metric: 'humidity',
                    value: humidity,
                    expectedRange: [
                        lastReading.humidity - HUMIDITY_RATE_THRESHOLD,
                        lastReading.humidity + HUMIDITY_RATE_THRESHOLD
                    ],
                    deviation: Math.round(humidChange * 100) / 100,
                    detectionMethod: 'rate_of_change',
                    severity,
                    message: `Humidity changed by ${humidChange.toFixed(1)} (from ${lastReading.humidity} to ${humidity}) - exceeds threshold of ${HUMIDITY_RATE_THRESHOLD}`
                })
            }
        }
    }

    // Log anomalies to database for persistence
    if (anomalies.length > 0) {
        await logAnomalies(anomalies)
    }

    return anomalies
}

/**
 * Log detected anomalies to the database
 */
async function logAnomalies(anomalies: Anomaly[]): Promise<void> {
    // Check if anomaly_logs table exists, create if needed
    const records = anomalies.map(a => ({
        metric: a.metric,
        value: a.value,
        deviation: a.deviation,
        severity: a.severity,
        detection_method: a.detectionMethod,
        message: a.message,
        detected_at: a.timestamp
    }))

    const { error } = await supabase
        .from('anomaly_logs')
        .insert(records)

    if (error) {
        // Table might not exist, log to console instead
        console.warn('Could not log anomalies to database:', error.message)
        console.log('Detected anomalies:', JSON.stringify(anomalies, null, 2))
    }
}

/**
 * Get recent anomaly logs
 */
export async function getRecentAnomalies(limit: number = 50): Promise<Anomaly[]> {
    const { data, error } = await supabase
        .from('anomaly_logs')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(limit)

    if (error || !data) {
        return []
    }

    return data.map((row: any) => ({
        id: row.id,
        timestamp: row.detected_at,
        metric: row.metric,
        value: row.value,
        expectedRange: [0, 0] as [number, number], // Not stored
        deviation: row.deviation,
        detectionMethod: row.detection_method,
        severity: row.severity,
        message: row.message
    }))
}
