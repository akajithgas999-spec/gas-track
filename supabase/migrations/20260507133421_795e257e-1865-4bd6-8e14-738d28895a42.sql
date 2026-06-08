-- Create the trigger on auth.users to auto-assign admin to first user
CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Grant the existing user admin role since they already signed up
INSERT INTO public.user_roles (user_id, role)
SELECT '26ec174a-4d81-47c3-b5ff-0dc149071c6b', 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = '26ec174a-4d81-47c3-b5ff-0dc149071c6b' AND role = 'admin'
);