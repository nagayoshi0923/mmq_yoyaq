BEGIN;
-- 未入力と明示0円を区別する。過去の保存値は一括変換しない。
ALTER TABLE public.schedule_events ALTER COLUMN gm_cost DROP DEFAULT;
COMMENT ON COLUMN public.schedule_events.gm_cost IS '保存済みGM費用。NULLは未記録（公演日時点の設定で算出）、0は明示された0円。旧データの記録根拠は別途確認し自動変換しない。';
COMMIT;
