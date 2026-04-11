-- ============================================================
-- Phase 2: scenario_id → scenario_master_id リネーム
-- 対象: staff_scenario_assignments, reservations, schedule_events
-- ============================================================
-- staff_scenario_assignments: カラム追加 + バックフィル + 同期トリガー
-- reservations / schedule_events: 既存 scenario_master_id カラムにバックフィル + 同期トリガー
-- ============================================================

-- ============================================================
-- 1. staff_scenario_assignments
-- ============================================================

-- 1a. scenario_master_id カラム追加（まだ存在しない場合のみ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_scenario_assignments'
      AND column_name = 'scenario_master_id'
  ) THEN
    ALTER TABLE public.staff_scenario_assignments
      ADD COLUMN scenario_master_id UUID REFERENCES public.scenario_masters(id);
  END IF;
END $$;

-- 1b. バックフィル: scenario_id → scenario_master_id
UPDATE public.staff_scenario_assignments
SET scenario_master_id = scenario_id
WHERE scenario_master_id IS NULL AND scenario_id IS NOT NULL;

-- 1c. NOT NULL 制約を追加
ALTER TABLE public.staff_scenario_assignments
  ALTER COLUMN scenario_master_id SET NOT NULL;

-- 1d. ユニーク制約追加（新PK候補、既存PKは残す）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_staff_scenario_assignments_master_id'
  ) THEN
    ALTER TABLE public.staff_scenario_assignments
      ADD CONSTRAINT uq_staff_scenario_assignments_master_id
      UNIQUE (staff_id, scenario_master_id);
  END IF;
END $$;

-- 1e. インデックス
CREATE INDEX IF NOT EXISTS idx_staff_scenario_assignments_master_id
  ON public.staff_scenario_assignments (scenario_master_id);

-- 1f. 双方向同期トリガー
DROP TRIGGER IF EXISTS trg_sync_ssa_scenario_ids ON public.staff_scenario_assignments;

CREATE OR REPLACE FUNCTION public.fn_sync_ssa_scenario_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.scenario_master_id IS NOT NULL AND NEW.scenario_id IS NULL THEN
      NEW.scenario_id := NEW.scenario_master_id;
    ELSIF NEW.scenario_id IS NOT NULL AND NEW.scenario_master_id IS NULL THEN
      NEW.scenario_master_id := NEW.scenario_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.scenario_master_id IS DISTINCT FROM OLD.scenario_master_id THEN
      NEW.scenario_id := NEW.scenario_master_id;
    ELSIF NEW.scenario_id IS DISTINCT FROM OLD.scenario_id THEN
      NEW.scenario_master_id := NEW.scenario_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_ssa_scenario_ids
  BEFORE INSERT OR UPDATE ON public.staff_scenario_assignments
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_ssa_scenario_ids();

-- ============================================================
-- 2. reservations — バックフィル + 同期トリガー
-- ============================================================

-- 2a. バックフィル: scenario_id → scenario_master_id（FK整合性チェック付き）
UPDATE public.reservations r
SET scenario_master_id = r.scenario_id
FROM public.scenario_masters sm
WHERE r.scenario_master_id IS NULL
  AND r.scenario_id IS NOT NULL
  AND sm.id = r.scenario_id;

-- 2b. 双方向同期トリガー
DROP TRIGGER IF EXISTS trg_sync_reservations_scenario_ids ON public.reservations;

CREATE OR REPLACE FUNCTION public.fn_sync_reservations_scenario_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.scenario_master_id IS NOT NULL AND NEW.scenario_id IS NULL THEN
      NEW.scenario_id := NEW.scenario_master_id;
    ELSIF NEW.scenario_id IS NOT NULL AND NEW.scenario_master_id IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.scenario_masters WHERE id = NEW.scenario_id) THEN
        NEW.scenario_master_id := NEW.scenario_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.scenario_master_id IS DISTINCT FROM OLD.scenario_master_id THEN
      NEW.scenario_id := NEW.scenario_master_id;
    ELSIF NEW.scenario_id IS DISTINCT FROM OLD.scenario_id THEN
      IF EXISTS (SELECT 1 FROM public.scenario_masters WHERE id = NEW.scenario_id) THEN
        NEW.scenario_master_id := NEW.scenario_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_reservations_scenario_ids
  BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_reservations_scenario_ids();

-- ============================================================
-- 3. schedule_events — バックフィル + 同期トリガー
-- ============================================================

-- 3a. バックフィル: scenario_id → scenario_master_id（FK整合性チェック付き）
UPDATE public.schedule_events se
SET scenario_master_id = se.scenario_id
FROM public.scenario_masters sm
WHERE se.scenario_master_id IS NULL
  AND se.scenario_id IS NOT NULL
  AND sm.id = se.scenario_id;

-- 3b. 双方向同期トリガー
DROP TRIGGER IF EXISTS trg_sync_schedule_events_scenario_ids ON public.schedule_events;

CREATE OR REPLACE FUNCTION public.fn_sync_schedule_events_scenario_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.scenario_master_id IS NOT NULL AND NEW.scenario_id IS NULL THEN
      NEW.scenario_id := NEW.scenario_master_id;
    ELSIF NEW.scenario_id IS NOT NULL AND NEW.scenario_master_id IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.scenario_masters WHERE id = NEW.scenario_id) THEN
        NEW.scenario_master_id := NEW.scenario_id;
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.scenario_master_id IS DISTINCT FROM OLD.scenario_master_id THEN
      NEW.scenario_id := NEW.scenario_master_id;
    ELSIF NEW.scenario_id IS DISTINCT FROM OLD.scenario_id THEN
      IF EXISTS (SELECT 1 FROM public.scenario_masters WHERE id = NEW.scenario_id) THEN
        NEW.scenario_master_id := NEW.scenario_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_schedule_events_scenario_ids
  BEFORE INSERT OR UPDATE ON public.schedule_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_schedule_events_scenario_ids();

