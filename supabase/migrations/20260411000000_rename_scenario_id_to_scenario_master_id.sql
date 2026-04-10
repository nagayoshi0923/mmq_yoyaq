-- =====================================================
-- scenario_id → scenario_master_id リネーム（後方互換）
-- 対象: private_groups, manual_external_performances
-- 戦略: 新カラム追加 → バックフィル → 双方向同期トリガー
-- =====================================================

-- =====================================================
-- 1. private_groups
-- =====================================================

-- 新カラム追加（既に scenario_id が scenario_masters(id) を参照している）
ALTER TABLE public.private_groups
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID
  REFERENCES public.scenario_masters(id) ON DELETE SET NULL;

-- 既存データをコピー
UPDATE public.private_groups
  SET scenario_master_id = scenario_id
  WHERE scenario_id IS NOT NULL AND scenario_master_id IS NULL;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_private_groups_scenario_master_id
  ON public.private_groups(scenario_master_id);

-- 双方向同期トリガー
CREATE OR REPLACE FUNCTION sync_private_groups_scenario_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scenario_master_id IS NOT NULL AND NEW.scenario_id IS DISTINCT FROM NEW.scenario_master_id THEN
    NEW.scenario_id := NEW.scenario_master_id;
  ELSIF NEW.scenario_id IS NOT NULL AND NEW.scenario_master_id IS DISTINCT FROM NEW.scenario_id THEN
    NEW.scenario_master_id := NEW.scenario_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_private_groups_scenario_ids ON public.private_groups;
CREATE TRIGGER trg_sync_private_groups_scenario_ids
  BEFORE INSERT OR UPDATE ON public.private_groups
  FOR EACH ROW EXECUTE FUNCTION sync_private_groups_scenario_ids();

-- =====================================================
-- 2. manual_external_performances
-- =====================================================

-- 新カラム追加
ALTER TABLE public.manual_external_performances
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID;

-- 既存データをコピー
UPDATE public.manual_external_performances
  SET scenario_master_id = scenario_id
  WHERE scenario_master_id IS NULL;

-- 新カラムに UNIQUE 制約を追加（旧制約は残す）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'manual_external_perf_master_unique'
  ) THEN
    ALTER TABLE public.manual_external_performances
      ADD CONSTRAINT manual_external_perf_master_unique
      UNIQUE (organization_id, scenario_master_id, year, month);
  END IF;
END $$;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_manual_external_perf_scenario_master_id
  ON public.manual_external_performances(scenario_master_id);

-- 双方向同期トリガー
CREATE OR REPLACE FUNCTION sync_manual_external_perf_scenario_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scenario_master_id IS NOT NULL AND NEW.scenario_id IS DISTINCT FROM NEW.scenario_master_id THEN
    NEW.scenario_id := NEW.scenario_master_id;
  ELSIF NEW.scenario_id IS NOT NULL AND NEW.scenario_master_id IS DISTINCT FROM NEW.scenario_id THEN
    NEW.scenario_master_id := NEW.scenario_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_manual_external_perf_scenario_ids ON public.manual_external_performances;
CREATE TRIGGER trg_sync_manual_external_perf_scenario_ids
  BEFORE INSERT OR UPDATE ON public.manual_external_performances
  FOR EACH ROW EXECUTE FUNCTION sync_manual_external_perf_scenario_ids();

-- =====================================================
-- 3. RPC更新: upsert_character_assignments_to_survey
-- =====================================================

CREATE OR REPLACE FUNCTION upsert_character_assignments_to_survey(
  p_group_id UUID,
  p_assignments JSONB
) RETURNS void AS $$
DECLARE
  v_scenario_id UUID;
  v_org_id UUID;
  v_org_scenario_id UUID;
  v_question_id UUID;
  v_member_id TEXT;
  v_char_id TEXT;
  v_existing_responses JSONB;
  v_existing_id UUID;
  v_max_order INT;
