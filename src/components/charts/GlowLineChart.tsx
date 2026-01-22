"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts"
import { smartFormatEst, formatToDateEst } from "@/lib/dateUtils"

interface DataPoint {
    time: string;
    value: number;
}

interface GlowLineChartProps {
    title: string;
    description?: string;
    data: DataPoint[];
    color: string;
    glowColor: string; // Kept for compat, will be used as accent
    unit?: string;
    icon?: React.ReactNode;
    minDomain?: number;
    maxDomain?: number;
    showGradient?: boolean;
    referenceValue?: number;
    referenceLabel?: string;
}

export function GlowLineChart({
    title,
    description,
    data,
    color,
    glowColor,
    unit = "",
    icon,
    minDomain,
    maxDomain,
    showGradient = true,
    referenceValue,
    referenceLabel
}: GlowLineChartProps) {
    // Filter out zero values for domain calculation
    const validData = data.filter(d => d.value > 0);
    const minVal = validData.length > 0 ? Math.min(...validData.map(d => d.value)) : 0;
    const maxVal = validData.length > 0 ? Math.max(...validData.map(d => d.value)) : 100;

    const calculatedMin = minDomain !== undefined ? minDomain : Math.floor(minVal - (maxVal - minVal) * 0.1);
    const calculatedMax = maxDomain !== undefined ? maxDomain : Math.ceil(maxVal + (maxVal - minVal) * 0.1);

    return (
        <Card className="h-full bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-none overflow-hidden relative transition-all hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
            <CardHeader className="pb-2 border-b-4 border-black bg-zinc-50">
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
                    {/* Live value display */}
                    <div className="text-3xl font-black font-mono tracking-tighter px-3 py-1 bg-black text-white">
                        {data[data.length - 1]?.value.toFixed(1) || "--"}{unit}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="h-[220px] w-full pt-4 relative">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                            minTickGap={50}
                            tick={{ fill: '#000000', fontWeight: 'bold', fontFamily: 'monospace' }}
                            tickFormatter={(val) => smartFormatEst(val)}
                        />

                        <YAxis
                            stroke="#000000"
                            fontSize={10}
                            tickLine={true}
                            tickSize={5}
                            axisLine={true}
                            width={35}
                            domain={[calculatedMin, calculatedMax]}
                            tick={{ fill: '#000000', fontWeight: 'bold', fontFamily: 'monospace' }}
                            tickFormatter={(val) => `${val}${unit}`}
                        />

                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#ffffff',
                                borderColor: '#000000',
                                borderWidth: 3,
                                color: '#000000',
                                borderRadius: '0px',
                                boxShadow: '4px 4px 0px 0px #000000',
                                padding: '8px 12px'
                            }}
                            labelStyle={{ color: '#000000', fontSize: 11, fontWeight: 'bold', fontFamily: 'monospace', textTransform: 'uppercase' }}
                            itemStyle={{ color: '#000000', fontWeight: 'bold', fontSize: 14, fontFamily: 'monospace' }}
                            formatter={(value: any) => [`${value?.toFixed(1) || "--"}${unit}`, title]}
                            cursor={{ stroke: '#000000', strokeWidth: 2 }}
                            labelFormatter={(label) => formatToDateEst(label)}
                        />

                        {referenceValue !== undefined && (
                            <ReferenceLine
                                y={referenceValue}
                                stroke="#000000"
                                strokeDasharray="4 4"
                                strokeWidth={2}
                                label={{
                                    value: referenceLabel || `${referenceValue}${unit}`,
                                    fill: '#000000',
                                    fontSize: 10,
                                    fontWeight: 'bold',
                                    position: 'right',
                                    className: 'bg-white px-1' // attempt to provide bg
                                }}
                            />
                        )}

                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#000000"
                            strokeWidth={3}
                            fill={color === "#000000" ? "#e4e4e7" : color} // Fallback to grey if black is passed, or use active color
                            fillOpacity={1}
                            dot={false}
                            activeDot={{
                                r: 6,
                                strokeWidth: 3,
                                fill: "#ffffff",
                                stroke: "#000000"
                            }}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
