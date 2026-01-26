"""
Anomaly Detection for ArduML Sensor Data

This module uses multiple ML techniques to detect anomalies in temperature and humidity:
1. Isolation Forest - Unsupervised ML for multivariate anomaly detection
2. Z-Score - Statistical outlier detection
3. Rate of Change - Detects sudden spikes/drops

Run this script periodically (e.g., via cron) or on-demand.
"""

import os
import json
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from typing import Optional
import numpy as np
from supabase import create_client, Client

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xlnsnrygqgnqyhuvuxgl.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsbnNucnlncWducXlodXZ1eGdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwNjM3NjUsImV4cCI6MjA4NDYzOTc2NX0.CPsQXu63iuXvDmsIVyqVlkeK9O6Psu-Q4jGQJ3-xMxs")

# Anomaly thresholds
ZSCORE_THRESHOLD = 3.0  # Standard deviations from mean
TEMP_RATE_THRESHOLD = 2.0  # Max degrees change between readings
HUMIDITY_RATE_THRESHOLD = 5.0  # Max % humidity change between readings
ISOLATION_CONTAMINATION = 0.05  # Expected proportion of anomalies


@dataclass
class Anomaly:
    """Represents a detected anomaly."""
    id: int
    timestamp: str
    metric: str  # 'temperature' or 'humidity'
    value: float
    expected_range: tuple[float, float]
    deviation: float
    detection_method: str
    severity: str  # 'low', 'medium', 'high'
    message: str


