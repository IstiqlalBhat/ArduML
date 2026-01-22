-- ============================================================================
-- INCREMENTAL MIGRATION: HEATMAP & PERFORMANCE (No Data Loss)
-- Run this in your Supabase SQL Editor
-- ============================================================================

-- 1. Create Covering Index for ultra-fast Heatmap generation
-- This creates a copy of light/motion data in the index itself (RAM-resident),
-- avoiding slow table lookups for millions of records.
create index if not exists idx_sensor_readings_covering_stats
on sensor_readings (created_at desc)
include (light, motion);

-- 2. Create the Heatmap Data Function
-- Returns average intensity over time buckets (seconds, minutes, hours)
create or replace function get_heatmap_data(
  bucket_width_seconds int,
  time_range interval default interval '24 hours'
)
returns table (
  bucket timestamp with time zone,
  avg_light numeric,
  avg_motion numeric,
  reading_count bigint
) language sql stable as $$
  select 
    to_timestamp(floor(extract(epoch from created_at) / bucket_width_seconds) * bucket_width_seconds) as bucket,
    round(avg(light), 2) as avg_light,
    round(avg(motion), 2) as avg_motion,
    count(*) as reading_count
  from sensor_readings
  where created_at > (now() - time_range)
  group by bucket
  order by bucket desc;
$$;
