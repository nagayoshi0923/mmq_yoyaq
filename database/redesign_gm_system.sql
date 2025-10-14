-- GMシステムの再設計
-- 
-- 習熟度の定義:
-- 1. want_to_learn: 覚えたい（まだ遊んだことがない）
-- 2. experienced: 体験済み（プレイヤーとして遊んだが、GMはまだできない）
-- 3. can_gm: メインGMができる
--
-- サブGM:
-- - 一部のシナリオは2人以上のGMが必要
-- - そのような場合に補助するGMを「サブGM」と呼ぶ
-- - サブGMは別のカラムで管理

-- ===========================
-- パート1: scenariosテーブルの拡張
-- ===========================

-- requires_sub_gm カラムを追加（サブGMが必要かどうか）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'scenarios' AND column_name = 'requires_sub_gm'
    ) THEN
        ALTER TABLE scenarios ADD COLUMN requires_sub_gm BOOLEAN DEFAULT false;
        COMMENT ON COLUMN scenarios.requires_sub_gm IS 'サブGMが必要なシナリオかどうか';
    END IF;
END $$;

-- gm_count_required カラムを追加（必要なGM人数）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'scenarios' AND column_name = 'gm_count_required'
    ) THEN
        ALTER TABLE scenarios ADD COLUMN gm_count_required INTEGER DEFAULT 1;
        COMMENT ON COLUMN scenarios.gm_count_required IS '必要なGM人数（通常1、サブGM必要なら2以上）';
    END IF;
END $$;

-- ===========================
-- パート2: staff_scenario_assignmentsテーブルの拡張
-- ===========================

-- status カラムを追加（習熟度）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'staff_scenario_assignments' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD COLUMN status TEXT DEFAULT 'can_gm' 
        CHECK (status IN ('want_to_learn', 'experienced', 'can_gm'));
        
        COMMENT ON COLUMN staff_scenario_assignments.status IS '習熟度: want_to_learn=覚えたい, experienced=体験済み, can_gm=メインGMができる';
    END IF;
END $$;

-- can_sub_gm カラムを追加（サブGMができるかどうか）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'staff_scenario_assignments' 
        AND column_name = 'can_sub_gm'
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD COLUMN can_sub_gm BOOLEAN DEFAULT false;
        
        COMMENT ON COLUMN staff_scenario_assignments.can_sub_gm IS 'サブGMができるかどうか（2人以上必要なシナリオ用）';
    END IF;
END $$;

-- experienced_at カラムを追加（体験日）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'staff_scenario_assignments' 
        AND column_name = 'experienced_at'
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD COLUMN experienced_at TIMESTAMPTZ;
        
        COMMENT ON COLUMN staff_scenario_assignments.experienced_at IS 'プレイヤーとして体験した日時';
    END IF;
END $$;

-- can_gm_at カラムを追加（GM可能になった日）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'staff_scenario_assignments' 
        AND column_name = 'can_gm_at'
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD COLUMN can_gm_at TIMESTAMPTZ;
        
        COMMENT ON COLUMN staff_scenario_assignments.can_gm_at IS 'メインGMができるようになった日時';
    END IF;
END $$;

-- ===========================
-- 確認
-- ===========================

-- scenariosテーブルの新しいカラムを確認
SELECT 
    'scenarios' as table_name,
    column_name,
    data_type,
    column_default,
    col_description('scenarios'::regclass, ordinal_position) as description
FROM information_schema.columns
WHERE table_name = 'scenarios' 
  AND column_name IN ('requires_sub_gm', 'gm_count_required')
ORDER BY column_name;

-- staff_scenario_assignmentsテーブルの新しいカラムを確認
SELECT 
    'staff_scenario_assignments' as table_name,
    column_name,
    data_type,
    column_default,
    col_description('staff_scenario_assignments'::regclass, ordinal_position) as description
FROM information_schema.columns
WHERE table_name = 'staff_scenario_assignments'
  AND column_name IN ('status', 'can_sub_gm', 'experienced_at', 'can_gm_at')
ORDER BY column_name;

-- 使用例
/*
例1: モノクロームはメインとサブが必要

-- シナリオ設定
UPDATE scenarios
SET 
  requires_sub_gm = true,
  gm_count_required = 2
WHERE title = 'モノクローム';

-- りえぞー: メインGMもサブGMもできる
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, status, can_sub_gm)
VALUES (
  (SELECT id FROM staff WHERE name = 'りえぞー'),
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  'can_gm',
  true
) ON CONFLICT (staff_id, scenario_id) DO UPDATE SET status = 'can_gm', can_sub_gm = true;

-- えりん: メインGMのみ可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, status, can_sub_gm)
VALUES (
  (SELECT id FROM staff WHERE name = 'えりん'),
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  'can_gm',
  false
) ON CONFLICT (staff_id, scenario_id) DO UPDATE SET status = 'can_gm', can_sub_gm = false;

-- みずき: サブGMのみ可能（メインはまだできない）
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, status, can_sub_gm)
VALUES (
  (SELECT id FROM staff WHERE name = 'みずき'),
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  'experienced',
  true
) ON CONFLICT (staff_id, scenario_id) DO UPDATE SET status = 'experienced', can_sub_gm = true;

-- GMアサイン時のクエリ
SELECT 
  s.name as スタッフ名,
  ssa.status as 習熟度,
  CASE 
    WHEN ssa.status = 'can_gm' AND ssa.can_sub_gm THEN 'メイン・サブ両方可能'
    WHEN ssa.status = 'can_gm' AND NOT ssa.can_sub_gm THEN 'メインのみ可能'
    WHEN ssa.status = 'experienced' AND ssa.can_sub_gm THEN 'サブのみ可能'
    ELSE '体験済み'
  END as GM可能状況
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = 'モノクローム'
ORDER BY ssa.status DESC, ssa.can_sub_gm DESC, s.name;
*/

