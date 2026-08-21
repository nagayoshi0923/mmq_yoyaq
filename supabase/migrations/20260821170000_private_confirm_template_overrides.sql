-- 貸切確定メールの作品・公演上書き
--
-- 送信優先: 公演上書き → 作品上書き → 店舗テンプレ（email_settings.private_confirm_template）
-- 空/NULL は「未設定」として次の段へ落とす。
-- 通常予約の reservation_confirmation_template とは別列（文面が違うため）。
--
-- ロールバック:
--   ALTER TABLE public.schedule_events DROP COLUMN IF EXISTS private_confirm_template;
--   ALTER TABLE public.organization_scenarios DROP COLUMN IF EXISTS private_confirm_template;
--   （staff_view は SELECT * のため、カラムDROP後に再作成すれば元に戻る）

ALTER TABLE public.schedule_events
  ADD COLUMN IF NOT EXISTS private_confirm_template TEXT;

ALTER TABLE public.organization_scenarios
  ADD COLUMN IF NOT EXISTS private_confirm_template TEXT;

COMMENT ON COLUMN public.schedule_events.private_confirm_template IS
  '貸切確定メールの公演上書き。NULL/空なら作品上書きまたは店舗テンプレを使う';

COMMENT ON COLUMN public.organization_scenarios.private_confirm_template IS
  '貸切確定メールの作品上書き。NULL/空なら店舗テンプレを使う。公演上書きがあればそちらが優先';

-- 予約確定欄に貸切文面を書いていた既存データは、貸切欄へコピーする（予約確定欄は消さない）
UPDATE public.organization_scenarios
SET private_confirm_template = reservation_confirmation_template
WHERE private_confirm_template IS NULL
  AND reservation_confirmation_template IS NOT NULL
  AND reservation_confirmation_template LIKE '%貸切リクエストを承りました%';

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