class AnomalyDetector:
    """ML-based anomaly detection for sensor data."""

    def __init__(self):
        self.supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        self.data = []
        self.anomalies: list[Anomaly] = []

    def fetch_data(self, limit: int = 500) -> list[dict]:
        """Fetch the last N sensor readings from Supabase."""
        response = self.supabase.table("sensor_readings") \
            .select("id, temperature, humidity, created_at") \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()

        self.data = response.data[::-1]  # Reverse to chronological order
        return self.data

    def _calculate_stats(self, values: list[float]) -> dict:
        """Calculate statistical measures for a list of values."""
        arr = np.array([v for v in values if v is not None])
        if len(arr) == 0:
            return {"mean": 0, "std": 0, "q1": 0, "q3": 0, "iqr": 0}

        return {
            "mean": float(np.mean(arr)),
            "std": float(np.std(arr)),
            "q1": float(np.percentile(arr, 25)),
            "q3": float(np.percentile(arr, 75)),
            "iqr": float(np.percentile(arr, 75) - np.percentile(arr, 25)),
            "min": float(np.min(arr)),
            "max": float(np.max(arr))
        }

    def detect_zscore_anomalies(self, metric: str) -> list[Anomaly]:
        """Detect anomalies using Z-score method."""
        anomalies = []
        values = [r[metric] for r in self.data if r[metric] is not None]

        if len(values) < 10:
            return anomalies

        stats = self._calculate_stats(values)
        if stats["std"] == 0:
            return anomalies

        for reading in self.data:
            value = reading[metric]
            if value is None:
                continue

            zscore = abs(value - stats["mean"]) / stats["std"]

            if zscore > ZSCORE_THRESHOLD:
                severity = "high" if zscore > 4 else "medium" if zscore > 3.5 else "low"
                anomalies.append(Anomaly(
                    id=reading["id"],
                    timestamp=reading["created_at"],
                    metric=metric,
                    value=value,
                    expected_range=(
                        round(stats["mean"] - 2 * stats["std"], 2),
                        round(stats["mean"] + 2 * stats["std"], 2)
                    ),
                    deviation=round(zscore, 2),
                    detection_method="zscore",
                    severity=severity,
                    message=f"{metric.capitalize()} of {value} is {zscore:.1f} standard deviations from mean ({stats['mean']:.1f})"
                ))

        return anomalies

    def detect_rate_anomalies(self, metric: str) -> list[Anomaly]:
        """Detect anomalies based on rate of change between consecutive readings."""
        anomalies = []
        threshold = TEMP_RATE_THRESHOLD if metric == "temperature" else HUMIDITY_RATE_THRESHOLD

        prev_value = None
        prev_reading = None

        for reading in self.data:
            value = reading[metric]
            if value is None:
                continue

            if prev_value is not None:
                change = abs(value - prev_value)

                if change > threshold:
                    severity = "high" if change > threshold * 2 else "medium" if change > threshold * 1.5 else "low"
                    anomalies.append(Anomaly(
                        id=reading["id"],
                        timestamp=reading["created_at"],
                        metric=metric,
                        value=value,
                        expected_range=(
                            round(prev_value - threshold, 2),
                            round(prev_value + threshold, 2)
                        ),
                        deviation=round(change, 2),
                        detection_method="rate_of_change",
                        severity=severity,
                        message=f"{metric.capitalize()} changed by {change:.1f} (from {prev_value:.1f} to {value:.1f}) - exceeds threshold of {threshold}"
                    ))

            prev_value = value
            prev_reading = reading

        return anomalies

    def detect_isolation_forest_anomalies(self) -> list[Anomaly]:
        """Use Isolation Forest for multivariate anomaly detection."""
        try:
            from sklearn.ensemble import IsolationForest
        except ImportError:
            print("Warning: scikit-learn not installed. Skipping Isolation Forest detection.")
            return []

        anomalies = []

        # Prepare data matrix
        valid_readings = [
            r for r in self.data
            if r["temperature"] is not None and r["humidity"] is not None
        ]

        if len(valid_readings) < 20:
            return anomalies

        X = np.array([
            [r["temperature"], r["humidity"]]
            for r in valid_readings
        ])

        # Train Isolation Forest
        model = IsolationForest(
            contamination=ISOLATION_CONTAMINATION,
            random_state=42,
            n_estimators=100
        )
        predictions = model.fit_predict(X)
        scores = model.decision_function(X)

        # Find anomalies (prediction = -1)
        for i, (pred, score, reading) in enumerate(zip(predictions, scores, valid_readings)):
            if pred == -1:
                # Determine which metric is more anomalous
                temp_dev = abs(reading["temperature"] - np.mean(X[:, 0])) / (np.std(X[:, 0]) + 1e-6)
                humid_dev = abs(reading["humidity"] - np.mean(X[:, 1])) / (np.std(X[:, 1]) + 1e-6)

                primary_metric = "temperature" if temp_dev > humid_dev else "humidity"
                value = reading[primary_metric]

                severity = "high" if score < -0.3 else "medium" if score < -0.1 else "low"

                anomalies.append(Anomaly(
                    id=reading["id"],
                    timestamp=reading["created_at"],
                    metric=primary_metric,
                    value=value,
                    expected_range=(
                        round(np.mean(X[:, 0 if primary_metric == "temperature" else 1]) - 2 * np.std(X[:, 0 if primary_metric == "temperature" else 1]), 2),
                        round(np.mean(X[:, 0 if primary_metric == "temperature" else 1]) + 2 * np.std(X[:, 0 if primary_metric == "temperature" else 1]), 2)
                    ),
                    deviation=round(abs(score), 3),
                    detection_method="isolation_forest",
                    severity=severity,
                    message=f"Multivariate anomaly detected: temp={reading['temperature']:.1f}, humidity={reading['humidity']:.1f} (anomaly score: {score:.3f})"
                ))

        return anomalies

    def detect_all_anomalies(self) -> list[Anomaly]:
        """Run all anomaly detection methods and combine results."""
        all_anomalies = []

        # Z-score detection
        all_anomalies.extend(self.detect_zscore_anomalies("temperature"))
        all_anomalies.extend(self.detect_zscore_anomalies("humidity"))

        # Rate of change detection
        all_anomalies.extend(self.detect_rate_anomalies("temperature"))
        all_anomalies.extend(self.detect_rate_anomalies("humidity"))

        # Isolation Forest (multivariate)
        all_anomalies.extend(self.detect_isolation_forest_anomalies())

        # Deduplicate by id and method
        seen = set()
        unique_anomalies = []
        for a in all_anomalies:
            key = (a.id, a.detection_method)
            if key not in seen:
                seen.add(key)
                unique_anomalies.append(a)

        # Sort by timestamp (newest first)
        unique_anomalies.sort(key=lambda x: x.timestamp, reverse=True)

        self.anomalies = unique_anomalies
        return unique_anomalies

    def get_summary(self) -> dict:
        """Get a summary of detected anomalies."""
        if not self.data:
            return {"error": "No data loaded"}

        temp_stats = self._calculate_stats([r["temperature"] for r in self.data])
        humidity_stats = self._calculate_stats([r["humidity"] for r in self.data])

        return {
            "data_points_analyzed": len(self.data),
            "time_range": {
                "start": self.data[0]["created_at"] if self.data else None,
                "end": self.data[-1]["created_at"] if self.data else None
            },
            "statistics": {
                "temperature": temp_stats,
                "humidity": humidity_stats
            },
            "anomalies": {
                "total": len(self.anomalies),
                "by_severity": {
                    "high": len([a for a in self.anomalies if a.severity == "high"]),
                    "medium": len([a for a in self.anomalies if a.severity == "medium"]),
                    "low": len([a for a in self.anomalies if a.severity == "low"])
                },
                "by_metric": {
                    "temperature": len([a for a in self.anomalies if a.metric == "temperature"]),
                    "humidity": len([a for a in self.anomalies if a.metric == "humidity"])
                },
                "by_method": {
                    "zscore": len([a for a in self.anomalies if a.detection_method == "zscore"]),
                    "rate_of_change": len([a for a in self.anomalies if a.detection_method == "rate_of_change"]),
                    "isolation_forest": len([a for a in self.anomalies if a.detection_method == "isolation_forest"])
                }
            },
            "anomaly_details": [asdict(a) for a in self.anomalies[:20]]  # Top 20 anomalies
        }

    def to_json(self, filepath: Optional[str] = None) -> str:
        """Export anomalies to JSON."""
        output = {
            "generated_at": datetime.utcnow().isoformat(),
            "summary": self.get_summary()
        }

        json_str = json.dumps(output, indent=2, default=str)

        if filepath:
            with open(filepath, "w") as f:
                f.write(json_str)

        return json_str


