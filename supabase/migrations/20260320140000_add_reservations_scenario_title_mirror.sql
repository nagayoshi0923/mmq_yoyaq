-- 旧フロントが reservations.scenario_title を SELECT する互換用。
-- 正は title。scenario_title は title のミラー（INSERT/UPDATE OF title で同期）。
-- NOTE: DROP TRIGGER は本番で AccessExclusiveLock が長くなりデッドロックしやすいため使わない。

SET lock_timeout = '120s';

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS scenario_title TEXT;

UPDATE public.reservations
SET scenario_title = title
WHERE scenario_title IS DISTINCT FROM title;

CREATE OR REPLACE FUNCTION public.sync_reservations_scenario_title_from_title()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.scenario_title := NEW.title;
  RETURN NEW;
END;
$$;

DO $t$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.reservations'::regclass
      AND tgname = 'trg_reservations_scenario_title_mirror'
  ) THEN
    CREATE TRIGGER trg_reservations_scenario_title_mirror
      BEFORE INSERT OR UPDATE OF title ON public.reservations
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_reservations_scenario_title_from_title();
  END IF;
END;
$t$;

COMMENT ON COLUMN public.reservations.scenario_title IS
  '互換列。常に title と同一（トリガー同期）。旧クライアントの SELECT 向け。';
