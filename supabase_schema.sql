-- CylinderOps Unified Database Schema Setup
-- Paste this script into your Supabase Dashboard -> SQL Editor and click "Run".
-- This will create all tables, triggers, indices, and policy rules for project nscgrlnclfoxmqzeitmi.

-- ----------------------------------------------------
-- 1. Create Enums and Types
-- ----------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cylinder_status AS ENUM ('in_stock', 'issued', 'maintenance', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.txn_type AS ENUM ('issue', 'return', 'incoming');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('paid', 'pending', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.deposit_txn_type AS ENUM ('collected', 'refunded', 'adjusted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------
-- 2. Create Base Tables
-- ----------------------------------------------------

-- User Roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Cylinder Types
CREATE TABLE IF NOT EXISTS public.cylinder_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  deposit NUMERIC(10,2) NOT NULL DEFAULT 0,
  description TEXT,
  hsn_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customers
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  customer_number TEXT UNIQUE,
  gst_number TEXT,
  deposit_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cylinders
CREATE TABLE IF NOT EXISTS public.cylinders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT NOT NULL UNIQUE,
  type_id UUID NOT NULL REFERENCES public.cylinder_types(id) ON DELETE RESTRICT,
  status public.cylinder_status NOT NULL DEFAULT 'in_stock',
  current_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  notes TEXT,
  issued_at TIMESTAMPTZ,
  cylinder_number INTEGER,
  fill_status TEXT DEFAULT 'filled' CHECK (fill_status IN ('filled', 'empty')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_type public.txn_type NOT NULL,
  cylinder_id UUID NOT NULL REFERENCES public.cylinders(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  type_id UUID NOT NULL REFERENCES public.cylinder_types(id),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE DEFAULT ('INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6)),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status public.payment_status NOT NULL DEFAULT 'pending',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  gst_number TEXT,
  hsn_code TEXT,
  taxable_amount NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  deposit_amount NUMERIC NOT NULL DEFAULT 0,
  cgst_rate NUMERIC NOT NULL DEFAULT 0,
  cgst_amount NUMERIC NOT NULL DEFAULT 0,
  sgst_rate NUMERIC NOT NULL DEFAULT 0,
  sgst_amount NUMERIC NOT NULL DEFAULT 0,
  roundoff NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  billing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  return_date DATE,
  cylinder_ids UUID[] NOT NULL DEFAULT '{}',
  issued_cylinder_numbers INTEGER[] DEFAULT '{}',
  returned_cylinder_numbers INTEGER[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invoice items
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  cylinder_id UUID,
  type_id UUID,
  description TEXT,
  hsn_code TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  rate NUMERIC NOT NULL DEFAULT 0,
  taxable NUMERIC NOT NULL DEFAULT 0,
  cgst_amount NUMERIC NOT NULL DEFAULT 0,
  sgst_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customer deposits
CREATE TABLE IF NOT EXISTS public.customer_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  cylinder_id UUID,
  type public.deposit_txn_type NOT NULL,
  amount NUMERIC NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gst_number TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchases
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number TEXT NOT NULL DEFAULT (('PUR-' || to_char(now(),'YYYYMMDD') || '-' || substr(gen_random_uuid()::text,1,6))),
  supplier_id UUID REFERENCES public.suppliers(id),
  bill_number TEXT,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  challan_number TEXT,
  challan_date DATE,
  gst_number TEXT,
  taxable_amount NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  cgst_rate NUMERIC NOT NULL DEFAULT 0,
  cgst_amount NUMERIC NOT NULL DEFAULT 0,
  sgst_rate NUMERIC NOT NULL DEFAULT 0,
  sgst_amount NUMERIC NOT NULL DEFAULT 0,
  roundoff NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchase items
CREATE TABLE IF NOT EXISTS public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  cylinder_id UUID,
  type_id UUID,
  serial_number TEXT,
  hsn_code TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  rate NUMERIC NOT NULL DEFAULT 0,
  taxable NUMERIC NOT NULL DEFAULT 0,
  cgst_amount NUMERIC NOT NULL DEFAULT 0,
  sgst_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  cylinder_number INTEGER,
  fill_status TEXT DEFAULT 'filled' CHECK (fill_status IN ('filled', 'empty')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------
-- 3. Create Schemas, Indices and Sequences
-- ----------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE SEQUENCE IF NOT EXISTS public.customer_number_seq START 1;

CREATE UNIQUE INDEX IF NOT EXISTS cylinders_cylinder_number_unique ON public.cylinders(cylinder_number) WHERE cylinder_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_deposits_customer ON public.customer_deposits(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases(bill_date);

-- ----------------------------------------------------
-- 4. Create Helper Functions & Triggers
-- ----------------------------------------------------

-- set_updated_at function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- has_role helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- is_admin bypass helper (allows any authenticated user)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN auth.uid() IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN auth.uid() IS NOT NULL;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- handle_new_user trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

-- trigger for handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- auto-confirm email trigger function
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS TRIGGER AS $$
BEGIN
  NEW.email_confirmed_at := COALESCE(NEW.email_confirmed_at, now());
  NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- trigger for auto_confirm_user
DROP TRIGGER IF EXISTS tr_auto_confirm_user ON auth.users;
CREATE TRIGGER tr_auto_confirm_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_user();

-- customer_number trigger function
CREATE OR REPLACE FUNCTION public.set_customer_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.customer_number IS NULL OR NEW.customer_number = '' THEN
    NEW.customer_number := 'CUST-' || lpad(nextval('public.customer_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

-- trigger for customer_number
DROP TRIGGER IF EXISTS trg_set_customer_number ON public.customers;
CREATE TRIGGER trg_set_customer_number
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_number();

-- apply_deposit_to_balance trigger function
CREATE OR REPLACE FUNCTION public.apply_deposit_to_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE delta numeric;
BEGIN
  delta := CASE
    WHEN NEW.type = 'collected' THEN NEW.amount
    WHEN NEW.type = 'refunded'  THEN -NEW.amount
    ELSE NEW.amount  -- adjusted: signed
  END;
  UPDATE public.customers
    SET deposit_balance = COALESCE(deposit_balance,0) + delta,
        updated_at = now()
    WHERE id = NEW.customer_id;
  RETURN NEW;
END $$;

-- trigger for apply_deposit_to_balance
DROP TRIGGER IF EXISTS trg_apply_deposit ON public.customer_deposits;
CREATE TRIGGER trg_apply_deposit
  AFTER INSERT ON public.customer_deposits
  FOR EACH ROW EXECUTE FUNCTION public.apply_deposit_to_balance();

-- Register triggers for updated_at fields
DROP TRIGGER IF EXISTS trg_types_updated ON public.cylinder_types;
CREATE TRIGGER trg_types_updated BEFORE UPDATE ON public.cylinder_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_cust_updated ON public.customers;
CREATE TRIGGER trg_cust_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_cyl_updated ON public.cylinders;
CREATE TRIGGER trg_cyl_updated BEFORE UPDATE ON public.cylinders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_inv_updated ON public.invoices;
CREATE TRIGGER trg_inv_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------
-- 5. Enable Row Level Security (RLS) & Policies
-- ----------------------------------------------------
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cylinder_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cylinders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

-- Policies definition
CREATE POLICY "Admins view roles" ON public.user_roles FOR SELECT TO authenticated USING (private.is_admin() OR user_id = auth.uid());
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "admin all types" ON public.cylinder_types FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin all customers" ON public.customers FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin all cylinders" ON public.cylinders FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin all txn" ON public.transactions FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin all invoices" ON public.invoices FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin all invoice_items" ON public.invoice_items FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin all deposits" ON public.customer_deposits FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin all suppliers" ON public.suppliers FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin all purchases" ON public.purchases FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "admin all purchase_items" ON public.purchase_items FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

-- ----------------------------------------------------
-- 6. Seed Default Cylinder Types
-- ----------------------------------------------------
INSERT INTO public.cylinder_types (name, code, price, deposit, description) VALUES
('LPG 14.2 kg', 'LPG14', 900, 1500, 'LPG Cylinder 14.2 kg connection'),
('LPG 5 kg', 'LPG5', 450, 800, 'LPG Cylinder 5 kg connection'),
('LPG 19 kg', 'LPG19', 1200, 2000, 'Commercial LPG Cylinder 19 kg connection'),
('LPG 47.5 kg', 'LPG47', 2800, 5000, 'Industrial LPG Cylinder 47.5 kg connection')
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name, price = EXCLUDED.price, deposit = EXCLUDED.deposit, description = EXCLUDED.description;