BEGIN
  SELECT scenario_master_id, organization_id INTO v_scenario_id, v_org_id
  FROM private_groups WHERE id = p_group_id;

  IF v_scenario_id IS NULL OR v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_org_scenario_id
  FROM organization_scenarios
  WHERE scenario_master_id = v_scenario_id AND organization_id = v_org_id
  LIMIT 1;

  IF v_org_scenario_id IS NULL THEN
    SELECT id INTO v_org_scenario_id
    FROM organization_scenarios WHERE id = v_scenario_id
    LIMIT 1;
  END IF;

  IF v_org_scenario_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_question_id
  FROM org_scenario_survey_questions
  WHERE org_scenario_id = v_org_scenario_id AND question_type = 'character_selection'
  LIMIT 1;

  IF v_question_id IS NULL THEN
    SELECT coalesce(max(order_num), 0) INTO v_max_order
    FROM org_scenario_survey_questions
    WHERE org_scenario_id = v_org_scenario_id;

    INSERT INTO org_scenario_survey_questions (org_scenario_id, question_text, question_type, options, is_required, order_num)
    VALUES (v_org_scenario_id, '希望キャラクター', 'character_selection', '[]'::jsonb, false, v_max_order + 1)
    RETURNING id INTO v_question_id;
  END IF;

  FOR v_member_id, v_char_id IN
    SELECT key, value #>> '{}' FROM jsonb_each(p_assignments)
  LOOP
    SELECT id, responses INTO v_existing_id, v_existing_responses
    FROM private_group_survey_responses
    WHERE group_id = p_group_id AND member_id = v_member_id::UUID;

    IF v_existing_id IS NOT NULL THEN
      UPDATE private_group_survey_responses
      SET responses = coalesce(v_existing_responses, '{}'::jsonb) || jsonb_build_object(v_question_id::TEXT, v_char_id),
          updated_at = now()
      WHERE id = v_existing_id;
    ELSE
      INSERT INTO private_group_survey_responses (group_id, member_id, responses)
      VALUES (p_group_id, v_member_id::UUID, jsonb_build_object(v_question_id::TEXT, v_char_id));
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. RPC更新: clear_character_selection_from_survey
-- =====================================================

CREATE OR REPLACE FUNCTION clear_character_selection_from_survey(
  p_group_id UUID
) RETURNS void AS $$
DECLARE
  v_scenario_id UUID;
  v_org_id UUID;
  v_org_scenario_id UUID;
  v_question_id UUID;
BEGIN
  SELECT scenario_master_id, organization_id INTO v_scenario_id, v_org_id
  FROM private_groups WHERE id = p_group_id;

  IF v_scenario_id IS NULL OR v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_org_scenario_id
  FROM organization_scenarios
  WHERE scenario_master_id = v_scenario_id AND organization_id = v_org_id
  LIMIT 1;

  IF v_org_scenario_id IS NULL THEN
    SELECT id INTO v_org_scenario_id
    FROM organization_scenarios WHERE id = v_scenario_id
    LIMIT 1;
  END IF;

  IF v_org_scenario_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_question_id
  FROM org_scenario_survey_questions
  WHERE org_scenario_id = v_org_scenario_id AND question_type = 'character_selection'
  LIMIT 1;

  IF v_question_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE private_group_survey_responses
  SET responses = responses - v_question_id::TEXT,
      updated_at = now()
  WHERE group_id = p_group_id
    AND responses ? v_question_id::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. RPC更新: upsert_manual_external_performance
-- =====================================================

CREATE OR REPLACE FUNCTION upsert_manual_external_performance(
  p_organization_id UUID,
  p_scenario_id UUID,
  p_year INTEGER,
  p_month INTEGER,
  p_performance_count INTEGER,
  p_updated_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized: organization mismatch';
  END IF;

  IF p_performance_count = 0 THEN
    DELETE FROM manual_external_performances
    WHERE organization_id = p_organization_id
      AND scenario_master_id = p_scenario_id
      AND year = p_year
      AND month = p_month;

    RETURN jsonb_build_object('action', 'deleted', 'count', 0);
  END IF;

  INSERT INTO manual_external_performances (
    organization_id,
    scenario_master_id,
    year,
    month,
    performance_count,
    updated_by,
    updated_at
  ) VALUES (
    p_organization_id,
    p_scenario_id,
    p_year,
    p_month,
    p_performance_count,
    p_updated_by,
    NOW()
  )
  ON CONFLICT (organization_id, scenario_master_id, year, month)
  DO UPDATE SET
    performance_count = EXCLUDED.performance_count,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'action', 'upserted',
    'id', v_id,
    'count', p_performance_count
  );
END;
$$;

-- =====================================================
-- 6. RLSポリシー更新: org_scenario_survey_questions
-- =====================================================

DROP POLICY IF EXISTS "org_scenario_survey_questions_select_customer" ON public.org_scenario_survey_questions;
CREATE POLICY "org_scenario_survey_questions_select_customer" ON public.org_scenario_survey_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_scenarios os
      JOIN public.private_groups pg ON pg.scenario_master_id = os.scenario_master_id AND pg.organization_id = os.organization_id
      JOIN public.private_group_members pgm ON pgm.group_id = pg.id
      WHERE os.id = org_scenario_id
        AND pgm.user_id = auth.uid()
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'scenario_id → scenario_master_id リネームマイグレーション完了（後方互換）';
END $$;
