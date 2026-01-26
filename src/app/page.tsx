"use client"

import { useEffect, useState, useCallback } from "react"
import { motion } from "framer-motion"
import {
  Thermometer,
  Droplets,
  Radio,
  Clock,
  Zap,
  Wifi,
  WifiOff,
  BarChart3,
  AlertTriangle,
} from "lucide-react"
import { useFirebaseSensor } from "@/hooks/useFirebaseSensor"
import { LiveSensorCard } from "@/components/dashboard/LiveSensorCard"
import { ConnectionStatus } from "@/components/dashboard/ActivityPulse"
import { AnomalyAlert } from "@/components/dashboard/AnomalyAlert"
import { CandleStickChart } from "@/components/charts/CandleStickChart"
import { HeatmapController } from "@/components/HeatmapController"

type TimeRange = "30s" | "1m" | "5m" | "15m" | "1h" | "4h" | "1d"

interface OhlcDataPoint {
  x: number
  y: [number, number, number, number]
}

const timeRanges: { value: TimeRange; label: string; description: string }[] = [
  { value: "30s", label: "30s", description: "Last hour, 30s intervals" },
  { value: "1m", label: "1m", description: "Last 6 hours, 1m intervals" },
  { value: "5m", label: "5m", description: "Last 24 hours, 5m intervals" },
  { value: "15m", label: "15m", description: "Last 3 days, 15m intervals" },
  { value: "1h", label: "1h", description: "Last week, 1h intervals" },
  { value: "4h", label: "4h", description: "Last month, 4h intervals" },
  { value: "1d", label: "1d", description: "Last 3 months, 1d intervals" },
]

export default function ArduinoDashboard() {
  const [candles, setCandles] = useState({
    temperature: [] as OhlcDataPoint[],
    humidity: [] as OhlcDataPoint[],
    light: [] as OhlcDataPoint[],
    motion: [] as OhlcDataPoint[],
  })
  const [timeRange, setTimeRange] = useState<TimeRange>("5m")
  const [isApiConnected, setIsApiConnected] = useState(false)
  const [lastApiUpdate, setLastApiUpdate] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Firebase real-time hook for instantaneous values
  const { current: liveData, isConnected: isFirebaseConnected, lastUpdate: firebaseLastUpdate } = useFirebaseSensor()

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/candles?range=${timeRange}`)
      if (res.ok) {
        const data = await res.json()
        setCandles({
          temperature: data.temperature || [],
          humidity: data.humidity || [],
          light: data.light || [],
          motion: data.motion || [],
        })
        setIsApiConnected(true)
        setLastApiUpdate(new Date())
      } else {
        setIsApiConnected(false)
      }
    } catch (e) {
      console.error(e)
      setIsApiConnected(false)
    } finally {
      setIsLoading(false)
    }
  }, [timeRange])

  // Poll for historical data every 5 seconds
  useEffect(() => {
    setIsLoading(true)
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  const isConnected = isApiConnected || isFirebaseConnected
  const currentTimeRange = timeRanges.find(r => r.value === timeRange)

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-100 relative">
      {/* Background effects */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-900/50 via-transparent to-zinc-900/50 pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[600px] h-[400px] bg-cyan-500/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="relative z-10 p-4 md:p-6 lg:p-8 max-w-[1920px] mx-auto">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center border border-zinc-800/50 backdrop-blur-xl">
                <Radio className="w-7 h-7 text-emerald-400" />
              </div>
              <motion.div
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-zinc-900"
                animate={isConnected ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                <span className="text-gradient-emerald">Ardu</span>
                <span className="text-white">ML</span>
                <span className="text-zinc-500 font-normal ml-2 text-lg">Dashboard</span>
              </h1>
              <div className="flex items-center gap-4 mt-1">
                <ConnectionStatus
                  isConnected={isFirebaseConnected}
                  lastUpdate={firebaseLastUpdate}
                />
                {isApiConnected && (
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-cyan-400" />
                    <span className="text-[10px] text-zinc-500">Supabase</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex flex-col items-start xl:items-end gap-2 w-full xl:w-auto">
            <div className="flex items-center gap-2 w-full xl:w-auto overflow-x-auto">
              <Clock className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <div className="flex bg-zinc-900/80 backdrop-blur-xl rounded-xl p-1 border border-zinc-800/50 overflow-x-auto scrollbar-hide">
                {timeRanges.map((range) => (
                  <button
                    key={range.value}
                    onClick={() => setTimeRange(range.value)}
                    className={`
                      px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 whitespace-nowrap
                      ${timeRange === range.value
                        ? "bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10"
                        : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                      }
                    `}
                    title={range.description}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
            {currentTimeRange && (
              <span className="text-[10px] text-zinc-600 hidden sm:block">
                {currentTimeRange.description}
              </span>
            )}
          </div>
        </motion.header>

        {/* Live Sensor Cards */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Live Readings
            </h2>
            {isFirebaseConnected && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Firebase Real-time
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <LiveSensorCard
              type="temperature"
              value={liveData.temperature}
              isConnected={isFirebaseConnected}
            />
            <LiveSensorCard
              type="humidity"
              value={liveData.humidity}
              isConnected={isFirebaseConnected}
            />
            <LiveSensorCard
              type="light"
              value={liveData.light}
              isConnected={isFirebaseConnected}
            />
            <LiveSensorCard
              type="motion"
              value={liveData.motion}
              isConnected={isFirebaseConnected}
            />
          </div>
        </motion.section>

        {/* Anomaly Detection Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              ML Anomaly Detection
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
              Last 500 readings
            </span>
          </div>
          <AnomalyAlert />
        </motion.section>

        {/* Charts Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Charts ({timeRange} candles)
              </h2>
            </div>
            <div className="hidden md:flex items-center gap-4 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                Up candle
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                Down candle
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                Live reading
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Temperature Candlestick Chart */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="h-[300px] sm:h-[350px] lg:h-[420px]"
            >
              <CandleStickChart
                title="Temperature"
                data={candles.temperature}
                liveValue={liveData.temperature}
                unit="°C"
                icon={<Thermometer className="w-5 h-5 text-orange-400" />}
              />
            </motion.div>

            {/* Humidity Candlestick Chart */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.35 }}
              className="h-[300px] sm:h-[350px] lg:h-[420px]"
            >
              <CandleStickChart
                title="Humidity"
                data={candles.humidity}
                liveValue={liveData.humidity}
                unit="%"
                icon={<Droplets className="w-5 h-5 text-cyan-400" />}
              />
            </motion.div>
          </div>
        </motion.section>

        {/* Heatmap Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-6 mb-6"
        >
          <HeatmapController />
        </motion.section>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 pt-6 border-t border-zinc-800/50 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-zinc-500"
        >
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span className="font-semibold">ArduML IoT Dashboard</span>
            <span className="hidden sm:block w-1 h-1 rounded-full bg-zinc-700" />
            <span className="hidden sm:block">Candlestick charts with OHLC data</span>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              {isFirebaseConnected ? (
                <Wifi className="w-3 h-3 text-emerald-400" />
              ) : (
                <WifiOff className="w-3 h-3 text-zinc-600" />
              )}
              <span className="text-[10px] sm:text-xs">
                {isFirebaseConnected
                  ? `Firebase: ${firebaseLastUpdate?.toLocaleTimeString() ?? "N/A"}`
                  : "Firebase: Connecting..."}
              </span>
            </div>
            {lastApiUpdate && (
              <div className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] sm:text-xs">Supabase: {lastApiUpdate.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </motion.footer>
      </div>
    </div>
  )
}
