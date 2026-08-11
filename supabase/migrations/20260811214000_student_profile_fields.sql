-- Keep the students table aligned with the fields available in the profile form.
-- Existing records are preserved; all new fields are nullable.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS enrollment_date date,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS social_link text,
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Refresh PostgREST's schema cache immediately after the migration.
NOTIFY pgrst, 'reload schema';
