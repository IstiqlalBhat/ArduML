import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '1h'

    // Map range to bucket width (seconds) and time range
    let bucketSeconds = 60 // 1 minute buckets
    let timeRange = '1 hour'

    switch (range) {
        case '1m':
            bucketSeconds = 1      // 1 second buckets
            timeRange = '1 minute'
            break
        case '5m':
            bucketSeconds = 5      // 5 second buckets
            timeRange = '5 minutes'
            break
        case '1h':
            bucketSeconds = 60     // 1 minute buckets
            timeRange = '1 hour'
            break
        case '6h':
            bucketSeconds = 360    // 6 minute buckets
            timeRange = '6 hours'
            break
        case '24h':
            bucketSeconds = 900    // 15 minute buckets
            timeRange = '24 hours'
            break
        case '3d':
            bucketSeconds = 3600   // 1 hour buckets
            timeRange = '3 days'
            break
        case '7d':
            bucketSeconds = 3600   // 1 hour buckets
            timeRange = '7 days'
            break
    }

    const { data, error } = await supabase.rpc('get_heatmap_data', {
        bucket_width_seconds: bucketSeconds,
        time_range: timeRange
    })

    if (error) {
        console.error('Error fetching heatmap data:', error)
        return NextResponse.json({
            light: [],
            motion: [],
            error: error.message
        })
    }

    // Transform data for the frontend
    const light = (data || []).map((d: { bucket: string; avg_light: number; reading_count: number }) => ({
        timestamp: new Date(d.bucket).getTime() / 1000, // Convert to seconds
        value: d.avg_light || 0,
        readings: d.reading_count
    })).sort((a: { timestamp: number }, b: { timestamp: number }) => a.timestamp - b.timestamp)

    const motion = (data || []).map((d: { bucket: string; avg_motion: number; reading_count: number }) => ({
        timestamp: new Date(d.bucket).getTime() / 1000,
        value: d.avg_motion || 0,
        readings: d.reading_count
    })).sort((a: { timestamp: number }, b: { timestamp: number }) => a.timestamp - b.timestamp)

    return NextResponse.json({ light, motion })
}
