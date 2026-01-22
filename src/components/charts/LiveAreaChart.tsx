"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import { MetricPoint } from "@/lib/mockData"

interface LiveAreaChartProps {
    title: string
    description?: string
    data: MetricPoint[]
    color?: string
    yDataKey?: string
}

export function LiveAreaChart({ title, description, data, color = "#a855f7", yDataKey = "value" }: LiveAreaChartProps) {
    return (
        <Card className="glass-panel h-full border-t border-t-white/10">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent className="h-[300px] w-full pt-0">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id={`colorGradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                                <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                            dataKey="time"
                            stroke="#52525b"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={30}
                        />
                        <YAxis
                            stroke="#52525b"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            width={40}
                            domain={['dataMin - 5', 'dataMax + 5']}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(24, 24, 27, 0.8)',
                                borderColor: 'rgba(255,255,255,0.1)',
                                backdropFilter: 'blur(8px)',
                                color: '#fafafa',
                                borderRadius: '8px'
                            }}
                            itemStyle={{ color: color }}
                            cursor={{ stroke: 'rgba(255,255,255,0.2)' }}
                        />
                        <Area
                            type="monotone"
                            dataKey={yDataKey}
                            stroke={color}
                            fillOpacity={1}
                            fill={`url(#colorGradient-${title})`}
                            strokeWidth={2}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
