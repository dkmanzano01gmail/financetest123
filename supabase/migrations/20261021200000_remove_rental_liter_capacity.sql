-- Selá Queimas no longer manages availability by liters.
-- Keep the legacy columns only for backwards compatibility with the existing
-- quote RPCs, using a non-limiting internal value that is never shown in the UI.

ALTER TABLE public.rental_slots
  ALTER COLUMN capacity_liters SET DEFAULT 999999999,
  ALTER COLUMN min_liters SET DEFAULT 0;

UPDATE public.rental_slots
SET capacity_liters = 999999999,
    min_liters = 0
WHERE capacity_liters <> 999999999
   OR min_liters <> 0;
