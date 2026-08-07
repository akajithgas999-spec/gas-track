-- ============================================================
-- MIGRATION: Add company column to separate AjithGas / Barani Gas data
-- Run this in: Supabase Dashboard → SQL Editor → Paste & Run
-- ============================================================

-- 1. customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT 'AjithGas';

-- 2. transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT 'AjithGas';

-- 3. invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT 'AjithGas';

-- 4. purchases
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT 'AjithGas';

-- 5. suppliers
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT 'AjithGas';

-- ============================================================
-- Indexes for fast filtering by company
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_customers_company    ON public.customers(company);
CREATE INDEX IF NOT EXISTS idx_transactions_company ON public.transactions(company);
CREATE INDEX IF NOT EXISTS idx_invoices_company     ON public.invoices(company);
CREATE INDEX IF NOT EXISTS idx_purchases_company    ON public.purchases(company);
CREATE INDEX IF NOT EXISTS idx_suppliers_company    ON public.suppliers(company);

-- NOTE: cylinder_types and cylinders remain SHARED across both companies.
-- ============================================================
