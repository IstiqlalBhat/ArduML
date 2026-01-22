"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { CandleStickChart } from "@/components/charts/CandleStickChart"
import {
  Wifi,
  WifiOff,
  Activity,
  Database
} from "lucide-react"

type TimeRange = "1H" | "1D" | "1W" | "1M"

interface OhlcDataPoint {
  x: number;
  y: [number, number, number, number];
}

export default function ArduinoDashboard() {
  const [candles, setCandles] = useState({
    temperature: [] as OhlcDataPoint[],
    humidity: [] as OhlcDataPoint[],
    light: [] as OhlcDataPoint[],
    motion: [] as OhlcDataPoint[]
  })
  const [timeRange, setTimeRange] = useState<TimeRange>("1H")
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/candles?range=${timeRange}`)
      if (res.ok) {
        const data = await res.json()
        setCandles(prev => ({
          ...prev, // Keep existing if needed, but here we replace for correct range view
          temperature: data.temperature || [],
          humidity: data.humidity || [],
          // API currently returns temp/hum. I need to update API route to return light/motion too.
          // Assuming I will fix the API route next.
          light: data.light || [],
          motion: data.motion || []
        }))
        setIsConnected(true)
        setLastUpdate(new Date())
      } else {
        setIsConnected(false)
      }
    } catch (e) {
      console.error(e)
      setIsConnected(false)
    }
  }, [timeRange])

  // Poll every 5 seconds (Supabase doesn't need 2s polling for candles)
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-6 lg:p-8 text-zinc-100 font-sans">
      {/* Header */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8 border-b border-zinc-800 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-700">
            <Database className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              ArduML TradeStation
            </h1>
            <p className="text-zinc-500 text-sm flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
              Supabase Cloud Data
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex bg-zinc-900 rounded-md p-1 border border-zinc-800">
            {(["1H", "1D", "1W", "1M"] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${timeRange === range
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-300"
                  }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]">
        <div className="h-full min-h-[400px]">
          <CandleStickChart
            title={`TEMPERATURE (${timeRange})`}
            data={candles.temperature}
            color="#f97316"
          />
        </div>
        <div className="h-full min-h-[400px]">
          <CandleStickChart
            title={`HUMIDITY (${timeRange})`}
            data={candles.humidity}
            color="#06b6d4"
          />
        </div>
        <div className="h-full min-h-[400px]">
          <CandleStickChart
            title={`LIGHT INTENSITY (${timeRange})`}
            data={candles.light}
            color="#eab308"
          />
        </div>
        <div className="h-full min-h-[400px]">
          <CandleStickChart
            title={`MOTION ACT (${timeRange})`}
            data={candles.motion}
            color="#22c55e"
          />
        </div>
      </div>
    </div>
  )
}
