"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { CandleStickChart } from "@/components/charts/CandleStickChart"
import { StripChart } from "@/components/charts/StripChart"
import {
  Wifi,
  WifiOff,
  Activity,
  Database
} from "lucide-react"

type TimeRange = "30s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d"

interface OhlcDataPoint {
  x: number;
  y: [number, number, number, number];
}

export default function ArduinoDashboard() {
  const [candles, setCandles] = useState({
    temperature: [] as OhlcDataPoint[],
    humidity: [] as OhlcDataPoint[]
  })
  const [events, setEvents] = useState({
    light: [] as { x: number; y: number }[],
    motion: [] as { x: number; y: number }[]
  })
  const [timeRange, setTimeRange] = useState<TimeRange>("5m")
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      // Fetch Candles (Temp/Hum)
      const resCandles = await fetch(`/api/candles?range=${timeRange}`)
      // Fetch Events (Light/Motion)
      const resEvents = await fetch(`/api/events?range=${timeRange}`)

      let success = false;

      if (resCandles.ok) {
        const data = await resCandles.json()
        setCandles(prev => ({
          ...prev,
          temperature: data.temperature || [],
          humidity: data.humidity || []
        }))
        success = true;
      }

      if (resEvents.ok) {
        const data = await resEvents.json()
        setEvents({
          light: data.light || [],
          motion: data.motion || []
        })
        success = true;
      }

      if (success) {
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

  // Poll every 2 seconds for snappier updates? Or keep 5s.
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
            {((["30s", "1m", "5m", "15m", "1h", "4h", "1d"]) as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 text-xs font-bold transition-colors uppercase ${timeRange === range
                  ? "text-white bg-zinc-800 rounded shadow-sm"
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
          <StripChart
            title={`LIGHT INTENSITY (${timeRange})`}
            data={events.light}
            activeColor="#eab308"
            activeLabel="BRIGHT"
            inactiveLabel="DARK"
          />
        </div>
        <div className="h-full min-h-[400px]">
          <StripChart
            title={`MOTION ACT (${timeRange})`}
            data={events.motion}
            activeColor="#22c55e"
            activeLabel="DETECTED"
            inactiveLabel="NONE"
          />
        </div>
      </div>
    </div>
  )
}
