"use client"

import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
}

export function CandleStickChart({ title, data, color = "#00E396", height = 350 }: CandleStickChartProps) {
    const series = [{
        data: data
    }]

    const options: ApexCharts.ApexOptions = {
        chart: {
            type: 'candlestick',
            height: 350,
            background: 'transparent',
            toolbar: {
                show: true,
                tools: {
                    download: true,
                    selection: true,
                    zoom: true,
                    zoomin: true,
                    zoomout: true,
                    pan: true,
                },
            },
            animations: {
                enabled: false // Disable animation for smoother real-time updates
            }
        },
        title: {
            text: title,
            align: 'left',
            style: {
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#ffffff'
            }
        },
        xaxis: {
            type: 'datetime',
            tooltip: {
                enabled: true
            },
            axisBorder: {
                show: false
            },
            axisTicks: {
                show: false
            },
            labels: {
                style: {
                    colors: '#a1a1aa'
                }
            }
        },
        yaxis: {
            tooltip: {
                enabled: true
            },
            labels: {
                style: {
                    colors: '#a1a1aa'
                }
            }
        },
        grid: {
            borderColor: '#333',
            strokeDashArray: 3,
        },
        plotOptions: {
            candlestick: {
                colors: {
                    upward: '#22c55e', // Green forUp
                    downward: '#ef4444' // Red for Down
                },
                wick: {
                    useFillColor: true
                }
            }
        },
        theme: {
            mode: 'dark',
            palette: 'palette1'
        },
        tooltip: {
            theme: 'dark',
            style: {
                fontSize: '12px'
            }
        }
    }

    return (
        <Card className="h-full bg-zinc-950 border-zinc-800">
            <CardContent className="p-4 h-full">
                {typeof window !== 'undefined' && (
                    <Chart options={options} series={series} type="candlestick" height="100%" />
                )}
            </CardContent>
        </Card>
    )
}
