"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useMemo } from "react"
import { formatToTimeEst } from "@/lib/dateUtils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface StripChartProps {
    title: string
    data: { x: number; y: number }[]
    activeColor: string
    activeLabel: string
    inactiveLabel: string
}

export function StripChart({
    title,
    data,
    activeColor,
    activeLabel,
    inactiveLabel
}: StripChartProps) {

    // Process data to find state changes and durations
    const segments = useMemo(() => {
        if (!data || data.length === 0) return []

        const result = []
        // Sort by time just in case
        const sorted = [...data].sort((a, b) => a.x - b.x)

        // This logic assumes fairly regular intervals. 
        // We will create blocks.
        // A block starts at time T with state S. It ends at time T_next.

        for (let i = 0; i < sorted.length; i++) {
            const current = sorted[i]
            const next = sorted[i + 1]

            // If there's a next point, this segment lasts until then.
            // If it's the last point, give it a default duration (e.g., same as previous interval or fixed)
            // For visualization, we'll just map normalized widths.

            // BETTER VISUALIZATION:
            // We want to see a timeline.
            // Let's normalize the entire time range to 0-100%.

            result.push({
                start: current.x,
                state: current.y >= 0.5, // true if active
                raw: current.y
            })
        }
        return result
    }, [data])

    const startTime = segments.length > 0 ? segments[0].start : 0
    const endTime = segments.length > 0 ? segments[segments.length - 1].start : 0
    const totalDuration = endTime - startTime

    return (
        <Card className="h-full bg-zinc-950 border-zinc-800 flex flex-col">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center px-4 md:px-6 pb-6">

                {/* Visual Status Indicator */}
                <div className="mb-4 flex items-center gap-3">
                    <div
                        className={`w-3 h-3 rounded-full transition-colors duration-500`}
                        style={{
                            backgroundColor: segments.length > 0 && segments[segments.length - 1].state
                                ? activeColor
                                : '#3f3f46' // zinc-700
                        }}
                    />
                    <span className={`text-2xl font-bold transition-colors duration-500`}
                        style={{
                            color: segments.length > 0 && segments[segments.length - 1].state
                                ? activeColor
                                : '#71717a' // zinc-500
                        }}
                    >
                        {segments.length > 0
                            ? (segments[segments.length - 1].state ? activeLabel : inactiveLabel)
                            : "NO DATA"
                        }
                    </span>
                </div>

                {/* The Strip Chart */}
                <div className="relative h-16 w-full bg-zinc-900 rounded-md overflow-hidden flex border border-zinc-800">
                    {segments.length > 1 && segments.map((seg, index) => {
                        // Skip last point for rendering segments since it has no duration unless we assume one
                        if (index === segments.length - 1) return null;

                        const nextSeg = segments[index + 1];
                        const duration = nextSeg.start - seg.start;
                        const widthPct = (duration / totalDuration) * 100;

                        // Minimum visual width to avoid sub-pixel rendering issues
                        if (widthPct < 0.01) return null;

                        return (
                            <TooltipProvider key={index} delayDuration={0}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div
                                            className="h-full transition-opacity hover:opacity-80"
                                            style={{
                                                width: `${widthPct}%`,
                                                backgroundColor: seg.state ? activeColor : 'transparent',
                                                opacity: seg.state ? 1 : 0.05 // subtle visible background for inactive
                                            }}
                                        />
                                    </TooltipTrigger>
                                    <TooltipContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                                        <p className="font-bold">{seg.state ? activeLabel : inactiveLabel}</p>
                                        <p className="text-xs text-zinc-500">{formatToTimeEst(seg.start)}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )
                    })}
                </div>

                {/* Time Axis Labels */}
                <div className="flex justify-between mt-2 text-xs text-zinc-600 font-mono">
                    <span>{startTime > 0 ? formatToTimeEst(startTime) : "--:--"}</span>
                    <span>{endTime > 0 ? formatToTimeEst(endTime) : "--:--"}</span>
                </div>
            </CardContent>
        </Card>
    )
}
