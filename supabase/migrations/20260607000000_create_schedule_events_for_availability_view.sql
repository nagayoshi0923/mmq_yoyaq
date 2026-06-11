-- 貸切リクエストの空き枠判定用ビュー
-- schedule_events_public は published = true で絞り込んでいるため、
-- 非公開・テストプレイ・貸切等の予定が空き枠として誤って扱われてしまっていた。
-- 顧客の貸切リクエスト画面で「実際に確保されているスロット」を漏れなく判定するために、
-- published フラグに関わらずキャンセル以外の予定を全て見られる最小列のビューを切る。
--
-- 公開を許す列は「時間と店舗とキャンセル状態」のみで、シナリオ名・予約者名・GM など
-- 顧客に見せたくないメタデータは含めない。

CREATE OR REPLACE VIEW public.schedule_events_for_availability AS
SELECT
  id,
  date,
  store_id,
  start_time,
  end_time,
  is_cancelled,
  organization_id
FROM schedule_events
WHERE is_cancelled = false OR is_cancelled IS NULL;

GRANT SELECT ON public.schedule_events_for_availability TO anon;

GRANT SELECT ON public.schedule_events_for_availability TO authenticated;
