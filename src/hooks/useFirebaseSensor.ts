"use client"

import { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { ref, onValue, off } from "firebase/database"

export interface SensorData {
  temperature: number | null
  humidity: number | null
  light: number | null
  motion: number | null
  timestamp: number | null
}

export interface FirebaseSensorState {
  current: SensorData
  isConnected: boolean
  lastUpdate: Date | null
}

const initialState: SensorData = {
  temperature: null,
  humidity: null,
  light: null,
  motion: null,
  timestamp: null
}

export function useFirebaseSensor(): FirebaseSensorState {
  const [current, setCurrent] = useState<SensorData>(initialState)
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useEffect(() => {
    // Reference to the latest_reading node in Firebase (matches Arduino push path)
    if (!db) {
      console.warn("Firebase db not initialized")
      return
    }
    const sensorRef = ref(db, "latest_reading")

    const unsubscribe = onValue(
      sensorRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val()
          setCurrent({
            temperature: data.temperature ?? null,
            humidity: data.humidity ?? null,
            light: typeof data.light === "string"
              ? (data.light === "BRIGHT" ? 1 : 0)
              : (data.light ?? null),
            motion: typeof data.motion === "string"
              ? (data.motion === "YES" ? 1 : 0)
              : (data.motion ?? null),
            timestamp: data.timestamp ?? null
          })
          setIsConnected(true)
          setLastUpdate(new Date())
        }
      },
      (error) => {
        console.error("Firebase subscription error:", error)
        setIsConnected(false)
      }
    )

    // Cleanup subscription on unmount
    return () => {
      off(sensorRef)
    }
  }, [])

  return { current, isConnected, lastUpdate }
}
