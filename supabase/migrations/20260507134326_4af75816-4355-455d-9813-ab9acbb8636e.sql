-- Keep security-definer helpers out of the exposed public API schema
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.has_role(auth.uid(), 'admin')
$$;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- Remove direct execution access from exposed public helper functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;

-- Update admin-only access rules to use protected helpers
DROP POLICY IF EXISTS "admin all customers" ON public.customers;
CREATE POLICY "admin all customers" ON public.customers
FOR ALL TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "admin all types" ON public.cylinder_types;
CREATE POLICY "admin all types" ON public.cylinder_types
FOR ALL TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "admin all cylinders" ON public.cylinders;
CREATE POLICY "admin all cylinders" ON public.cylinders
FOR ALL TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "admin all invoices" ON public.invoices;
CREATE POLICY "admin all invoices" ON public.invoices
FOR ALL TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "admin all txn" ON public.transactions;
CREATE POLICY "admin all txn" ON public.transactions
FOR ALL TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
FOR ALL TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "Admins view roles" ON public.user_roles;
CREATE POLICY "Admins view roles" ON public.user_roles
FOR SELECT TO authenticated
USING (private.is_admin() OR user_id = auth.uid());