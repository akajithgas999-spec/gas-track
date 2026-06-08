
-- Customers extensions
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_number text UNIQUE,
  ADD COLUMN IF NOT EXISTS gst_number text,
  ADD COLUMN IF NOT EXISTS deposit_balance numeric NOT NULL DEFAULT 0;

-- Sequence + trigger to auto-assign customer_number
CREATE SEQUENCE IF NOT EXISTS public.customer_number_seq START 1;

CREATE OR REPLACE FUNCTION public.set_customer_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.customer_number IS NULL OR NEW.customer_number = '' THEN
    NEW.customer_number := 'CUST-' || lpad(nextval('public.customer_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_customer_number ON public.customers;
CREATE TRIGGER trg_set_customer_number
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_number();

-- Backfill existing customers
UPDATE public.customers
SET customer_number = 'CUST-' || lpad(nextval('public.customer_number_seq')::text, 4, '0')
WHERE customer_number IS NULL;

-- Cylinder types: HSN
ALTER TABLE public.cylinder_types
  ADD COLUMN IF NOT EXISTS hsn_code text;

-- Cylinders: issued_at for overdue calc
ALTER TABLE public.cylinders
  ADD COLUMN IF NOT EXISTS issued_at timestamptz;

-- Invoices: full GST fields
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS gst_number text,
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roundoff numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS return_date date,
  ADD COLUMN IF NOT EXISTS cylinder_ids uuid[] NOT NULL DEFAULT '{}';

-- Invoice items
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  cylinder_id uuid,
  type_id uuid,
  description text,
  hsn_code text,
  quantity numeric NOT NULL DEFAULT 1,
  rate numeric NOT NULL DEFAULT 0,
  taxable numeric NOT NULL DEFAULT 0,
  cgst_amount numeric NOT NULL DEFAULT 0,
  sgst_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all invoice_items" ON public.invoice_items;
CREATE POLICY "admin all invoice_items" ON public.invoice_items
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- Customer deposits ledger
DO $$ BEGIN
  CREATE TYPE public.deposit_txn_type AS ENUM ('collected','refunded','adjusted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.customer_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  cylinder_id uuid,
  type public.deposit_txn_type NOT NULL,
  amount numeric NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin all deposits" ON public.customer_deposits;
CREATE POLICY "admin all deposits" ON public.customer_deposits
  FOR ALL TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE INDEX IF NOT EXISTS idx_deposits_customer ON public.customer_deposits(customer_id);

-- Trigger: update customer.deposit_balance when ledger row inserted
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

DROP TRIGGER IF EXISTS trg_apply_deposit ON public.customer_deposits;
CREATE TRIGGER trg_apply_deposit
  AFTER INSERT ON public.customer_deposits
  FOR EACH ROW EXECUTE FUNCTION public.apply_deposit_to_balance();