-- ============================================================
-- 4. ビュー更新: organization_scenarios_with_master
--    ssa.scenario_id → ssa.scenario_master_id
-- ============================================================

CREATE OR REPLACE VIEW public.organization_scenarios_with_master AS
SELECT
  os.scenario_master_id AS id,
  os.id AS org_scenario_id,
  os.organization_id,
  os.scenario_master_id,
  os.slug,
  os.org_status AS status,
  os.org_status,
  COALESCE(os.override_title, sm.title) AS title,
  COALESCE(os.override_author, sm.author) AS author,
  COALESCE(os.report_display_name, sm.report_display_name, COALESCE(os.override_author, sm.author)) AS report_display_name,
  sm.author_email,
  sm.author_id,
  COALESCE(os.custom_key_visual_url, sm.key_visual_url) AS key_visual_url,
  COALESCE(os.custom_description, sm.description) AS description,
  COALESCE(os.custom_synopsis, sm.synopsis) AS synopsis,
  COALESCE(os.custom_caution, sm.caution) AS caution,
  COALESCE(os.override_player_count_min, sm.player_count_min) AS player_count_min,
  COALESCE(os.override_player_count_max, sm.player_count_max) AS player_count_max,
  os.male_count,
  os.female_count,
  os.other_count,
  COALESCE(os.duration, sm.official_duration) AS duration,
  os.weekend_duration,
  COALESCE(os.override_genre, sm.genre) AS genre,
  COALESCE(os.override_difficulty, sm.difficulty) AS difficulty,
  COALESCE(os.override_has_pre_reading, sm.has_pre_reading) AS has_pre_reading,
  sm.release_date,
  sm.official_site_url,
  sm.required_items AS required_props,
  os.participation_fee,
  os.gm_test_participation_fee,
  os.participation_costs,
  os.flexible_pricing,
  os.use_flexible_pricing,
  os.license_amount,
  os.gm_test_license_amount,
  os.franchise_license_amount,
  os.franchise_gm_test_license_amount,
  os.gm_costs,
  os.gm_count,
  os.gm_assignments,
  COALESCE((
    SELECT array_agg(st.name ORDER BY st.name)
    FROM staff_scenario_assignments ssa
    JOIN staff st ON st.id = ssa.staff_id
    WHERE ssa.scenario_master_id = os.scenario_master_id
      AND ssa.organization_id = os.organization_id
      AND (ssa.can_main_gm = true OR ssa.can_sub_gm = true)
  ), ARRAY[]::text[]) AS available_gms,
  COALESCE((
    SELECT array_agg(st.name ORDER BY st.name)
    FROM staff_scenario_assignments ssa
    JOIN staff st ON st.id = ssa.staff_id
    WHERE ssa.scenario_master_id = os.scenario_master_id
      AND ssa.organization_id = os.organization_id
      AND ssa.is_experienced = true
      AND COALESCE(ssa.can_main_gm, false) = false
      AND COALESCE(ssa.can_sub_gm, false) = false
  ), ARRAY[]::text[]) AS experienced_staff,
  os.available_stores,
  os.production_cost,
  os.production_costs,
  os.depreciation_per_performance,
  os.extra_preparation_time,
  (
    SELECT count(*)::integer
    FROM schedule_events se
    WHERE se.scenario_master_id = os.scenario_master_id
      AND se.organization_id = os.organization_id
      AND se.date <= CURRENT_DATE
      AND se.is_cancelled IS NOT TRUE
      AND se.category <> 'offsite'::text
  ) AS play_count,
  os.notes,
  os.created_at,
  os.updated_at,
  sm.master_status,
  os.pricing_patterns,
  true AS is_shared,
  COALESCE(os.scenario_type, 'normal'::text) AS scenario_type,
  0::numeric AS rating,
  COALESCE(os.kit_count, 1) AS kit_count,
  '[]'::jsonb AS license_rewards,
  COALESCE(os.is_recommended, false) AS is_recommended,
  os.survey_url,
  COALESCE(os.survey_enabled, false) AS survey_enabled,
  COALESCE(os.survey_deadline_days, 1) AS survey_deadline_days,
  COALESCE(os.characters, '[]'::jsonb) AS characters,
  os.pre_reading_notice_message,
  os.booking_start_date,
  os.booking_end_date,
  os.individual_notice_template,
  COALESCE(os.character_assignment_method, 'survey'::text) AS character_assignment_method
FROM organization_scenarios os
JOIN scenario_masters sm ON sm.id = os.scenario_master_id;

-- ============================================================
-- 5. RPC更新: create_private_booking_request
--    ssa.scenario_id → ssa.scenario_master_id
-- ============================================================

-- RPC内の staff_scenario_assignments 参照を scenario_master_id に変更
-- （RPC本体の再作成は supabase/rpcs/ の正規ソースから行う）

-- ============================================================
-- 完了
-- ============================================================
DO $$ BEGIN RAISE NOTICE 'Phase 2: scenario_id → scenario_master_id リネーム完了（staff_scenario_assignments, reservations, schedule_events）'; END $$;
