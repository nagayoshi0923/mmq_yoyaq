-- organization_scenarios_with_master ビューに play_count を追加
-- 作成日: 2026-01-22
-- 概要: 各シナリオの公演回数を表示するために、schedule_events からカウントを取得

-- 既存のビューを削除
DROP VIEW IF EXISTS public.organization_scenarios_with_master;

-- 公演回数を含む新しいビューを作成
CREATE OR REPLACE VIEW public.organization_scenarios_with_master AS
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
  sm.genre,
  sm.difficulty,
  os.participation_fee,
  os.extra_preparation_time,
  
  -- マスタのステータス
  sm.master_status,
  
  -- 公演回数（schedule_events からカウント、キャンセルを除く）
  -- scenarios テーブルを経由して取得
  COALESCE(
    (SELECT COUNT(*)
     FROM public.schedule_events se
     JOIN public.scenarios s ON s.id = se.scenario_id
     WHERE s.scenario_master_id = os.scenario_master_id
       AND se.organization_id = os.organization_id
       AND se.event_type = 'performance'
       AND se.status != 'cancelled'
    ), 0
  )::INTEGER AS play_count

FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id;

COMMENT ON VIEW public.organization_scenarios_with_master IS '組織シナリオとマスタを結合したビュー。組織固有設定があればそちらを優先。play_countはschedule_eventsから計算';

-- 確認用クエリ
-- SELECT id, title, play_count FROM organization_scenarios_with_master ORDER BY play_count DESC LIMIT 10;

