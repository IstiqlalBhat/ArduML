"use client"

import { motion, AnimatePresence } from "framer-motion"

interface ActivityPulseProps {
  isActive: boolean
  color: string
  size?: "sm" | "md" | "lg"
  label?: string
}

const sizeClasses = {
  sm: { outer: "w-8 h-8", inner: "w-3 h-3", ring: "w-6 h-6" },
  md: { outer: "w-12 h-12", inner: "w-4 h-4", ring: "w-9 h-9" },
  lg: { outer: "w-16 h-16", inner: "w-6 h-6", ring: "w-12 h-12" },
}

export function ActivityPulse({
  isActive,
  color,
  size = "md",
  label,
}: ActivityPulseProps) {
  const classes = sizeClasses[size]

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative ${classes.outer} flex items-center justify-center`}>
        {/* Ripple effects when active */}
        <AnimatePresence>
          {isActive && (
            <>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  style={{ backgroundColor: color }}
                  initial={{ width: 0, height: 0, opacity: 0.6 }}
                  animate={{
                    width: ["0%", "100%"],
                    height: ["0%", "100%"],
                    opacity: [0.6, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: i * 0.6,
                    ease: "easeOut",
                  }}
                />
              ))}
            </>
          )}
        </AnimatePresence>

        {/* Outer ring */}
        <motion.div
          className={`absolute ${classes.ring} rounded-full border-2`}
          style={{
            borderColor: isActive ? color : "#3f3f46",
          }}
          animate={isActive ? {
            scale: [1, 1.1, 1],
            opacity: [0.5, 1, 0.5],
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />

        {/* Inner dot */}
        <motion.div
          className={`relative ${classes.inner} rounded-full`}
          style={{
            backgroundColor: isActive ? color : "#52525b",
            boxShadow: isActive ? `0 0 20px ${color}80` : "none",
          }}
          animate={isActive ? {
            scale: [1, 1.2, 1],
          } : {}}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      </div>

      {label && (
        <motion.span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: isActive ? color : "#71717a" }}
          animate={isActive ? { opacity: [0.7, 1, 0.7] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {label}
        </motion.span>
      )}
    </div>
  )
}

interface ConnectionStatusProps {
  isConnected: boolean
  lastUpdate?: Date | null
}

export function ConnectionStatus({ isConnected, lastUpdate }: ConnectionStatusProps) {
  const formatLastUpdate = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
    if (seconds < 5) return "Just now"
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ago`
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <motion.div
          className={`w-2 h-2 rounded-full ${
            isConnected ? "bg-emerald-500" : "bg-red-500"
          }`}
          animate={isConnected ? {
            scale: [1, 1.2, 1],
            opacity: [1, 0.7, 1],
          } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <span className="text-xs font-medium text-zinc-400">
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {lastUpdate && isConnected && (
        <span className="text-[10px] text-zinc-500">
          {formatLastUpdate(lastUpdate)}
        </span>
      )}
    </div>
  )
}
