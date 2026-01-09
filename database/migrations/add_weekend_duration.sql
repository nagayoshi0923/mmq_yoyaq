-- 土日公演時間 (weekend_duration) カラム追加マイグレーション
-- 作成日: 2026-01-08
-- 目的: 土日に公演時間が変わる作品に対応するため、別途公演時間を設定できるようにする

-- ============================================================
-- 1. scenario_masters テーブルに weekend_duration を追加
-- ============================================================
ALTER TABLE public.scenario_masters
ADD COLUMN IF NOT EXISTS weekend_duration INTEGER;

COMMENT ON COLUMN public.scenario_masters.weekend_duration IS '土日・祝日の公演時間（分）。NULLの場合はofficial_durationを使用';

-- ============================================================
-- 2. organization_scenarios テーブルに weekend_duration を追加
-- ============================================================
ALTER TABLE public.organization_scenarios
ADD COLUMN IF NOT EXISTS weekend_duration INTEGER;

COMMENT ON COLUMN public.organization_scenarios.weekend_duration IS '組織独自の土日公演時間（分）。NULLならscenario_masters.weekend_durationを使用';

-- ============================================================
-- 3. scenarios テーブルに weekend_duration を追加（既存システム互換）
-- ============================================================
ALTER TABLE public.scenarios
ADD COLUMN IF NOT EXISTS weekend_duration INTEGER;

COMMENT ON COLUMN public.scenarios.weekend_duration IS '土日・祝日の公演時間（分）。NULLの場合はdurationを使用';

-- ============================================================
-- 4. organization_scenarios_with_master ビューを更新
-- ============================================================
-- 既存のビューを削除（カラム構造が変わるため再作成が必要）
DROP VIEW IF EXISTS public.organization_scenarios_with_master;

-- ビューを再作成
CREATE VIEW public.organization_scenarios_with_master AS
SELECT
  os.id,
  os.organization_id,
  os.scenario_master_id,
  os.slug,
  os.org_status,
  os.pricing_patterns,
  os.gm_assignments,
  os.created_at,
  os.updated_at,
  
  -- マスタ情報（組織設定があればそちらを優先）
  sm.title,
  sm.author,
  sm.author_id,
  COALESCE(os.custom_key_visual_url, sm.key_visual_url) AS key_visual_url,
  COALESCE(os.custom_description, sm.description) AS description,
  COALESCE(os.custom_synopsis, sm.synopsis) AS synopsis,
  COALESCE(os.custom_caution, sm.caution) AS caution,
  sm.player_count_min,
  sm.player_count_max,
  COALESCE(os.duration, sm.official_duration) AS duration,
  -- 土日公演時間: 組織設定 > マスタ設定 > 通常公演時間
  COALESCE(os.weekend_duration, sm.weekend_duration, os.duration, sm.official_duration) AS weekend_duration,
  sm.genre,
  sm.difficulty,
  os.participation_fee,
  os.extra_preparation_time,
  
  -- マスタのステータス
  sm.master_status

FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id;

COMMENT ON VIEW public.organization_scenarios_with_master IS '組織シナリオとマスタを結合したビュー。組織固有設定があればそちらを優先。土日公演時間対応';

-- 完了メッセージ
SELECT 'weekend_duration columns added successfully' AS result;

