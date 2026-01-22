"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowDown, ArrowUp, Activity } from "lucide-react"

interface StatCardProps {
    title: string
    value: string
    trend?: {
        value: number
        isPositive: boolean
    }
    icon?: React.ReactNode
    color?: "cyan" | "purple" | "green" | "yellow"
}

export function StatCard({ title, value, trend, icon, color = "cyan" }: StatCardProps) {
    const colorClasses = {
        cyan: "text-cyan-400",
        purple: "text-purple-400",
        green: "text-emerald-400",
        yellow: "text-yellow-400"
    }

    return (
        <Card className="glass-card hover:bg-white/5 transition-all duration-300 border-t-0 border-l-0 border-r-0 border-b-[1px] border-b-white/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    {title}
                </CardTitle>
                {icon || <Activity className={`h-4 w-4 ${colorClasses[color]}`} />}
            </CardHeader>
            <CardContent>
                <div className="flex items-baseline space-x-2">
                    <div className={`text-3xl font-bold tracking-tight ${colorClasses[color]} drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]`}>
                        {value}
                    </div>
                    {trend && (
                        <div className={`flex items-center text-xs ${trend.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {trend.isPositive ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
                            {Math.abs(trend.value)}%
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
