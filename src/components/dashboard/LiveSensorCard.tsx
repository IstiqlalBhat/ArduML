"use client"

import { motion } from "framer-motion"
import { Thermometer, Droplets, Sun, Moon, Activity, Radar } from "lucide-react"

interface LiveSensorCardProps {
  type: "temperature" | "humidity" | "light" | "motion"
  value: number | null
  isConnected: boolean
}

const sensorConfig = {
  temperature: {
    icon: Thermometer,
    label: "Temperature",
    unit: "°C",
    gradient: "from-orange-500 via-red-500 to-pink-500",
    bgGradient: "from-orange-500/20 via-red-500/10 to-transparent",
    iconBg: "bg-orange-500/20",
    iconColor: "text-orange-400",
    ringColor: "ring-orange-500/30",
    format: (v: number) => v.toFixed(1),
  },
  humidity: {
    icon: Droplets,
    label: "Humidity",
    unit: "%",
    gradient: "from-cyan-500 via-blue-500 to-indigo-500",
    bgGradient: "from-cyan-500/20 via-blue-500/10 to-transparent",
    iconBg: "bg-cyan-500/20",
    iconColor: "text-cyan-400",
    ringColor: "ring-cyan-500/30",
    format: (v: number) => v.toFixed(1),
  },
  light: {
    icon: Sun,
    label: "Light",
    unit: "",
    gradient: "from-yellow-400 via-amber-500 to-orange-500",
    bgGradient: "from-yellow-500/20 via-amber-500/10 to-transparent",
    iconBg: "bg-yellow-500/20",
    iconColor: "text-yellow-400",
    ringColor: "ring-yellow-500/30",
    format: (v: number) => (v >= 0.5 ? "BRIGHT" : "DARK"),
  },
  motion: {
    icon: Activity,
    label: "Motion",
    unit: "",
    gradient: "from-emerald-500 via-green-500 to-teal-500",
    bgGradient: "from-emerald-500/20 via-green-500/10 to-transparent",
    iconBg: "bg-emerald-500/20",
    iconColor: "text-emerald-400",
    ringColor: "ring-emerald-500/30",
    format: (v: number) => (v >= 0.5 ? "DETECTED" : "NONE"),
  },
}

export function LiveSensorCard({ type, value, isConnected }: LiveSensorCardProps) {
  const config = sensorConfig[type]
  const Icon = config.icon
  const isBinary = type === "light" || type === "motion"
  const isActive = isBinary && value !== null && value >= 0.5

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`
        relative overflow-hidden rounded-2xl
        bg-zinc-900/80 backdrop-blur-xl
        border border-zinc-800/50
        p-5 h-full
        ring-1 ${config.ringColor}
        transition-all duration-300
        hover:border-zinc-700/50 hover:shadow-lg hover:shadow-zinc-900/50
      `}
    >
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${config.bgGradient} opacity-50`} />

      {/* Animated pulse for binary active state */}
      {isBinary && isActive && (
        <motion.div
          className={`absolute inset-0 bg-gradient-to-br ${config.bgGradient}`}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className={`p-2.5 rounded-xl ${config.iconBg}`}>
            <Icon className={`w-5 h-5 ${config.iconColor}`} />
          </div>

          {/* Connection indicator */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
              Live
            </span>
            <motion.div
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-zinc-600"}`}
              animate={isConnected ? { scale: [1, 1.2, 1], opacity: [1, 0.7, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
        </div>

        {/* Value display */}
        <div className="flex-1 flex flex-col justify-center">
          {value !== null ? (
            <>
              <motion.div
                key={value}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-baseline gap-1"
              >
                <span
                  className={`
                    text-4xl font-bold tracking-tight
                    bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent
                  `}
                >
                  {config.format(value)}
                </span>
                {config.unit && (
                  <span className="text-lg font-medium text-zinc-500">
                    {config.unit}
                  </span>
                )}
              </motion.div>

              {/* Binary state indicator */}
              {isBinary && (
                <div className="mt-2 flex items-center gap-2">
                  <motion.div
                    className={`
                      w-2 h-2 rounded-full
                      ${isActive ? config.iconColor.replace("text-", "bg-") : "bg-zinc-600"}
                    `}
                    animate={isActive ? { scale: [1, 1.5, 1] } : {}}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  />
                  <span className="text-xs text-zinc-500">
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <motion.div
                className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-400 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <span className="text-zinc-500 text-sm">Waiting...</span>
            </div>
          )}
        </div>

        {/* Label */}
        <div className="mt-3 pt-3 border-t border-zinc-800/50">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            {config.label}
          </span>
        </div>
      </div>
    </motion.div>
  )
}
