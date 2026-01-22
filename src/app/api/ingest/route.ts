
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { temperature, humidity, light, motion, timestamp } = body

        // Simple validation
        if (temperature === undefined || humidity === undefined) {
            return NextResponse.json({ error: 'Missing temperature or humidity' }, { status: 400 })
        }

        // Handle both integer (new) and string (legacy) formats for light/motion
        // If already an integer (0 or 1), use directly; otherwise convert from string
        const lightValue = typeof light === 'number' ? light : (light === 'BRIGHT' ? 1 : 0)
        const motionValue = typeof motion === 'number' ? motion : (motion === 'YES' ? 1 : 0)

        // Prepare insert payload
        const payload: any = {
            temperature,
            humidity,
            light: lightValue,
            motion: motionValue
        }

        // If valid timestamp provided (and seemingly valid > year 2000), use it
        // ESP32 sends seconds, we need to convert to ISO string
        if (timestamp && typeof timestamp === 'number' && timestamp > 946684800) {
            payload.created_at = new Date(timestamp * 1000).toISOString()
        }

        const { error } = await supabase
            .from('sensor_readings')
            .insert(payload)

        if (error) {
            console.error('Supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
}
