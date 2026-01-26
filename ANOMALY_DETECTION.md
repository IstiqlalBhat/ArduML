# ArduML Anomaly Detection System

**Last Updated:** 2026-01-25

---

## Table of Contents

1. [Overview](#overview)
2. [What is Normal Data?](#what-is-normal-data)
3. [What are Anomalies?](#what-are-anomalies)
4. [Detection Methods](#detection-methods)
   - [Method 1: Z-Score Analysis](#method-1-z-score-analysis-statistical-outliers)
   - [Method 2: Rate of Change](#method-2-rate-of-change-sudden-jumps)
   - [Method 3: Isolation Forest](#method-3-isolation-forest-ml-multivariate)
5. [Monitored Sensors](#monitored-sensors)
6. [Configuration Parameters](#configuration-parameters)
7. [Architecture & Data Flow](#architecture--data-flow)
8. [Severity Levels](#severity-levels)
9. [Usage](#usage)

---

## Overview

The ArduML system employs a **hybrid anomaly detection approach** combining:
- **Statistical methods** (Z-Score, Rate of Change)
- **Machine Learning** (Isolation Forest)

This multi-algorithm approach provides robust anomaly detection from multiple perspectives:
- **Univariate**: Detects outliers in individual metrics
- **Multivariate**: Detects unusual combinations of temperature + humidity
- **Temporal**: Detects sudden changes over time

---

## What is Normal Data?

**Normal data** is statistically defined using a **rolling baseline** of the most recent sensor readings:

### Baseline Definition

- **Window Size**: Last **500 sensor readings**
- **Temperature Normal Range**: `μ ± 2σ` (mean ± 2 standard deviations)
- **Humidity Normal Range**: `μ ± 2σ` (mean ± 2 standard deviations)
- **Update Frequency**: Recalculated every **5 minutes** via cron job

### Example

```
Current Statistics:
  Temperature: μ = 24°C, σ = 1.0°C
  Humidity:    μ = 60%, σ = 5.0%

Normal Ranges:
  Temperature: 22°C - 26°C  (24 ± 2×1.0)
  Humidity:    50% - 70%    (60 ± 2×5.0)
```

Any reading outside these ranges is flagged for further analysis.

---

## What are Anomalies?

Anomalies are sensor readings that exhibit one or more of these characteristics:

### 1. Statistical Outliers
Values that deviate significantly from the statistical norm (>3 standard deviations)

**Example**: Temperature jumps to 32°C when normal is 22-26°C

### 2. Sudden Changes
Abrupt jumps between consecutive readings

**Example**: Temperature changes from 24°C → 28°C in 500ms (4°C spike)

### 3. Multivariate Anomalies
Unusual combinations of metrics that individually may seem normal

**Example**:
- Temperature = 26°C (within normal 22-26°C)
- Humidity = 80% (above normal 50-70%)
- Combination is unusual even if temperature is individually normal

---

## Detection Methods

The system uses **three complementary algorithms** to detect anomalies:

---

### Method 1: Z-Score Analysis (Statistical Outliers)

**What it detects**: Individual values that are statistical outliers

**Formula**:
```
z = |value - μ| / σ
```

**Threshold**: `z > 3.0`

**Implementation**:
- **TypeScript/Next.js**: `src/lib/anomalyDetector.ts:111-153`
- **Python**: `scripts/anomaly_detector.py:80-116`
- **Database Function**: `sql/02_anomaly_detection.sql:56-145`

**Severity Mapping**:
```
z > 4.0   → HIGH severity
z > 3.5   → MEDIUM severity
z > 3.0   → LOW severity
```

**Example**:
```javascript
Reading: temperature = 32°C
Mean: μ = 24°C
Std Dev: σ = 1.0°C

Z-Score = |32 - 24| / 1.0 = 8.0
Result: HIGH severity anomaly (8.0 > 4.0)
Message: "Temperature of 32.0°C is 8.0 standard deviations from mean (24.0°C)"
```

---

### Method 2: Rate of Change (Sudden Jumps)

**What it detects**: Abrupt changes between consecutive readings

**Thresholds**:
- **Temperature**: Change > `2.0°C`
- **Humidity**: Change > `5.0%`

**Implementation**:
- **TypeScript/Next.js**: `src/lib/anomalyDetector.ts:156-202`
- **Python**: `scripts/anomaly_detector.py:118-154`
- **Database Function**: `sql/02_anomaly_detection.sql:152-217`

**Severity Mapping**:
```
change > threshold × 2.0   → HIGH severity
change > threshold × 1.5   → MEDIUM severity
change > threshold × 1.0   → LOW severity
```

**Example**:
```javascript
Previous reading: temperature = 24°C
Current reading:  temperature = 28°C
Change: 4°C

Threshold = 2.0°C
Change ratio = 4.0 / 2.0 = 2.0

Result: HIGH severity anomaly (4.0 > 2.0 × 2)
Message: "Temperature changed by 4.0°C (from 24.0°C to 28.0°C) - exceeds threshold of 2.0°C"
```

---

### Method 3: Isolation Forest (ML Multivariate)

**What it detects**: Unusual combinations of temperature and humidity using unsupervised machine learning

**Algorithm**: Isolation Forest (scikit-learn)

**How It Works**:

Isolation Forest is an **unsupervised anomaly detection algorithm** that works by:

1. **Random Tree Construction**: Builds multiple decision trees by randomly selecting:
   - A feature (temperature or humidity)
   - A split value between the min and max of that feature

2. **Path Length Measurement**: Anomalies are isolated in fewer splits than normal points
   - **Normal points**: Require many splits to isolate (longer path)
   - **Anomalous points**: Isolated quickly (shorter path)

3. **Anomaly Score**: Combines path lengths across all trees
   - Shorter average path → Lower score → Anomaly
   - Longer average path → Higher score → Normal

**Why Use Isolation Forest?**

Unlike Z-Score (univariate), Isolation Forest detects **multivariate anomalies**:

```
Scenario 1 (Z-Score catches):
  temp = 32°C, humidity = 60%
  → Temperature is outlier → Z-score detects ✓

Scenario 2 (Only Isolation Forest catches):
  temp = 26°C (within 22-26°C normal range)
  humidity = 80% (above 50-70% normal range)
  → Both individually borderline, but combination is unusual
  → Z-score might miss, but Isolation Forest detects ✓

Scenario 3 (Isolation Forest excels):
  temp = 22°C (low end of normal)
  humidity = 50% (low end of normal)
  → Both at low extremes simultaneously
  → Rare combination pattern → Isolation Forest flags it
```

**Implementation**: `scripts/anomaly_detector.py:156-216`

**Model Configuration**:
```python
from sklearn.ensemble import IsolationForest

model = IsolationForest(
    contamination=0.05,      # Expected 5% anomaly rate
    random_state=42,         # Reproducibility
    n_estimators=100         # Number of trees
)
```

**Data Preparation**:
```python
# Create feature matrix: each row is [temperature, humidity]
X = np.array([
    [r["temperature"], r["humidity"]]
    for r in readings
    if r["temperature"] is not None and r["humidity"] is not None
])

# Example:
# X = [
#   [24.5, 60.2],
#   [24.8, 61.0],
#   [32.1, 65.5],  ← Anomaly (unusual temp + humidity combo)
#   [25.0, 59.8],
#   ...
# ]
```

**Training & Prediction**:
```python
# Fit model and predict in one step
predictions = model.fit_predict(X)  # Returns 1 (normal) or -1 (anomaly)
scores = model.decision_function(X)  # Returns anomaly score

# Example results:
# predictions = [ 1,  1, -1,  1, ...]  ← -1 indicates anomaly
# scores      = [0.1, 0.2, -0.45, 0.15, ...]  ← Lower score = more anomalous
```

**Determining Primary Metric**:
```python
# For multivariate anomalies, identify which metric is more deviant
if pred == -1:  # Anomaly detected
    temp_deviation = abs(temperature - mean_temp) / (std_temp + 1e-6)
    humidity_deviation = abs(humidity - mean_humidity) / (std_humidity + 1e-6)

    # Tag anomaly with the more deviant metric
    primary_metric = "temperature" if temp_deviation > humidity_deviation else "humidity"
```

**Severity Mapping**:
```python
score < -0.3   → HIGH severity    (very isolated point)
score < -0.1   → MEDIUM severity  (moderately isolated)
score >= -0.1  → LOW severity     (slightly isolated)
```

**Example Output**:
```json
{
  "id": 12345,
  "timestamp": "2026-01-25T10:30:00Z",
  "metric": "temperature",
  "value": 26.5,
  "detection_method": "isolation_forest",
  "severity": "medium",
  "deviation": 0.245,
  "message": "Multivariate anomaly detected: temp=26.5°C, humidity=82.1% (anomaly score: -0.245)"
}
```

**Key Advantages**:
- ✅ Detects complex multivariate patterns
- ✅ No assumptions about data distribution (non-parametric)
- ✅ Fast and scalable
- ✅ Catches anomalies missed by univariate methods
- ✅ Unsupervised (no labeled training data needed)

**Limitations**:
- ❌ Requires `scikit-learn` Python library (not in TypeScript runtime)
- ❌ Run as separate script, not real-time
- ❌ Less interpretable than Z-score
- ❌ Sensitive to `contamination` parameter tuning

---

## Monitored Sensors

| Metric | Sensor | Type | Normal Definition | Detection Methods |
|--------|--------|------|-------------------|-------------------|
| **Temperature** | DHT11 | Continuous (Analog) | μ ± 2σ | Z-Score, Rate-of-Change, Isolation Forest |
| **Humidity** | DHT11 | Continuous (Analog) | μ ± 2σ | Z-Score, Rate-of-Change, Isolation Forest |
| **Light** | LDR Module | Binary (0/1) | 0=DARK, 1=BRIGHT | State change tracking only |
| **Motion** | PIR Sensor | Binary (0/1) | 0=NONE, 1=DETECTED | State change tracking only |

**Note**: Light and motion sensors are tracked for state changes but are NOT analyzed for anomalies.

---

## Configuration Parameters

### Global Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| `WINDOW_SIZE` | 500 | Number of readings for baseline statistics |
| `ZSCORE_THRESHOLD` | 3.0 | Minimum Z-score to flag anomaly |
| `TEMP_RATE_THRESHOLD` | 2.0°C | Max normal temperature change |
| `HUMIDITY_RATE_THRESHOLD` | 5.0% | Max normal humidity change |
| `ISOLATION_CONTAMINATION` | 0.05 | Expected proportion of anomalies (5%) |

### Isolation Forest Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `contamination` | 0.05 | Assume 5% of data are anomalies |
| `n_estimators` | 100 | Number of isolation trees |
| `random_state` | 42 | Seed for reproducibility |

### Runtime Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Cache Refresh | 5 minutes | How often stats are recalculated |
| Cron Interval | 5 minutes | Batch detection frequency |
| UI Refresh | 30 seconds | Dashboard poll interval |
| Data Retention | 90 days | Sensor reading retention |
| Anomaly Log Retention | 30 days | Anomaly log retention |

---

## Architecture & Data Flow

### Real-Time Detection (TypeScript/Next.js)

```
ESP32 Device (every 500ms)
    ↓
POST /api/ingest
    ├─ Insert to Supabase (sensor_readings table)
    ├─ checkRealtimeAnomaly()
    │   ├─ Z-Score analysis
    │   └─ Rate-of-Change analysis
    └─ Log to anomaly_logs table (if detected)
```

**Files**:
- Ingest endpoint: `src/app/api/ingest/route.ts`
- Detection logic: `src/lib/anomalyDetector.ts`

---

### Batch Detection (Python ML Script)

```
Cron/Manual Trigger
    ↓
python scripts/anomaly_detector.py
    ├─ Fetch last 500 readings from Supabase
    ├─ Run Z-Score detection
    ├─ Run Rate-of-Change detection
    ├─ Run Isolation Forest (ML)
    ├─ Deduplicate anomalies
    └─ Export to anomalies_output.json
```

**Output**: `scripts/anomalies_output.json`

---

### Periodic Stats Update (Vercel Cron)

```
Every 5 minutes
    ↓
GET /api/cron
    ├─ refreshStatsCache()
    │   └─ Recalculate μ, σ from last 500 readings
    ├─ Run high-severity anomaly detection
    └─ Log to anomaly_logs (high severity only)
```

**File**: `src/app/api/cron/route.ts`

---

### Frontend Dashboard

```
Dashboard UI (auto-refresh every 30s)
    ↓
GET /api/anomalies
    ├─ Fetch logged anomalies
    ├─ Calculate summary stats
    └─ Return to AnomalyAlert component
```

**Components**:
- `src/components/dashboard/AnomalyAlert.tsx`
- `src/app/api/anomalies/route.ts`

---

## Severity Levels

All detection methods assign severity based on deviation magnitude:

| Severity | Color | Z-Score | Rate Change | Isolation Score |
|----------|-------|---------|-------------|-----------------|
| **HIGH** | 🔴 Red | > 4.0 | > 2× threshold | < -0.3 |
| **MEDIUM** | 🟡 Yellow | > 3.5 | > 1.5× threshold | < -0.1 |
| **LOW** | 🟢 Green | > 3.0 | > 1× threshold | ≥ -0.1 |

---

## Usage

### Real-Time Monitoring (Automatic)

The Next.js app automatically detects anomalies on every sensor reading via `/api/ingest`.

**View anomalies**:
```bash
npm run dev
# Open http://localhost:3000
# Check the "Anomaly Alert" section
```

**API endpoint**:
```bash
curl http://localhost:3000/api/anomalies?limit=20
```

---

### Python ML Analysis (On-Demand)

Run the comprehensive ML analysis script:

```bash
cd scripts
pip install numpy supabase scikit-learn  # Install dependencies
python anomaly_detector.py
```

**Output**:
```
==============================================================
ArduML Anomaly Detection
==============================================================

[1/3] Fetching last 500 sensor readings...
      Fetched 500 readings

[2/3] Running anomaly detection algorithms...
      - Z-Score analysis (statistical outliers)
      - Rate of change detection (sudden spikes)
      - Isolation Forest (ML multivariate)

[3/3] Analysis complete!

------------------------------------------------------------
SUMMARY
------------------------------------------------------------
Data points analyzed: 500
Time range: 2026-01-25T08:30:00Z to 2026-01-25T10:30:00Z

Temperature stats:
  Mean: 24.3°C
  Std Dev: 1.12
  Range: 22.1 - 28.5°C

Humidity stats:
  Mean: 61.2%
  Std Dev: 4.85
  Range: 52.0 - 75.3%

============================================================
ANOMALIES DETECTED: 12
============================================================

By Severity:
  🔴 High:   3
  🟡 Medium: 5
  🟢 Low:    4

By Metric:
  🌡️  Temperature: 7
  💧 Humidity:    5

By Detection Method:
  📊 Z-Score:          4
  📈 Rate of Change:   5
  🤖 Isolation Forest: 3

============================================================
TOP ANOMALIES
============================================================

1. 🔴 [HIGH] Temperature
   Time: 2026-01-25T10:15:23Z
   Value: 28.5°C (expected: 22.1 - 26.5)
   Method: zscore
   Message: Temperature of 28.5°C is 4.2 standard deviations from mean (24.3°C)

...

📁 Full report saved to: scripts/anomalies_output.json
```

---

## File Reference

### TypeScript/Next.js (Real-Time)
- `src/lib/anomalyDetector.ts` - Core detection logic
- `src/app/api/ingest/route.ts` - Real-time detection on data ingest
- `src/app/api/anomalies/route.ts` - Anomaly retrieval API
- `src/app/api/cron/route.ts` - Periodic stats refresh
- `src/components/dashboard/AnomalyAlert.tsx` - UI component

### Python (ML Analysis)
- `scripts/anomaly_detector.py` - Comprehensive ML detection
- `scripts/anomalies_output.json` - Generated report

### Database
- `sql/01_setup_schema.sql` - Database schema
- `sql/02_anomaly_detection.sql` - SQL detection functions
- `sql/03_anomaly_logs.sql` - Anomaly logging schema

---

## Summary

The ArduML anomaly detection system combines:

✅ **Statistical Methods** (Z-Score, Rate-of-Change) for fast, interpretable detection
✅ **Machine Learning** (Isolation Forest) for multivariate pattern recognition
✅ **Real-Time Processing** (TypeScript) for immediate alerts
✅ **Batch Analysis** (Python) for comprehensive ML-powered insights
✅ **Configurable Thresholds** for environment-specific tuning
✅ **Multi-Severity Classification** for prioritized responses

**Key Strength**: The hybrid approach catches anomalies from multiple perspectives—statistical outliers, sudden changes, AND unusual multivariate combinations.

---

**Generated**: 2026-01-25
**System**: ArduML (Arduino + Machine Learning)
**Framework**: Next.js 16.1.4 + Python 3.x + scikit-learn
