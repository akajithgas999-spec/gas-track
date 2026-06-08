-- Cylinder tracking migration
-- Run this in your Supabase SQL editor

-- 1. Add issued/returned cylinder numbers to invoices (stored as integer arrays)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS issued_cylinder_numbers integer[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS returned_cylinder_numbers integer[] DEFAULT '{}';

-- 2. Add cylinder_number (1-2000) and fill_status to cylinders
ALTER TABLE cylinders
  ADD COLUMN IF NOT EXISTS cylinder_number integer,
  ADD COLUMN IF NOT EXISTS fill_status text DEFAULT 'filled' CHECK (fill_status IN ('filled', 'empty'));

-- 3. Add cylinder_number to purchase_items so each purchased line records the physical number
ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS cylinder_number integer,
  ADD COLUMN IF NOT EXISTS fill_status text DEFAULT 'filled' CHECK (fill_status IN ('filled', 'empty'));

-- 4. Unique constraint on cylinder_number (one physical cylinder per slot)
CREATE UNIQUE INDEX IF NOT EXISTS cylinders_cylinder_number_unique ON cylinders(cylinder_number) WHERE cylinder_number IS NOT NULL;
