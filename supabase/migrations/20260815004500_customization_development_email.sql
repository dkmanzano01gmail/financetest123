ALTER TABLE public.customization_requests
  ADD COLUMN IF NOT EXISTS development_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS development_email_error text,
  ADD COLUMN IF NOT EXISTS development_email_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.customization_requests.development_email_sent_at IS
  'Timestamp when the approved-development prompt was delivered to the administrator.';
COMMENT ON COLUMN public.customization_requests.development_email_error IS
  'Last delivery error for the approved-development prompt.';
COMMENT ON COLUMN public.customization_requests.development_email_attempts IS
  'Number of approved-development email delivery attempts.';
