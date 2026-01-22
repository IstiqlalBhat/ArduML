'use client'

import { useState, useEffect, useMemo } from 'react'
import { HeatmapRow } from './HeatmapRow'
import { supabase } from '@/lib/supabase'
import { useFirebaseSensor } from '@/hooks/useFirebaseSensor'

const TIME_RANGES = {
    '1m': { label: 'Seconds (1m)', bucket: 1, total: 60 },      // 60 boxes, 1 sec each
    '1h': { label: 'Minutes (1h)', bucket: 60, total: 60 },      // 60 boxes, 1 min each
    '4h': { label: 'Hours (4h)', bucket: 240, total: 60 },       // 60 boxes, 4 mins each
    '24h': { label: 'Hours (24h)', bucket: 3600, total: 24 },     // 24 boxes, 1 hour each
}

export function HeatmapController() {
    const [resolution, setResolution] = useState<'1m' | '1h' | '4h' | '24h'>('1h')
    const [motionData, setMotionData] = useState<{ timestamp: number, value: number }[]>([])
    const [lightData, setLightData] = useState<{ timestamp: number, value: number }[]>([])

    // Real-time data from Firebase
    const { current: liveData, isConnected: isFirebaseConnected } = useFirebaseSensor()

    // Load initial history from Supabase
    useEffect(() => {
        const fetchData = async () => {
            const config = TIME_RANGES[resolution];

            let rangeStr = '1 hour';
            if (resolution === '1m') rangeStr = '5 minutes';
            if (resolution === '4h') rangeStr = '4 hours';
            if (resolution === '24h') rangeStr = '24 hours';

            const { data, error } = await supabase.rpc('get_heatmap_data', {
                bucket_width_seconds: config.bucket,
                time_range: rangeStr
            });

            if (error) {
                console.error('Error fetching heatmap:', error);
                return;
            }

            if (data) {
                const parsedMotion = data.map((d: any) => ({
                    timestamp: new Date(d.bucket).getTime() / 1000,
                    value: d.avg_motion
                })).sort((a: any, b: any) => a.timestamp - b.timestamp);

                setMotionData(parsedMotion);

                const parsedLight = data.map((d: any) => ({
                    timestamp: new Date(d.bucket).getTime() / 1000,
                    value: d.avg_light
                })).sort((a: any, b: any) => a.timestamp - b.timestamp);

                setLightData(parsedLight);
            }
        };

        fetchData();

        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);

    }, [resolution]);

    // Merge Live Data into the View
    const mergedMotion = useMemo(() => {
        if (!isFirebaseConnected || resolution !== '1m') return motionData; // Use history only for stable long views

        // For '1m' (Seconds) view, we want to show the current second lighting up
        const nowSec = Math.floor(Date.now() / 1000);
        const newData = [...motionData];
        const lastIdx = newData.findIndex(d => d.timestamp === nowSec);

        if (lastIdx >= 0) {
            newData[lastIdx] = { timestamp: nowSec, value: liveData.motion ? 1 : 0 };
        } else {
            newData.push({ timestamp: nowSec, value: liveData.motion ? 1 : 0 });
        }
        return newData;
    }, [motionData, liveData.motion, isFirebaseConnected, resolution]);

    const mergedLight = useMemo(() => {
        if (!isFirebaseConnected || resolution !== '1m') return lightData;

        const nowSec = Math.floor(Date.now() / 1000);
        const newData = [...lightData];
        const lastIdx = newData.findIndex(d => d.timestamp === nowSec);

        if (lastIdx >= 0) {
            newData[lastIdx] = { timestamp: nowSec, value: liveData.light ? 1 : 0 };
        } else {
            newData.push({ timestamp: nowSec, value: liveData.light ? 1 : 0 });
        }
        return newData;
    }, [lightData, liveData.light, isFirebaseConnected, resolution]);

    return (
        <div className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white tracking-widest uppercase font-mono">
                    Sensor Activity Heatmap
                </h2>

                <div className="flex bg-gray-900 rounded-lg p-1">
                    {(Object.keys(TIME_RANGES) as Array<keyof typeof TIME_RANGES>).map((key) => (
                        <button
                            key={key}
                            onClick={() => setResolution(key)}
                            className={`px-3 py-1 text-xs rounded-md transition-all font-mono ${resolution === key
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50'
                                    : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            {TIME_RANGES[key].label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-6">
                <HeatmapRow
                    title="MOTION DENSITY"
                    data={mergedMotion}
                    colorStart="#1f2937"
                    colorEnd="#ef4444" // Red for motion
                    totalBoxes={TIME_RANGES[resolution].total}
                />

                <HeatmapRow
                    title="LIGHT INTENSITY"
                    data={mergedLight}
                    colorStart="#1f2937"
                    colorEnd="#eab308" // Yellow for light
                    totalBoxes={TIME_RANGES[resolution].total}
                />
            </div>
        </div>
    )
}
