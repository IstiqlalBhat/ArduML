
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '1H'

    let intervalSeconds = 60
    let timeRange = '1 hour'
    if (range === '1H') { intervalSeconds = 60; timeRange = '1 hour' }
    if (range === '1D') { intervalSeconds = 900; timeRange = '1 day' }
    if (range === '1W') { intervalSeconds = 3600; timeRange = '1 week' }
    if (range === '1M') { intervalSeconds = 14400; timeRange = '1 month' }

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
