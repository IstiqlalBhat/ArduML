"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"

interface DataPoint {
    time: string;
    value: number;  // 0 or 1
}

interface BinaryStateChartProps {
    title: string;
    description?: string;
    data: DataPoint[];
    activeColor: string;
    inactiveColor: string;
    glowColor: string;
    activeLabel: string;
    inactiveLabel: string;
    icon?: React.ReactNode;
    currentState: boolean;
}

export function BinaryStateChart({
    title,
    description,
    data,
    activeColor,
    inactiveColor,
    glowColor,
    activeLabel,
    inactiveLabel,
    icon,
    currentState
}: BinaryStateChartProps) {
    // Calculate activity percentage
    const activeCount = data.filter(d => d.value === 1).length;
    const activityPercent = data.length > 0 ? Math.round((activeCount / data.length) * 100) : 0;

    return (
        <Card className="h-full bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none overflow-hidden relative transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none">

            {/* Status indicator when active - Hard Tag */}
            {currentState && (
                <div
                    className="absolute top-4 right-4 w-4 h-4 border-2 border-black animate-none"
                    style={{ backgroundColor: activeColor }}
                />
            )}

            <CardHeader className="pb-2 relative z-10 border-b-4 border-black bg-zinc-50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {icon && (
                            <div className="p-2 border-2 border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                {icon}
                            </div>
                        )}
                        <div>
                            <CardTitle className="text-xl font-black tracking-tight text-black uppercase">{title}</CardTitle>
                            {description && (
                                <CardDescription className="text-xs font-bold font-mono text-black/60 mt-0.5 uppercase tracking-widest">{description}</CardDescription>
                            )}
                        </div>
                    </div>
                    {/* Current state badge */}
                    <div
                        className="px-4 py-2 border-2 border-black font-black text-sm uppercase tracking-wider bg-white"
                        style={{
                            color: currentState ? "#000" : "#000",
                            backgroundColor: currentState ? activeColor : inactiveColor,
                            boxShadow: '4px 4px 0px 0px #000'
                        }}
                    >
                        {currentState ? activeLabel : inactiveLabel}
                    </div>
                </div>

                {/* Activity bar */}
                <div className="mt-4 flex items-center gap-3">
                    <div className="flex-1 h-4 border-2 border-black bg-white relative">
                        <div
                            className="h-full bg-black transition-all duration-300"
                            style={{
                                width: `${activityPercent}%`,
                                backgroundColor: activeColor
                            }}
                        />
                    </div>
                    <span className="text-xs font-black font-mono text-black">
                        {activityPercent}%
                    </span>
                </div>
            </CardHeader>

            <CardContent className="h-[180px] w-full pt-4 relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid
                            strokeDasharray="0 0"
                            stroke="#000000"
                            strokeOpacity={0.1}
                            vertical={true}
                        />

                        <XAxis
                            dataKey="time"
                            stroke="#000000"
                            fontSize={10}
                            tickLine={true}
                            tickSize={5}
                            axisLine={true}
                            minTickGap={60}
                            tick={{ fill: '#000000', fontWeight: 'bold', fontFamily: 'monospace' }}
                        />

                        <YAxis
                            stroke="transparent"
                            fontSize={9}
                            tickLine={false}
                            axisLine={false}
                            width={30}
                            domain={[0, 1]}
                            ticks={[0, 1]}
                            tickFormatter={(val) => val === 1 ? activeLabel.slice(0, 3).toUpperCase() : inactiveLabel.slice(0, 3).toUpperCase()}
                            tick={{ fill: '#000000', fontWeight: 'bold', fontFamily: 'monospace' }}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#ffffff',
                                borderColor: '#000000',
                                borderWidth: 3,
                                color: '#000000',
                                borderRadius: '0px',
                                boxShadow: '4px 4px 0px 0px #000000',
                                padding: '10px 14px'
                            }}
                            labelStyle={{ color: '#000000', fontSize: 10, fontWeight: 'bold', fontFamily: 'monospace', textTransform: 'uppercase' }}
                            formatter={(value: any) => [
                                value === 1 ? activeLabel : inactiveLabel,
                                'Status'
                            ]}
                            cursor={{ stroke: '#000000', strokeWidth: 2 }}
                        />

                        <Area
                            type="stepAfter"
                            dataKey="value"
                            stroke="#000000"
                            strokeWidth={3}
                            fill={activeColor}
                            fillOpacity={1}
                            isAnimationActive={false}
                            dot={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
