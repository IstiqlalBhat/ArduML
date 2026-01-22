import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '1H'

    // Map range to time interval for the SQL function
    let timeRange = '1 hour'
    if (range === '30s') timeRange = '1 hour' // Keep 1 hour context to see previous state
    if (range === '1m') timeRange = '6 hours'
    if (range === '5m') timeRange = '24 hours'
    if (range === '15m') timeRange = '3 days'
    if (range === '1h') timeRange = '1 week'
    if (range === '4h') timeRange = '1 month'
    if (range === '1d') timeRange = '3 months'

    // Call the RPC function
    const { data, error } = await supabase
        .rpc('get_sensor_events', { time_range: timeRange })

    if (error) {
        console.error('Error fetching sensor events:', error)
        // Fallback or error
        return NextResponse.json({ light: [], motion: [] })
    }

    // Process data into two separate arrays for the charts
    // Data comes in as: { created_at, light, motion }
    // StripChart expects: { x: timestamp, y: 0 or 1 }

    const lightEvents = data.map((d: any) => ({
        x: new Date(d.created_at).getTime(),
        y: Number(d.light)
    }))

    const motionEvents = data.map((d: any) => ({
        x: new Date(d.created_at).getTime(),
        y: Number(d.motion)
    }))

    return NextResponse.json({
        light: lightEvents,
        motion: motionEvents
    })
}
