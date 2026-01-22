
export interface MetricPoint {
    time: string;
    value: number;
}

export interface SystemMetrics {
    cpu: MetricPoint[];
    memory: MetricPoint[];
    networkIn: MetricPoint[];
    networkOut: MetricPoint[];
    activeUsers: MetricPoint[];
}

const generateInitialData = (count: number, baseValue: number, variance: number): MetricPoint[] => {
    const data: MetricPoint[] = [];
    const now = Date.now();
    for (let i = count; i > 0; i--) {
        data.push({
            time: new Date(now - i * 1000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            value: Math.max(0, Math.min(100, baseValue + (Math.random() - 0.5) * variance))
        });
    }
    return data;
};

export const initialMetrics: SystemMetrics = {
    cpu: generateInitialData(20, 45, 15),
    memory: generateInitialData(20, 60, 5),
    networkIn: generateInitialData(20, 30, 20),
    networkOut: generateInitialData(20, 25, 15),
    activeUsers: generateInitialData(20, 850, 50).map(p => ({ ...p, value: p.value * 10 })) // Scale up for users
};

export const generateNextPoint = (lastValue: number, variance: number): MetricPoint => {
    let newValue = lastValue + (Math.random() - 0.5) * variance;
    // Keep within bounds roughly
    if (newValue < 5) newValue += 5;
    if (newValue > 95) newValue -= 5;

    return {
        time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        value: newValue
    };
};
