
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '1H'

    let intervalSeconds = 60
    let timeRange = '1 hour'
    if (range === '30s') { intervalSeconds = 30; timeRange = '1 hour' }
    if (range === '1m') { intervalSeconds = 60; timeRange = '6 hours' }
    if (range === '5m') { intervalSeconds = 300; timeRange = '24 hours' }
    if (range === '15m') { intervalSeconds = 900; timeRange = '3 days' } // 900s = 15m
    if (range === '1h') { intervalSeconds = 3600; timeRange = '1 week' }
    if (range === '4h') { intervalSeconds = 14400; timeRange = '1 month' }
    if (range === '1d') { intervalSeconds = 86400; timeRange = '3 months' }

    const { data, error } = await supabase
        .rpc('get_candles', { interval_seconds: intervalSeconds, time_range: timeRange })

    if (error) {
        console.error('Error fetching candles:', error)
        return NextResponse.json({ temperature: [], humidity: [], light: [], motion: [] })
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
