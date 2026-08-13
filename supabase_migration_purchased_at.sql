-- Migration: Add purchased_at column to cylinders table
-- Run this in your Supabase SQL Editor

ALTER TABLE cylinders
  ADD COLUMN IF NOT EXISTS purchased_at timestamptz DEFAULT NULL;

-- Optional: create an index for faster queries on purchased date
CREATE INDEX IF NOT EXISTS idx_cylinders_purchased_at
  ON cylinders (purchased_at DESC NULLS LAST);
