-- ============================================================================
-- DANGER: RESET DATABASE SCRIPT
-- This script will DELETE all data and DROP all tables/functions.
-- Use with caution!
-- ============================================================================

-- 1. Drop existing functions
drop function if exists get_candles(int, interval);
drop function if exists get_candles(int);
drop function if exists get_averages(interval);
drop function if exists refresh_sensor_hourly();
drop function if exists cleanup_old_readings(int);
drop function if exists get_latest_reading();

-- 2. Drop materialized views
drop materialized view if exists sensor_readings_hourly;

-- 3. Drop tables (cascades to indexes and policies)
drop table if exists sensor_readings;

-- ============================================================================
-- CLEAN SLATE ACHIEVED
-- Run 01_setup_schema.sql to re-initialize.
-- ============================================================================
