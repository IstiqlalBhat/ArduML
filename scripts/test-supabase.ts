
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
    console.log('Testing Supabase connection...')
    console.log(`URL: ${supabaseUrl}`)

    try {
        const { data, error } = await supabase.from('sensor_readings').select('count', { count: 'exact', head: true })

        if (error) {
            console.error('Connection failed:', error.message)
        } else {
            console.log('Connection successful!')
            console.log(`Found ${data} records in 'sensor_readings' table (or table exists but empty).`)
            // Note: count is returned in 'count' property if used, but here data might be null if head:true. 
            // Actually head:true returns null data and count property.
        }

        // Let's try to insert a dummy record if table exists to verify write access? 
        // Maybe better just to check read first.

        // Check if we can call the RPC function
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_candles', { interval_seconds: 3600 })
        if (rpcError) {
            console.log('RPC get_candles check: Failed (might be expected if no data)', rpcError.message)
        } else {
            console.log('RPC get_candles check: Success')
        }

    } catch (err) {
        console.error('Unexpected error:', err)
    }
}

testConnection()
