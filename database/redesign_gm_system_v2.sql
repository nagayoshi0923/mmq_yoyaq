-- GMシステムの再設計 v2
-- 
-- 習熟度の明確な定義:
-- 1. 覚えたい (want_to_learn): まだ遊んだことがない
-- 2. 体験済み (experienced): プレイヤーとして遊んだが、GM業務は一切できない
-- 3. サブGMのみ可能: サブGMはできるが、メインGMはできない
-- 4. メインGM可能: メインGMができる（サブGMも可能）
-- 5. メインのみ可能: メインGMはできるが、サブGMはできない（特殊ケース）

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
        
        COMMENT ON COLUMN staff_scenario_assignments.can_main_gm IS 'メインGMができるかどうか';
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

-- is_experienced カラムを追加（体験済みかどうか）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'staff_scenario_assignments' 
        AND column_name = 'is_experienced'
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD COLUMN is_experienced BOOLEAN DEFAULT false;
        
        COMMENT ON COLUMN staff_scenario_assignments.is_experienced IS 'プレイヤーとして体験済みかどうか（GMはまだできない）';
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
    'scenarios テーブル' as table_info,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'scenarios' 
  AND column_name IN ('requires_sub_gm', 'gm_count_required')
ORDER BY column_name;

-- staff_scenario_assignmentsテーブルの新しいカラムを確認
SELECT 
    'staff_scenario_assignments テーブル' as table_info,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name = 'staff_scenario_assignments'
  AND column_name IN ('can_main_gm', 'can_sub_gm', 'is_experienced', 'experienced_at', 'can_gm_at')
ORDER BY column_name;

-- ===========================
-- 使用例
-- ===========================

/*
パターン別の設定例:

1. 通常のシナリオ（GM1人）
   - グロリアメモリーズ
   UPDATE scenarios SET requires_sub_gm = false, gm_count_required = 1 WHERE title = 'グロリアメモリーズ';
   
   - きゅう: メインGMができる
   INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced)
   VALUES (
     (SELECT id FROM staff WHERE name = 'きゅう'),
     (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ'),
     true,
     false,
     false
   );

2. 2人GM必要なシナリオ（モノクローム）
   UPDATE scenarios SET requires_sub_gm = true, gm_count_required = 2 WHERE title = 'モノクローム';
   
   パターンA: メイン・サブ両方可能
   - りえぞー、しらやま
   can_main_gm = true, can_sub_gm = true, is_experienced = false
   
   パターンB: メインのみ可能
   - えりん、崎、じの
   can_main_gm = true, can_sub_gm = false, is_experienced = false
   
   パターンC: サブのみ可能
   - みずき、きゅう、labo、モリシ
   can_main_gm = false, can_sub_gm = true, is_experienced = false

3. 体験済み（GM一切できない）
   can_main_gm = false, can_sub_gm = false, is_experienced = true

GMアサイン時のクエリ例:

-- モノクロームのメインGM可能なスタッフ
SELECT s.name
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = 'モノクローム' AND ssa.can_main_gm = true
ORDER BY s.name;

-- モノクロームのサブGM可能なスタッフ
SELECT 
  s.name,
  CASE 
    WHEN ssa.can_main_gm AND ssa.can_sub_gm THEN 'メイン・サブ両方可能'
    WHEN NOT ssa.can_main_gm AND ssa.can_sub_gm THEN 'サブのみ可能'
  END as GM種別
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE sc.title = 'モノクローム' AND ssa.can_sub_gm = true
ORDER BY ssa.can_main_gm DESC, s.name;

-- 習熟度サマリー
SELECT 
  s.name as スタッフ名,
  COUNT(CASE WHEN ssa.is_experienced THEN 1 END) as 体験済み,
  COUNT(CASE WHEN ssa.can_sub_gm AND NOT ssa.can_main_gm THEN 1 END) as サブGMのみ,
  COUNT(CASE WHEN ssa.can_main_gm THEN 1 END) as メインGM可能
FROM staff s
LEFT JOIN staff_scenario_assignments ssa ON s.id = ssa.staff_id
WHERE 'gm' = ANY(s.role)
GROUP BY s.name
ORDER BY s.name;
*/

