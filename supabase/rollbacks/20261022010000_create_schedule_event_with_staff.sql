-- 20261022010000_create_schedule_event_with_staff の巻き戻し。
-- 関数を消すだけ。作成済みの公演・担当・席予約はそのまま残る（データは変えない）。
-- 戻す前に画面を旧版（公演作成 → 担当を別保存）へ戻すこと。新しい画面のまま戻すと GM ありの追加が 500 になる（GM なしの追加は影響なし）。
BEGIN;
DROP FUNCTION IF EXISTS public.create_schedule_event_with_staff(jsonb, text[], jsonb, jsonb);
COMMIT;
