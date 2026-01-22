"use client"

import dynamic from "next/dynamic"
import { Card, CardContent } from "@/components/ui/card"
import { useMemo } from "react"
import { formatToDateEst } from "@/lib/dateUtils"

// Dynamically import ApexCharts to avoid SSR issues
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false })

interface BinaryStateChartProps {
    title: string
    data: { x: number; y: number }[]
    activeColor: string // e.g., '#eab308' for light
    activeLabel?: string
    inactiveLabel?: string
    height?: number
}

export function BinaryStateChart({
    title,
    data,
    activeColor,
    activeLabel = "ON",
    inactiveLabel = "OFF",
    height = 350
}: BinaryStateChartProps) {

    const series = [{
        name: title,
        data: data
    }]

    const options: ApexCharts.ApexOptions = {
        chart: {
            type: 'area', // Area chart with step curve looks cool for binary
            height: height,
            background: 'transparent',
            toolbar: {
                show: false,
            },
            animations: {
                enabled: false
            },
            zoom: {
                enabled: true
            }
        },
        stroke: {
            curve: 'stepline',
            width: 2,
            colors: [activeColor]
        },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.4,
                opacityTo: 0.05,
                stops: [0, 100],
                colorStops: [
                    {
                        offset: 0,
                        color: activeColor,
                        opacity: 0.4
                    },
                    {
                        offset: 100,
                        color: activeColor,
                        opacity: 0.05
                    }
                ]
            }
        },
        title: {
            text: title,
            align: 'left',
            style: {
                fontSize: '14px',
                fontWeight: '600',
                color: '#e4e4e7', // zinc-200
                fontFamily: 'inherit'
            }
        },
        xaxis: {
            type: 'datetime',
            tooltip: {
                enabled: false
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
                    return formatToDateEst(val);
                }
            },
            crosshairs: {
                show: true,
                width: 1,
                position: 'back',
                opacity: 0.9,
                stroke: {
                    color: '#3f3f46',
                    width: 1,
                    dashArray: 3,
                },
            }
        },
        yaxis: {
            min: 0,
            max: 1.2, // Fixed range slightly above 1 to show the top clearly
            tickAmount: 1, // Only 0 and 1 (approx)
            labels: {
                style: {
                    colors: '#71717a',
                    fontFamily: 'inherit',
                    fontSize: '11px'
                },
                formatter: (val) => {
                    if (val >= 0.8) return activeLabel;
                    if (val <= 0.2) return inactiveLabel;
                    return "";
                }
            },
        },
        grid: {
            borderColor: '#27272a',
            strokeDashArray: 0,
            position: 'back',
        },
        tooltip: {
            theme: 'dark',
            style: {
                fontSize: '12px',
                fontFamily: 'inherit'
            },
            x: {
                formatter: (val: number) => formatToDateEst(val)
            },
            y: {
                formatter: (val) => val >= 0.5 ? activeLabel : inactiveLabel
            }
        },
        dataLabels: {
            enabled: false
        }
    }

    return (
        <Card className="h-full bg-zinc-950 border-zinc-800">
            <CardContent className="p-4 h-full">
                <Chart options={options} series={series} type="area" height="100%" />
            </CardContent>
        </Card>
    )
}
