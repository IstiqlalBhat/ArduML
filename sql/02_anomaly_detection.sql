-- ============================================================================
-- ANOMALY DETECTION FUNCTIONS FOR SENSOR DATA
-- ============================================================================
-- Provides SQL-based anomaly detection for temperature and humidity readings
-- Uses statistical methods: Z-score and rate of change detection
-- ============================================================================

-- ============================================================================
-- 1. GET SENSOR STATISTICS FUNCTION
-- ============================================================================
-- Returns statistical measures for a given time window

CREATE OR REPLACE FUNCTION get_sensor_stats(time_range interval DEFAULT interval '1 hour')
RETURNS TABLE (
    metric TEXT,
    mean_value NUMERIC,
    std_dev NUMERIC,
    min_value NUMERIC,
    max_value NUMERIC,
    q1 NUMERIC,
    q3 NUMERIC,
    reading_count BIGINT
) LANGUAGE sql STABLE AS $$
    SELECT
        'temperature'::TEXT as metric,
        ROUND(AVG(temperature), 2) as mean_value,
        ROUND(STDDEV(temperature), 2) as std_dev,
        MIN(temperature) as min_value,
        MAX(temperature) as max_value,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY temperature), 2) as q1,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY temperature), 2) as q3,
        COUNT(*) as reading_count
    FROM sensor_readings
    WHERE created_at > (NOW() - time_range)
      AND temperature IS NOT NULL
    UNION ALL
    SELECT
        'humidity'::TEXT as metric,
        ROUND(AVG(humidity), 2) as mean_value,
        ROUND(STDDEV(humidity), 2) as std_dev,
        MIN(humidity) as min_value,
        MAX(humidity) as max_value,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY humidity), 2) as q1,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY humidity), 2) as q3,
        COUNT(*) as reading_count
    FROM sensor_readings
    WHERE created_at > (NOW() - time_range)
      AND humidity IS NOT NULL;
$$;

-- ============================================================================
-- 2. DETECT Z-SCORE ANOMALIES FUNCTION
-- ============================================================================
-- Returns readings that are statistical outliers (> threshold std devs from mean)

CREATE OR REPLACE FUNCTION detect_zscore_anomalies(
    data_limit INT DEFAULT 500,
    zscore_threshold NUMERIC DEFAULT 3.0
)
RETURNS TABLE (
    id BIGINT,
    created_at TIMESTAMPTZ,
    metric TEXT,
    value NUMERIC,
    zscore NUMERIC,
    mean_value NUMERIC,
    std_dev NUMERIC,
    severity TEXT
) LANGUAGE plpgsql STABLE AS $$
DECLARE
    temp_mean NUMERIC;
    temp_std NUMERIC;
    humid_mean NUMERIC;
    humid_std NUMERIC;
BEGIN
    -- Calculate statistics for the data window
    SELECT AVG(temperature), STDDEV(temperature)
    INTO temp_mean, temp_std
    FROM (
        SELECT temperature
        FROM sensor_readings
        WHERE temperature IS NOT NULL
        ORDER BY created_at DESC
        LIMIT data_limit
    ) t;

    SELECT AVG(humidity), STDDEV(humidity)
    INTO humid_mean, humid_std
    FROM (
        SELECT humidity
        FROM sensor_readings
        WHERE humidity IS NOT NULL
        ORDER BY created_at DESC
        LIMIT data_limit
    ) h;

    -- Return temperature anomalies
    RETURN QUERY
    SELECT
        sr.id,
        sr.created_at,
        'temperature'::TEXT as metric,
        sr.temperature as value,
        ROUND(ABS(sr.temperature - temp_mean) / NULLIF(temp_std, 0), 2) as zscore,
        temp_mean as mean_value,
        temp_std as std_dev,
        CASE
            WHEN ABS(sr.temperature - temp_mean) / NULLIF(temp_std, 0) > 4 THEN 'high'
            WHEN ABS(sr.temperature - temp_mean) / NULLIF(temp_std, 0) > 3.5 THEN 'medium'
            ELSE 'low'
        END as severity
    FROM (
        SELECT * FROM sensor_readings
        WHERE temperature IS NOT NULL
        ORDER BY created_at DESC
        LIMIT data_limit
    ) sr
    WHERE temp_std > 0
      AND ABS(sr.temperature - temp_mean) / temp_std > zscore_threshold;

    -- Return humidity anomalies
    RETURN QUERY
    SELECT
        sr.id,
        sr.created_at,
        'humidity'::TEXT as metric,
        sr.humidity as value,
        ROUND(ABS(sr.humidity - humid_mean) / NULLIF(humid_std, 0), 2) as zscore,
        humid_mean as mean_value,
        humid_std as std_dev,
        CASE
            WHEN ABS(sr.humidity - humid_mean) / NULLIF(humid_std, 0) > 4 THEN 'high'
            WHEN ABS(sr.humidity - humid_mean) / NULLIF(humid_std, 0) > 3.5 THEN 'medium'
            ELSE 'low'
        END as severity
    FROM (
        SELECT * FROM sensor_readings
        WHERE humidity IS NOT NULL
        ORDER BY created_at DESC
        LIMIT data_limit
    ) sr
    WHERE humid_std > 0
      AND ABS(sr.humidity - humid_mean) / humid_std > zscore_threshold;
END;
$$;

-- ============================================================================
-- 3. DETECT RATE OF CHANGE ANOMALIES FUNCTION
-- ============================================================================
-- Returns readings with sudden jumps compared to previous reading

