-- organization_scenarios_with_master ビューを修正
-- 作成日: 2026-02-19
-- 概要: available_gms と experienced_staff を staff.special_scenarios と staff.experienced_scenarios から取得
--       スタッフが自分で登録した「GM可能」「体験済み」を反映

-- 既存のビューを削除
DROP VIEW IF EXISTS public.organization_scenarios_with_master;

-- 修正されたビューを作成
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

  -- ライセンス料
  os.license_amount,
  os.gm_test_license_amount,
  os.franchise_license_amount,
  os.franchise_gm_test_license_amount,
  
  -- GM可能（スタッフが自分で登録: staff.special_scenarios に scenario_master_id が含まれるスタッフ）
  COALESCE(
    (SELECT ARRAY_AGG(st.name ORDER BY st.name)
     FROM public.staff st
     WHERE st.organization_id = os.organization_id
       AND st.status = 'active'
       AND os.scenario_master_id = ANY(st.special_scenarios)
    ), ARRAY[]::TEXT[]
  ) AS available_gms,
  
  -- 体験済み（スタッフが自分で登録: staff.experienced_scenarios に scenario_master_id が含まれるスタッフ）
  COALESCE(
    (SELECT ARRAY_AGG(st.name ORDER BY st.name)
     FROM public.staff st
     WHERE st.organization_id = os.organization_id
       AND st.status = 'active'
       AND os.scenario_master_id = ANY(st.experienced_scenarios)
       AND NOT (os.scenario_master_id = ANY(COALESCE(st.special_scenarios, ARRAY[]::TEXT[])))
    ), ARRAY[]::TEXT[]
  ) AS experienced_staff,
  
  os.gm_costs,
  os.gm_count,
  
  -- 店舗・制作関連
  os.available_stores,
  os.production_costs,
  os.depreciation_per_performance,
  
  -- その他
  os.gm_test_participation_fee,
  os.notes,
  
  -- 公演回数（その組織での実績公演回数、schedule_events からカウント）
  COALESCE(
    (SELECT COUNT(*)
     FROM public.schedule_events se
     JOIN public.scenarios s ON s.id = se.scenario_id
     WHERE s.scenario_master_id = os.scenario_master_id
       AND se.organization_id = os.organization_id
       AND se.scenario_id IS NOT NULL
       AND COALESCE(se.is_cancelled, false) = false
       AND se.date <= CURRENT_DATE
    ), 0
  )::INTEGER AS play_count

FROM public.organization_scenarios os
JOIN public.scenario_masters sm ON sm.id = os.scenario_master_id;

COMMENT ON VIEW public.organization_scenarios_with_master IS '組織シナリオとマスタを結合したビュー。GM可能・体験済みはスタッフが自己登録したデータから取得';

-- 確認用クエリ
-- SELECT id, title, available_gms, experienced_staff
-- FROM organization_scenarios_with_master 
-- WHERE scenario_master_id = '16107814-dd3a-4407-b12f-6cf947e01f9a';
