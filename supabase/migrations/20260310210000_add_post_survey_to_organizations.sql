-- organizations テーブルに公演後アンケート設定カラムを追加
-- 作成日: 2026-03-10
-- 目的: 組織ごとに公演後アンケートのURLを設定できるようにする

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS post_performance_survey_url TEXT,
ADD COLUMN IF NOT EXISTS post_performance_survey_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.organizations.post_performance_survey_url IS '公演後アンケートURL（組織共通）';
COMMENT ON COLUMN public.organizations.post_performance_survey_enabled IS '公演後アンケートを有効にするかどうか';

-- 完了通知
DO $$
BEGIN
  RAISE NOTICE '✅ マイグレーション完了: organizations に公演後アンケートカラムを追加';
END $$;
