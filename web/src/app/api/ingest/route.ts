
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { temperature, humidity, light, motion } = body

        // Simple validation
        if (temperature === undefined || humidity === undefined) {
            return NextResponse.json({ error: 'Missing temperature or humidity' }, { status: 400 })
        }

        // Handle both integer (new) and string (legacy) formats for light/motion
        // If already an integer (0 or 1), use directly; otherwise convert from string
        const lightValue = typeof light === 'number' ? light : (light === 'BRIGHT' ? 1 : 0)
        const motionValue = typeof motion === 'number' ? motion : (motion === 'YES' ? 1 : 0)

        const { error } = await supabase
            .from('sensor_readings')
            .insert({
                temperature,
                humidity,
                light: lightValue,
                motion: motionValue
            })

        if (error) {
            console.error('Supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
}
