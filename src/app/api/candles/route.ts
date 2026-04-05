
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const EMPTY = { temperature: [], humidity: [], light: [], motion: [] }

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '1H'

    // For 1d candles, use the pre-aggregated hourly materialized view
    // instead of scanning 1.5M+ raw records (which times out)
    if (range === '1d') {
        return buildCandlesFromHourlyView('3 months')
    }

    let intervalSeconds = 60
    let timeRange = '1 hour'
    if (range === '30s') { intervalSeconds = 30; timeRange = '1 hour' }
    if (range === '1m') { intervalSeconds = 60; timeRange = '6 hours' }
    if (range === '5m') { intervalSeconds = 300; timeRange = '24 hours' }
    if (range === '15m') { intervalSeconds = 900; timeRange = '3 days' } // 900s = 15m
    if (range === '1h') { intervalSeconds = 3600; timeRange = '1 week' }
    if (range === '4h') { intervalSeconds = 14400; timeRange = '1 month' }

    const { data, error } = await supabase
        .rpc('get_candles', { interval_seconds: intervalSeconds, time_range: timeRange })

    if (error) {
        console.error('Error fetching candles:', error)
        return NextResponse.json(EMPTY)
    }

    // Helper to map DB rows to Apex format
    const mapCandles = (metric: string) => data
        .filter((d: any) => d.metric_type === metric)
        .map((d: any) => ({
            x: new Date(d.bucket).getTime(),
            y: [d.open, d.high, d.low, d.close]
        }))

    return NextResponse.json({
        temperature: mapCandles('temperature'),
        humidity: mapCandles('humidity'),
        light: mapCandles('light'),
        motion: mapCandles('motion')
    })
}

/**
 * Build daily OHLC candles from the sensor_readings_hourly materialized view.
 * Reads ~2K rows instead of 1.5M raw records.
 */
async function buildCandlesFromHourlyView(timeRange: string) {
    const cutoff = new Date()
    const months = parseInt(timeRange) || 3
    cutoff.setMonth(cutoff.getMonth() - months)

    const { data, error } = await supabase
        .from('sensor_readings_hourly')
        .select('hour, avg_temp, min_temp, max_temp, avg_humidity, min_humidity, max_humidity, light_on_pct, motion_pct')
        .gt('hour', cutoff.toISOString())
        .order('hour', { ascending: true })

    if (error) {
        console.error('Error fetching hourly data for daily candles:', error)
        return NextResponse.json(EMPTY)
    }

    if (!data || data.length === 0) {
        return NextResponse.json(EMPTY)
    }

    // Group hourly rows by day
    const days = new Map<string, typeof data>()
    for (const row of data) {
        const day = row.hour.slice(0, 10) // "YYYY-MM-DD"
        if (!days.has(day)) days.set(day, [])
        days.get(day)!.push(row)
    }

    const tempCandles: { x: number; y: [number, number, number, number] }[] = []
    const humidCandles: typeof tempCandles = []
    const lightCandles: typeof tempCandles = []
    const motionCandles: typeof tempCandles = []

    for (const [day, hours] of days) {
        const x = new Date(day).getTime()
        const first = hours[0]
        const last = hours[hours.length - 1]

        tempCandles.push({
            x,
            y: [
                Number(first.avg_temp),
                Math.max(...hours.map(h => Number(h.max_temp))),
                Math.min(...hours.map(h => Number(h.min_temp))),
                Number(last.avg_temp),
            ]
        })

        humidCandles.push({
            x,
            y: [
                Number(first.avg_humidity),
                Math.max(...hours.map(h => Number(h.max_humidity))),
                Math.min(...hours.map(h => Number(h.min_humidity))),
                Number(last.avg_humidity),
            ]
        })

        // Light/motion: use hourly percentages (0-100) for meaningful daily candles
        const lightPcts = hours.map(h => Number(h.light_on_pct))
        lightCandles.push({
            x,
            y: [lightPcts[0], Math.max(...lightPcts), Math.min(...lightPcts), lightPcts[lightPcts.length - 1]]
        })

        const motionPcts = hours.map(h => Number(h.motion_pct))
        motionCandles.push({
            x,
            y: [motionPcts[0], Math.max(...motionPcts), Math.min(...motionPcts), motionPcts[motionPcts.length - 1]]
        })
    }

    return NextResponse.json({
        temperature: tempCandles,
        humidity: humidCandles,
        light: lightCandles,
        motion: motionCandles,
    })
}