def main():
    """Main entry point for anomaly detection."""
    print("=" * 60)
    print("ArduML Anomaly Detection")
    print("=" * 60)

    detector = AnomalyDetector()

    print("\n[1/3] Fetching last 500 sensor readings...")
    data = detector.fetch_data(limit=500)
    print(f"      Fetched {len(data)} readings")

    if len(data) == 0:
        print("\nNo data found. Make sure your sensors are sending data.")
        return

    print("\n[2/3] Running anomaly detection algorithms...")
    print("      - Z-Score analysis (statistical outliers)")
    print("      - Rate of change detection (sudden spikes)")
    print("      - Isolation Forest (ML multivariate)")

    anomalies = detector.detect_all_anomalies()

    print(f"\n[3/3] Analysis complete!")

    # Print summary
    summary = detector.get_summary()
    print("\n" + "-" * 60)
    print("SUMMARY")
    print("-" * 60)
    print(f"Data points analyzed: {summary['data_points_analyzed']}")
    print(f"Time range: {summary['time_range']['start']} to {summary['time_range']['end']}")

    print(f"\nTemperature stats:")
    print(f"  Mean: {summary['statistics']['temperature']['mean']:.1f}°C")
    print(f"  Std Dev: {summary['statistics']['temperature']['std']:.2f}")
    print(f"  Range: {summary['statistics']['temperature']['min']:.1f} - {summary['statistics']['temperature']['max']:.1f}°C")

    print(f"\nHumidity stats:")
    print(f"  Mean: {summary['statistics']['humidity']['mean']:.1f}%")
    print(f"  Std Dev: {summary['statistics']['humidity']['std']:.2f}")
    print(f"  Range: {summary['statistics']['humidity']['min']:.1f} - {summary['statistics']['humidity']['max']:.1f}%")

    print(f"\n{'=' * 60}")
    print(f"ANOMALIES DETECTED: {summary['anomalies']['total']}")
    print(f"{'=' * 60}")

    if summary['anomalies']['total'] > 0:
        print(f"\nBy Severity:")
        print(f"  🔴 High:   {summary['anomalies']['by_severity']['high']}")
        print(f"  🟡 Medium: {summary['anomalies']['by_severity']['medium']}")
        print(f"  🟢 Low:    {summary['anomalies']['by_severity']['low']}")

        print(f"\nBy Metric:")
        print(f"  🌡️  Temperature: {summary['anomalies']['by_metric']['temperature']}")
        print(f"  💧 Humidity:    {summary['anomalies']['by_metric']['humidity']}")

        print(f"\nBy Detection Method:")
        print(f"  📊 Z-Score:         {summary['anomalies']['by_method']['zscore']}")
        print(f"  📈 Rate of Change:  {summary['anomalies']['by_method']['rate_of_change']}")
        print(f"  🤖 Isolation Forest: {summary['anomalies']['by_method']['isolation_forest']}")

        print(f"\n{'=' * 60}")
        print("TOP ANOMALIES")
        print("=" * 60)

        for i, anomaly in enumerate(summary['anomaly_details'][:10], 1):
            severity_icon = "🔴" if anomaly['severity'] == 'high' else "🟡" if anomaly['severity'] == 'medium' else "🟢"
            print(f"\n{i}. {severity_icon} [{anomaly['severity'].upper()}] {anomaly['metric'].capitalize()}")
            print(f"   Time: {anomaly['timestamp']}")
            print(f"   Value: {anomaly['value']} (expected: {anomaly['expected_range'][0]} - {anomaly['expected_range'][1]})")
            print(f"   Method: {anomaly['detection_method']}")
            print(f"   Message: {anomaly['message']}")
    else:
        print("\n✅ No anomalies detected! All readings are within normal ranges.")

    # Save to JSON
    output_path = os.path.join(os.path.dirname(__file__), "anomalies_output.json")
    detector.to_json(output_path)
    print(f"\n📁 Full report saved to: {output_path}")


if __name__ == "__main__":
    main()
