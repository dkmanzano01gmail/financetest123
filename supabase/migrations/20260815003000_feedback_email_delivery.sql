ALTER TABLE public.feedback_comments
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS email_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.feedback_comments.email_sent_at IS
  'Timestamp when the feedback notification email was delivered to the configured recipient.';
COMMENT ON COLUMN public.feedback_comments.email_error IS
  'Last email delivery error, retained so a saved comment can be retried safely.';
COMMENT ON COLUMN public.feedback_comments.email_attempts IS
  'Number of notification delivery attempts for this comment.';
