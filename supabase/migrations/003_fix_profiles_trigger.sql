-- ============================================================
-- Fix: Supabase Auth Profile Trigger & Permissions
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Ensure permissions for supabase_auth_admin on schema public and table profiles
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON TABLE public.profiles TO supabase_auth_admin;

-- 2. Ensure RLS allows insert for user's own profile as a safe fallback
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles 
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 3. Replace handle_new_user function with explicit schema and search_path = public
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
  v_avatar_url   TEXT;
BEGIN
  -- Extract and sanitize display_name
  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(split_part(NEW.email, '@', 1)), ''),
    'Racer_' || SUBSTRING(NEW.id::text, 1, 6)
  );

  -- Extract or set default avatar
  v_avatar_url := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), ''),
    '🏎️'
  );

  -- Insert or update profile in public.profiles
  INSERT INTO public.profiles (id, display_name, avatar_url, created_at)
  VALUES (NEW.id, v_display_name, v_avatar_url, NOW())
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    avatar_url   = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url);

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user error for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 4. Grant execute on function to supabase_auth_admin
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- 5. Recreate trigger cleanly on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
