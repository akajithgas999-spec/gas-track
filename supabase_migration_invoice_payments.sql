-- Migration: Add payment tracking columns to invoices table
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_status  text    DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS amount_paid     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_amount  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_date    date    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_method  text    DEFAULT NULL;

-- Backfill existing rows: if status = 'paid', mark amount_paid = total
UPDATE invoices
SET
  payment_status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'unpaid' END,
  amount_paid    = CASE WHEN status = 'paid' THEN COALESCE(total, amount, 0) ELSE 0 END,
  balance_amount = CASE WHEN status = 'paid' THEN 0 ELSE COALESCE(total, amount, 0) END
WHERE payment_status IS NULL OR payment_status = 'unpaid';
