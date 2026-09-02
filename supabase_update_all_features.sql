-- ==============================================================================
-- SUPABASE BACKEND DATABASE MIGRATION SCRIPT FOR CYLINDER ASSETS & MY CYLINDERS
-- Run this script in your Supabase SQL Editor (https://app.supabase.com)
-- ==============================================================================

-- 1. Add purchase metadata columns to cylinders table
ALTER TABLE cylinders
  ADD COLUMN IF NOT EXISTS purchased_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS supplier_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS batch_number text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS manufacture_year integer DEFAULT NULL;

-- 2. Add damage condition tracking columns
ALTER TABLE cylinders
  ADD COLUMN IF NOT EXISTS is_damaged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS damage_notes text DEFAULT NULL;

-- 3. Add cylinder asset selling tracking columns
ALTER TABLE cylinders
  ADD COLUMN IF NOT EXISTS sold_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sold_to_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sold_price numeric DEFAULT 0;

-- 4. Create performance indexes for purchase date filtering & status queries
CREATE INDEX IF NOT EXISTS idx_cylinders_purchased_at
  ON cylinders (purchased_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_cylinders_status_company
  ON cylinders (company, status);

CREATE INDEX IF NOT EXISTS idx_cylinders_sold_at
  ON cylinders (sold_at DESC NULLS LAST);

-- Summary: All cylinder asset fields, purchase dates, bill numbers, damaged flags, and asset sale records are fully configured in PostgreSQL!