CREATE OR REPLACE FUNCTION detect_rate_anomalies(
    data_limit INT DEFAULT 500,
    temp_threshold NUMERIC DEFAULT 2.0,
    humidity_threshold NUMERIC DEFAULT 5.0
)
RETURNS TABLE (
    id BIGINT,
    created_at TIMESTAMPTZ,
    metric TEXT,
    value NUMERIC,
    prev_value NUMERIC,
    change_amount NUMERIC,
    threshold NUMERIC,
    severity TEXT
) LANGUAGE sql STABLE AS $$
    WITH ordered_readings AS (
        SELECT
            id,
            created_at,
            temperature,
            humidity,
            LAG(temperature) OVER (ORDER BY created_at) as prev_temp,
            LAG(humidity) OVER (ORDER BY created_at) as prev_humid
        FROM (
            SELECT * FROM sensor_readings
            ORDER BY created_at DESC
            LIMIT data_limit
        ) recent
    )
    -- Temperature rate anomalies
    SELECT
        id,
        created_at,
        'temperature'::TEXT as metric,
        temperature as value,
        prev_temp as prev_value,
        ABS(temperature - prev_temp) as change_amount,
        temp_threshold as threshold,
        CASE
            WHEN ABS(temperature - prev_temp) > temp_threshold * 2 THEN 'high'
            WHEN ABS(temperature - prev_temp) > temp_threshold * 1.5 THEN 'medium'
            ELSE 'low'
        END as severity
    FROM ordered_readings
    WHERE prev_temp IS NOT NULL
      AND ABS(temperature - prev_temp) > temp_threshold
    UNION ALL
    -- Humidity rate anomalies
    SELECT
        id,
        created_at,
        'humidity'::TEXT as metric,
        humidity as value,
        prev_humid as prev_value,
        ABS(humidity - prev_humid) as change_amount,
        humidity_threshold as threshold,
        CASE
            WHEN ABS(humidity - prev_humid) > humidity_threshold * 2 THEN 'high'
            WHEN ABS(humidity - prev_humid) > humidity_threshold * 1.5 THEN 'medium'
            ELSE 'low'
        END as severity
    FROM ordered_readings
    WHERE prev_humid IS NOT NULL
      AND ABS(humidity - prev_humid) > humidity_threshold
    ORDER BY created_at DESC;
$$;

-- ============================================================================
-- 4. COMBINED ANOMALY DETECTION FUNCTION
-- ============================================================================
-- Runs all anomaly detection methods and returns combined results

CREATE OR REPLACE FUNCTION get_anomalies(
    data_limit INT DEFAULT 500,
    zscore_threshold NUMERIC DEFAULT 3.0,
    temp_rate_threshold NUMERIC DEFAULT 2.0,
    humidity_rate_threshold NUMERIC DEFAULT 5.0
)
RETURNS TABLE (
    id BIGINT,
    created_at TIMESTAMPTZ,
    metric TEXT,
    value NUMERIC,
    deviation NUMERIC,
    detection_method TEXT,
    severity TEXT,
    message TEXT
) LANGUAGE sql STABLE AS $$
    -- Z-score anomalies
    SELECT
        z.id,
        z.created_at,
        z.metric,
        z.value,
        z.zscore as deviation,
        'zscore'::TEXT as detection_method,
        z.severity,
        z.metric || ' of ' || z.value || ' is ' || z.zscore || ' std devs from mean (' || z.mean_value || ')' as message
    FROM detect_zscore_anomalies(data_limit, zscore_threshold) z
    UNION ALL
    -- Rate of change anomalies
    SELECT
        r.id,
        r.created_at,
        r.metric,
        r.value,
        r.change_amount as deviation,
        'rate_of_change'::TEXT as detection_method,
        r.severity,
        r.metric || ' changed by ' || r.change_amount || ' (from ' || r.prev_value || ' to ' || r.value || ')' as message
    FROM detect_rate_anomalies(data_limit, temp_rate_threshold, humidity_rate_threshold) r
    ORDER BY created_at DESC;
$$;

-- ============================================================================
-- 5. ANOMALY SUMMARY FUNCTION
-- ============================================================================
-- Returns a summary of anomalies for dashboard display

CREATE OR REPLACE FUNCTION get_anomaly_summary(data_limit INT DEFAULT 500)
RETURNS TABLE (
    total_anomalies BIGINT,
    high_severity BIGINT,
    medium_severity BIGINT,
    low_severity BIGINT,
    temperature_anomalies BIGINT,
    humidity_anomalies BIGINT,
    zscore_anomalies BIGINT,
    rate_anomalies BIGINT
) LANGUAGE sql STABLE AS $$
    WITH all_anomalies AS (
        SELECT * FROM get_anomalies(data_limit)
    )
    SELECT
        COUNT(*)::BIGINT as total_anomalies,
        COUNT(*) FILTER (WHERE severity = 'high')::BIGINT as high_severity,
        COUNT(*) FILTER (WHERE severity = 'medium')::BIGINT as medium_severity,
        COUNT(*) FILTER (WHERE severity = 'low')::BIGINT as low_severity,
        COUNT(*) FILTER (WHERE metric = 'temperature')::BIGINT as temperature_anomalies,
        COUNT(*) FILTER (WHERE metric = 'humidity')::BIGINT as humidity_anomalies,
        COUNT(*) FILTER (WHERE detection_method = 'zscore')::BIGINT as zscore_anomalies,
        COUNT(*) FILTER (WHERE detection_method = 'rate_of_change')::BIGINT as rate_anomalies
    FROM all_anomalies;
$$;
