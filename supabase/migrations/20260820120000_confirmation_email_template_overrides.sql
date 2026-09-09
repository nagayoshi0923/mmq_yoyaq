-- 予約確定メールの作品・公演上書き
--
-- 送信優先: 公演上書き → 作品上書き → 店舗テンプレ（email_settings）
-- 空/NULL は「未設定」として次の段へ落とす。
--
-- ロールバック:
--   ALTER TABLE public.schedule_events DROP COLUMN IF EXISTS reservation_confirmation_template;
--   ALTER TABLE public.organization_scenarios DROP COLUMN IF EXISTS reservation_confirmation_template;
--   （staff_view は SELECT * のため、カラムDROP後に再作成すれば元に戻る）

ALTER TABLE public.schedule_events
  ADD COLUMN IF NOT EXISTS reservation_confirmation_template TEXT;

ALTER TABLE public.organization_scenarios
  ADD COLUMN IF NOT EXISTS reservation_confirmation_template TEXT;

COMMENT ON COLUMN public.schedule_events.reservation_confirmation_template IS
  '予約確定メールの公演上書き。NULL/空なら作品上書きまたは店舗テンプレを使う';

COMMENT ON COLUMN public.organization_scenarios.reservation_confirmation_template IS
  '予約確定メールの作品上書き。NULL/空なら店舗テンプレを使う。公演上書きがあればそちらが優先';

-- SELECT * ビューは作成時点の列に固定されるため、新列を見えるように作り直す
DROP VIEW IF EXISTS public.schedule_events_staff_view;
CREATE VIEW public.schedule_events_staff_view AS
  SELECT * FROM public.schedule_events
  WHERE public.is_staff_or_admin();

REVOKE ALL ON public.schedule_events_staff_view FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.schedule_events_staff_view FROM authenticated;
GRANT SELECT ON public.schedule_events_staff_view TO authenticated;

-- anon の schedule_events / organization_scenarios は列GRANT制。
-- 新列は GRANT に含めない（顧客に本文を公開しない）。
