# ArduML 🌡️📊

A real-time IoT dashboard that turns sensor data into beautiful, stock-market-style candlestick charts. Built with an ESP32 microcontroller, Next.js, Supabase, and Firebase — because why shouldn't your room temperature look as dramatic as Bitcoin?

![Dashboard Preview](https://img.shields.io/badge/status-live-brightgreen) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## What This Actually Does

This project monitors your environment using four sensors and displays the data in real-time:

- **Temperature** (DHT11) — Track how hot or cold your room is
- **Humidity** (DHT11) — Monitor moisture levels in the air  
- **Light** (LDR module) — Detect if it's bright or dark
- **Motion** (PIR sensor) — Catch movement in the room

The cool part? All this data gets visualized as **OHLC candlestick charts** — the same style traders use for stocks. You can zoom out from 30-second intervals all the way to daily aggregates, watching trends over hours, days, or weeks.

## Architecture Overview

```
┌──────────────────┐       ┌─────────────────┐       ┌──────────────────┐
│   ESP32 + Sensors│──────►│  Firebase RTDB  │──────►│  Next.js Client  │
│   (Every 500ms)  │       │  (Real-time)    │       │  (Live Updates)  │
└──────────────────┘       └─────────────────┘       └──────────────────┘
         │                                                     ▲
         │ (Every 3s)                                          │
         ▼                                                     │
┌──────────────────┐       ┌─────────────────┐                 │
│   Vercel API     │──────►│    Supabase     │─────────────────┘
│   /api/ingest    │       │   (PostgreSQL)  │  (OHLC Candles)
└──────────────────┘       └─────────────────┘
```

**Why two databases?** Speed vs. History.
- **Firebase** handles the "instantaneous" feel — data pushes every 500ms for snappy real-time updates
- **Supabase** stores everything permanently with fancy SQL aggregations for historical charts

## Hardware Setup

### Parts You'll Need
- ESP32 development board
- DHT11 temperature & humidity sensor
- LDR light sensor module (digital output)
- PIR motion sensor (HC-SR501 or similar)
- 128x32 OLED display (SSD1306, I2C)
- Jumper wires & breadboard

### Wiring

| Component | ESP32 Pin |
|-----------|-----------|
| DHT11 Data | GPIO 4 |
| LDR Digital Out | GPIO 34 |
| PIR Output | GPIO 13 |
| OLED SDA | GPIO 21 |
| OLED SCL | GPIO 22 |

The OLED display shows real-time sensor values and connection status locally — handy when you're debugging without a computer nearby.

## Getting Started

### 1. Clone the Repo

```bash
git clone https://github.com/IstiqlalBhat/ArduML.git
cd ArduML
```

### 2. Set Up the Web Dashboard

```bash
npm install
```

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
```

### 3. Set Up Supabase Database

Run the SQL schema in your Supabase SQL editor:

```sql
-- Located in: sql/01_setup_schema.sql
-- This creates the sensor_readings table with:
-- - Optimized indexes for million-record performance
-- - OHLC candlestick aggregation functions
-- - Materialized views for fast dashboard loads
-- - Data retention policies
```

The schema includes a `get_candles()` function that does all the OHLC math server-side — way faster than doing it in JavaScript.

### 4. Flash the Arduino

1. Open `arduino/arduino.ino` in the Arduino IDE
2. Copy `arduino/secrets.h.example` to `arduino/secrets.h`
3. Fill in your credentials:

```cpp
#define WIFI_SSID "your_wifi_network"
#define WIFI_PASSWORD "your_wifi_password"
#define API_URL "https://your-app.vercel.app/api/ingest"
#define FIREBASE_HOST "https://your-project.firebaseio.com/"
#define FIREBASE_AUTH "your_firebase_database_secret"
```

4. Install required libraries via Arduino Library Manager:
   - Adafruit GFX Library
   - Adafruit SSD1306
   - DHT sensor library
   - WiFi (built-in for ESP32)
   - HTTPClient (built-in for ESP32)

5. Select your ESP32 board and upload

### 5. Deploy to Vercel

```bash
vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

### 6. Run Locally (for development)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the dashboard with live sensor cards and candlestick charts.

## Features

### Real-Time Live Cards
Four cards at the top show instant sensor readings via Firebase, updating every 500ms. Motion detection triggers immediately — no waiting around.

### Candlestick Charts
Temperature and humidity data rendered as proper OHLC candles:
- **Green candles** = value went up during that period
- **Red candles** = value went down
- **Wicks** show high/low within each time bucket

### Time Range Selector
Switch between intervals to see different perspectives:
- **30s** — Last hour, granular view
- **1m** — Last 6 hours
- **5m** — Last 24 hours  
- **15m** — Last 3 days
- **1h** — Last week
- **4h** — Last month
- **1d** — Last 3 months

### Heatmap Visualization
A GitHub-style contribution graph but for sensor intensity. See patterns in light and motion activity across time.

### Anomaly Detection 🚨

The system uses a **hybrid approach** to detect anomalies in real-time and provide deeper insights:

1.  **Real-Time Detection (Next.js)**:
    -   Runs on every ingest request.
    -   Uses **Z-Score Analysis** to detect statistical outliers (e.g., temp > 3 std devs from mean).
    -   Uses **Rate of Change** checks to catch sudden spikes or drops.
    -   Includes smart filtering (ignores zeros, minimum std dev) to prevent false positives.

2.  **Machine Learning Analysis (Python)**:
    -   Runs periodically (manual/cron).
    -   Uses **Isolation Forest** (scikit-learn) to detect complex **multivariate anomalies** (e.g., unusual temp+humidity combinations).
    -   Generates detailed reports for deeper analysis.

*See [ANOMALY_DETECTION.md](ANOMALY_DETECTION.md) for full details on algorithms and configuration.*

## Project Structure

```
ArduML/
├── arduino/
│   ├── arduino.ino          # ESP32 firmware
│   ├── secrets.h            # Your credentials (git-ignored)
│   └── secrets.h.example    # Template for secrets
├── sql/
│   ├── 00_reset_db.sql      # Clean slate script
│   ├── 01_setup_schema.sql  # Full optimized schema
│   └── 99_heatmap_migration.sql
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── candles/     # OHLC data endpoint
│   │   │   ├── events/      # State change events
│   │   │   └── ingest/      # ESP32 posts data here
│   │   ├── page.tsx         # Main dashboard
│   │   └── globals.css      # Styling
│   ├── components/
│   │   ├── charts/          # Candlestick & binary charts
│   │   ├── dashboard/       # Live sensor cards
│   │   └── ui/              # Reusable components
│   ├── hooks/
│   │   └── useFirebaseSensor.ts  # Real-time Firebase hook
│   └── lib/
│       ├── supabase.ts      # Supabase client
│       └── firebase.ts      # Firebase client
└── package.json
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Hardware | ESP32, DHT11, LDR, PIR, SSD1306 OLED |
| Firmware | Arduino/C++ |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS, Framer Motion |
| Charts | ApexCharts (candlesticks), Recharts |
| Real-time DB | Firebase Realtime Database |
| Historical DB | Supabase (PostgreSQL) |
| Hosting | Vercel |

## API Reference

### POST /api/ingest
Called by the ESP32 to store sensor readings.

```json
{
  "temperature": 24.5,
  "humidity": 65.3,
  "light": 1,
  "motion": 0
}
```

### GET /api/candles?range={interval}
Returns OHLC candlestick data for all metrics.

**Range options:** `30s`, `1m`, `5m`, `15m`, `1h`, `4h`, `1d`

```json
{
  "temperature": [{ "x": 1706000000000, "y": [24.0, 25.5, 23.8, 25.2] }],
  "humidity": [...],
  "light": [...],
  "motion": [...]
}
```

### GET /api/events
Returns only timestamps where light or motion state changed — efficient for event-driven visualizations.

## Database Performance

The SQL schema is built for scale. A few highlights:

- **BRIN indexes** for time-series data (super compact)
- **Covering indexes** enable index-only scans for heatmap queries
- **Materialized views** pre-aggregate hourly stats (100x faster dashboard loads)
- **Single-scan OHLC** using `FILTER` clauses (4x faster than UNION ALL)

You can realistically store millions of readings and still get sub-100ms query times.

## Future Ideas

Some things I'm thinking about adding:

- [ ] ML predictions for temperature/humidity trends
- [ ] Alerts when values go outside normal ranges
- [ ] Multiple room support with device identification  
- [ ] Historical data export (CSV/JSON)
- [ ] Mobile app with push notifications

## Troubleshooting

**ESP32 not connecting to WiFi?**
- Double-check your SSID and password in `secrets.h`
- Make sure you're on 2.4GHz (ESP32 doesn't support 5GHz)

**OLED not displaying?**
- Check I2C connections (SDA → GPIO 21, SCL → GPIO 22)
- Verify the display address is `0x3C`

**Charts showing no data?**
- Confirm your ESP32 is successfully POSTing to `/api/ingest`
- Check browser console for API errors
- Verify Supabase credentials in `.env.local`

**Firebase not updating in real-time?**
- Check Firebase database rules allow read/write
- Verify the database URL matches your secrets

## Contributing

Found a bug? Want to add a feature? PRs are welcome. Just try to keep the code reasonably clean and add comments where things get weird.

## License

MIT — do whatever you want with it.

---

Built with ☕ and a refusal to look at boring sensor data.
