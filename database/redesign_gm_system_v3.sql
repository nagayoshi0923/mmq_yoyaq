-- GMシステムの再設計 v3（最終版）
-- 
-- 重要な前提:
-- GMができる状態 = 必ずプレイヤーとして体験済み
-- 
-- 習熟度の定義:
-- 1. 覚えたい: まだ遊んだことがない → データなし or 別管理
-- 2. 体験済み（is_experienced = true）: プレイヤーとして遊んだが、GMは一切できない
-- 3. サブGMのみ可能（can_sub_gm = true, can_main_gm = false）: サブGMはできるが、メインGMはできない
-- 4. メインGMのみ可能（can_main_gm = true, can_sub_gm = false）: メインGMのみ（サブはできない、特殊ケース）
-- 5. メイン・サブ両方可能（can_main_gm = true, can_sub_gm = true）: 最も柔軟

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
        COMMENT ON COLUMN scenarios.requires_sub_gm IS 'サブGMが必要なシナリオかどうか（2人以上のGMが必要）';
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

-- can_main_gm カラムを追加（メインGMができるかどうか）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'staff_scenario_assignments' 
        AND column_name = 'can_main_gm'
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD COLUMN can_main_gm BOOLEAN DEFAULT false;
        
        COMMENT ON COLUMN staff_scenario_assignments.can_main_gm IS 'メインGMができるかどうか（体験済み前提）';
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
        
        COMMENT ON COLUMN staff_scenario_assignments.can_sub_gm IS 'サブGMができるかどうか（2人以上必要なシナリオ用、体験済み前提）';
    END IF;
END $$;

-- is_experienced カラムを追加（体験済みだがGMはできない）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'staff_scenario_assignments' 
        AND column_name = 'is_experienced'
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD COLUMN is_experienced BOOLEAN DEFAULT false;
        
        COMMENT ON COLUMN staff_scenario_assignments.is_experienced IS 'プレイヤーとして体験済みだが、GMは一切できない';
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
        
        COMMENT ON COLUMN staff_scenario_assignments.can_gm_at IS 'メインGMまたはサブGMができるようになった日時';
    END IF;
END $$;

-- ===========================
-- パート3: データ整合性チェック制約
-- ===========================

-- チェック制約: GMができる場合、is_experienced は false
-- （GMができる = 体験済みは当然なので、is_experiencedフラグは不要）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'gm_experienced_check' 
        AND conrelid = 'staff_scenario_assignments'::regclass
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD CONSTRAINT gm_experienced_check 
        CHECK (
          -- GMができる場合、is_experiencedはfalse
          (can_main_gm = true OR can_sub_gm = true) AND is_experienced = false
          OR
          -- is_experiencedがtrueの場合、GMは両方false
          is_experienced = true AND can_main_gm = false AND can_sub_gm = false
          OR
          -- すべてfalseも許可（覚えたい状態）
          is_experienced = false AND can_main_gm = false AND can_sub_gm = false
        );
        
        RAISE NOTICE 'データ整合性チェック制約を追加しました';
    END IF;
END $$;

-- ===========================
-- 確認
-- ===========================

SELECT 
  '✅ GMシステムの再設計が完了しました' as status;

-- scenariosテーブルの新しいカラムを確認
SELECT 
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
  column_name,
  data_type,
  column_default,
  col_description('staff_scenario_assignments'::regclass, ordinal_position) as description
FROM information_schema.columns
WHERE table_name = 'staff_scenario_assignments'
  AND column_name IN ('can_main_gm', 'can_sub_gm', 'is_experienced', 'experienced_at', 'can_gm_at')
ORDER BY column_name;

-- 制約の確認
SELECT
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'staff_scenario_assignments'::regclass
  AND conname = 'gm_experienced_check';

-- ===========================
-- 使用例とビュー
-- ===========================

/*
状態のパターン:

1. プレイヤーとして遊んだだけ（GMできない）
   can_main_gm = false, can_sub_gm = false, is_experienced = true

2. サブGMのみ可能（体験済み前提）
   can_main_gm = false, can_sub_gm = true, is_experienced = false

3. メインGMのみ可能（体験済み前提）
   can_main_gm = true, can_sub_gm = false, is_experienced = false

4. メイン・サブ両方可能（体験済み前提）
   can_main_gm = true, can_sub_gm = true, is_experienced = false

5. 未体験（データなし）
   レコード自体が存在しない、または全てfalse

データ登録例:

-- 体験済み（GMできない）
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, is_experienced, experienced_at)
VALUES (
  (SELECT id FROM staff WHERE name = 'さく'),
  (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ'),
  true,
  NOW()
);

-- サブGMのみ可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_sub_gm, can_gm_at)
VALUES (
  (SELECT id FROM staff WHERE name = 'みずき'),
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  true,
  NOW()
);

-- メインGM可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at)
VALUES (
  (SELECT id FROM staff WHERE name = 'きゅう'),
  (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ'),
  true,
  NOW()
);

-- メイン・サブ両方可能
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at)
VALUES (
  (SELECT id FROM staff WHERE name = 'りえぞー'),
  (SELECT id FROM scenarios WHERE title = 'モノクローム'),
  true,
  true,
  NOW()
);

便利なビュー:

-- スタッフの習熟度ビュー
CREATE OR REPLACE VIEW staff_scenario_proficiency AS
SELECT 
  s.id as staff_id,
  s.name as staff_name,
  sc.id as scenario_id,
  sc.title as scenario_title,
  CASE 
    WHEN ssa.can_main_gm AND ssa.can_sub_gm THEN 'メイン・サブ両方可能'
    WHEN ssa.can_main_gm AND NOT ssa.can_sub_gm THEN 'メインのみ可能'
    WHEN NOT ssa.can_main_gm AND ssa.can_sub_gm THEN 'サブのみ可能'
    WHEN ssa.is_experienced THEN '体験済み（GMできない）'
    ELSE '未体験'
  END as proficiency_level,
  ssa.can_main_gm,
  ssa.can_sub_gm,
  ssa.is_experienced,
  ssa.experienced_at,
  ssa.can_gm_at,
  ssa.notes
FROM staff s
CROSS JOIN scenarios sc
LEFT JOIN staff_scenario_assignments ssa ON s.id = ssa.staff_id AND sc.id = ssa.scenario_id
WHERE 'gm' = ANY(s.role) OR ssa.staff_id IS NOT NULL;

-- 使用例:
SELECT * FROM staff_scenario_proficiency WHERE scenario_title = 'モノクローム';
*/

