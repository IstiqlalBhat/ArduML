'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface HeatmapDataPoint {
    timestamp: number // epoch seconds
    value: number // 0-1 intensity
}

interface HeatmapRowProps {
    title: string
    data: HeatmapDataPoint[]
    colorStart: string // e.g., 'bg-gray-800' (implicit or hex)
    colorEnd: string   // e.g. '#22c55e'
    height?: string
    gap?: string
    totalBoxes?: number
}

export function HeatmapRow({
    title,
    data,
    colorStart = '#1f2937', // gray-800
    colorEnd = '#22c55e',   // green-500
    height = 'h-8',
    gap = 'gap-1',
    totalBoxes = 60 // Default to show last 60 units (e.g. 60 minutes, 60 seconds)
}: HeatmapRowProps) {

    // Process data to map to a fixed grid of `totalBoxes` length
    // The data array is assumed to be sorted by timestamp descending or ascending.
    // We want to visualize the LAST `totalBoxes` units.

    // Actually, standard heatmaps flow left-to-right (old-to-new) or right-to-left. 
    // Let's assume right-side is "NOW".

    const boxes = useMemo(() => {
        // Generate empty boxes
        const grid = new Array(totalBoxes).fill(null).map((_, i) => ({
            index: i,
            value: 0,
            timestamp: 0
        }));

        // Map actual data to these boxes
        // We assume `data` contains the relevant time slices.
        // If we receive exactly `totalBoxes` data points from the parent, we just map them.
        // If we receive sparse data, we might need to look it up.

        // Simplification: We expect the parent to provide a dense array or we just map the last N items.
        // Ideally, the parent sends data for the specific time slots.

        const relevantData = data.slice(-totalBoxes);

        // Fill from the end (right side corresponds to last item in data)
        // If data.length < totalBoxes, the left side will be empty.
        const offset = totalBoxes - relevantData.length;

        return grid.map((box, i) => {
            if (i >= offset) {
                const dataPoint = relevantData[i - offset];
                return { ...box, value: dataPoint.value, timestamp: dataPoint.timestamp };
            }
            return box;
        });
    }, [data, totalBoxes]);

    // Interpolate color function (simple step approach or HSL)
    const getColor = (value: number) => {
        if (value === 0) return colorStart;

        // Simple 4-step opacity or direct check
        // Assuming value is 0-1.
        // We can use style with opacity or just return specific classes.
        // Let's use inline styles for dynamic color.

        return colorEnd; // Base color
    }

    const getOpacity = (value: number) => {
        if (value === 0) return 0.2; // Base dim level
        // Scale 0.3 to 1.0 based on intensity 0.05 to 1.0
        return 0.3 + (value * 0.7);
    }

    return (
        <div className="flex flex-col space-y-2 w-full">
            <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">{title}</span>
                {/* Legend or stats could go here */}
            </div>

            <div className={`flex w-full ${gap} ${height}`}>
                <TooltipProvider>
                    {boxes.map((box, i) => (
                        <Tooltip key={i}>
                            <TooltipTrigger asChild>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: getOpacity(box.value) }}
                                    transition={{ duration: 0.5 }}
                                    className="flex-1 rounded-sm h-full"
                                    style={{
                                        backgroundColor: box.value > 0 ? colorEnd : colorStart,
                                        boxShadow: box.value > 0 ? `0 0 ${box.value * 10}px ${colorEnd}` : 'none'
                                    }}
                                />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="text-xs">
                                    Int: {(box.value * 100).toFixed(0)}% at {new Date(box.timestamp * 1000).toLocaleTimeString()}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </TooltipProvider>
            </div>
        </div>
    )
}
