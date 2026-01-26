import { NextResponse } from 'next/server'
import { refreshStatsCache } from '@/lib/anomalyDetector'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Vercel Cron authentication
const CRON_SECRET = process.env.CRON_SECRET

/**
 * Cron endpoint for periodic anomaly detection
 * Called by Vercel Cron once daily at midnight UTC (Hobby plan limitation)
 * Real-time detection still happens on every data ingest via /api/ingest
 */
export async function GET(request: Request) {
    // Verify cron secret (optional security)
    const authHeader = request.headers.get('authorization')
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Refresh the statistics cache
        await refreshStatsCache()

        // Run full anomaly detection on last 500 readings
        const { data: readings, error: readError } = await supabase
            .from('sensor_readings')
            .select('id, temperature, humidity, created_at')
            .order('created_at', { ascending: false })
            .limit(500)

        if (readError || !readings) {
            return NextResponse.json({ error: 'Failed to fetch readings' }, { status: 500 })
        }

        // Calculate statistics
        const tempValues = readings
            .map((r: any) => r.temperature)
            .filter((v: any): v is number => v !== null)
        const humidValues = readings
            .map((r: any) => r.humidity)
            .filter((v: any): v is number => v !== null)

        const tempMean = tempValues.reduce((a: number, b: number) => a + b, 0) / tempValues.length
        const tempStd = Math.sqrt(tempValues.reduce((acc: number, v: number) => acc + Math.pow(v - tempMean, 2), 0) / tempValues.length)
        const humidMean = humidValues.reduce((a: number, b: number) => a + b, 0) / humidValues.length
        const humidStd = Math.sqrt(humidValues.reduce((acc: number, v: number) => acc + Math.pow(v - humidMean, 2), 0) / humidValues.length)

        // Detect anomalies
        const anomalies: any[] = []
        const ZSCORE_THRESHOLD = 3.0

        for (const reading of readings) {
            if (reading.temperature !== null && tempStd > 0) {
                const zscore = Math.abs(reading.temperature - tempMean) / tempStd
                if (zscore > ZSCORE_THRESHOLD) {
                    anomalies.push({
                        id: reading.id,
                        timestamp: reading.created_at,
                        metric: 'temperature',
                        value: reading.temperature,
                        zscore: Math.round(zscore * 100) / 100,
                        severity: zscore > 4 ? 'high' : zscore > 3.5 ? 'medium' : 'low'
                    })
                }
            }
            if (reading.humidity !== null && humidStd > 0) {
                const zscore = Math.abs(reading.humidity - humidMean) / humidStd
                if (zscore > ZSCORE_THRESHOLD) {
                    anomalies.push({
                        id: reading.id,
                        timestamp: reading.created_at,
                        metric: 'humidity',
                        value: reading.humidity,
                        zscore: Math.round(zscore * 100) / 100,
                        severity: zscore > 4 ? 'high' : zscore > 3.5 ? 'medium' : 'low'
                    })
                }
            }
        }

        // Log high-severity anomalies
        const highSeverity = anomalies.filter(a => a.severity === 'high')
        if (highSeverity.length > 0) {
            console.log(`[CRON] Detected ${highSeverity.length} high-severity anomalies`)

            // Try to log to anomaly_logs table
            const records = highSeverity.slice(0, 10).map(a => ({
                metric: a.metric,
                value: a.value,
                deviation: a.zscore,
                severity: a.severity,
                detection_method: 'cron_batch',
                message: `Cron detected: ${a.metric} value ${a.value} (z-score: ${a.zscore})`,
                detected_at: new Date().toISOString()
            }))

            // Try to insert, ignore errors if table doesn't exist
            const { error: logError } = await supabase.from('anomaly_logs').insert(records)
            if (logError) {
                console.warn('Could not log anomalies:', logError.message)
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            analyzed: readings.length,
            statistics: {
                temperature: { mean: Math.round(tempMean * 100) / 100, std: Math.round(tempStd * 100) / 100 },
                humidity: { mean: Math.round(humidMean * 100) / 100, std: Math.round(humidStd * 100) / 100 }
            },
            anomaliesFound: anomalies.length,
            highSeverity: highSeverity.length
        })
    } catch (error) {
        console.error('[CRON] Error:', error)
        return NextResponse.json({ error: 'Cron job failed' }, { status: 500 })
    }
}
