"use client"

import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatToDateEst } from "@/lib/dateUtils"
export interface OhlcDataPoint {
    x: any;
    y: [number, number, number, number];
}

// Dynamically import ApexCharts to avoid SSR issues
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false })

interface CandleStickChartProps {
    title: string
    data: OhlcDataPoint[]
    color?: string
    height?: number
    liveValue?: number | string
}

export function CandleStickChart({ title, data, color = "#00E396", height = 350, liveValue }: CandleStickChartProps) {
    const series = [{
        data: data
    }]

    const options: ApexCharts.ApexOptions = {
        chart: {
            type: 'candlestick',
            height: 350,
            background: 'transparent',
            toolbar: {
                show: true, // Re-enabled for functionality
                tools: {
                    download: false,
                    selection: true,
                    zoom: true,
                    zoomin: true,
                    zoomout: true,
                    pan: true,
                    reset: true
                },
                autoSelected: 'zoom'
            },
            animations: {
                enabled: false
            },
            zoom: {
                enabled: true
            }
        },
        title: {
            show: false
        } as any,
        xaxis: {
            type: 'datetime',
            tooltip: {
                enabled: false // Cleaner interaction
            },
            axisBorder: {
                show: false
            },
            axisTicks: {
                show: false
            },
            labels: {
                style: {
                    colors: '#71717a', // zinc-500
                    fontFamily: 'inherit',
                    fontSize: '11px'
                },
                formatter: (val: string) => {
                    // ApexCharts passes timestamp
                    return formatToDateEst(val);
                }
            },
            crosshairs: {
                show: true,
                width: 1,
                position: 'back',
                opacity: 0.9,
                stroke: {
                    color: '#3f3f46', // zinc-700
                    width: 1,
                    dashArray: 3,
                },
            }
        },
        yaxis: {
            tooltip: {
                enabled: true
            },
            labels: {
                style: {
                    colors: '#71717a', // zinc-500
                    fontFamily: 'inherit',
                    fontSize: '11px'
                },
                formatter: (val) => val.toFixed(1)
            }
        },
        grid: {
            borderColor: '#27272a', // zinc-800
            strokeDashArray: 0, // Solid lines for premium feel
            position: 'back',
        },
        plotOptions: {
            candlestick: {
                colors: {
                    upward: '#10b981', // Emerald-500 (Vibrant Green)
                    downward: '#ef4444' // Red-500 (Vibrant Red)
                },
                wick: {
                    useFillColor: true
                }
            }
        },
        tooltip: {
            theme: 'dark',
            style: {
                fontSize: '12px',
                fontFamily: 'inherit'
            },
            x: {
                formatter: (val) => formatToDateEst(val)
            }
        }
    }

    return (
        <Card className="h-full bg-zinc-950 border-zinc-800 flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                    {title}
                </CardTitle>
                {liveValue !== undefined && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-emerald-500 animate-pulse uppercase tracking-tighter">Live</span>
                        <span className="text-sm font-mono font-bold text-white leading-none">
                            {typeof liveValue === 'number' ? liveValue.toFixed(1) : liveValue}
                        </span>
                    </div>
                )}
            </CardHeader>
            <CardContent className="p-4 flex-1">
                <Chart options={options} series={series} type="candlestick" height="100%" />
            </CardContent>
        </Card>
    )
}
