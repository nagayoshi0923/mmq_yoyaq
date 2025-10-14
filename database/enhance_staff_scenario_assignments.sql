-- staff_scenario_assignments テーブルを拡張
-- シナリオの習熟度ステータスを管理
--
-- この方法の利点:
-- - より柔軟な管理（日付、メモなども記録可能）
-- - リレーショナルな設計
-- - 複雑なクエリが可能

-- status カラムを追加
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'staff_scenario_assignments' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD COLUMN status TEXT DEFAULT 'can_gm' CHECK (status IN ('want_to_learn', 'experienced', 'can_gm', 'main_gm'));
        
        COMMENT ON COLUMN staff_scenario_assignments.status IS 'シナリオの習熟度: want_to_learn=覚えたい, experienced=体験済み, can_gm=GM可能, main_gm=メインGM';
        
        RAISE NOTICE 'status カラムを追加しました';
    ELSE
        RAISE NOTICE 'status カラムは既に存在します';
    END IF;
END $$;

-- experienced_at カラムを追加（体験日）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'staff_scenario_assignments' 
        AND column_name = 'experienced_at'
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD COLUMN experienced_at TIMESTAMPTZ;
        
        COMMENT ON COLUMN staff_scenario_assignments.experienced_at IS 'プレイヤーとして体験した日時';
        
        RAISE NOTICE 'experienced_at カラムを追加しました';
    ELSE
        RAISE NOTICE 'experienced_at カラムは既に存在します';
    END IF;
END $$;

-- can_gm_at カラムを追加（GM可能になった日）
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'staff_scenario_assignments' 
        AND column_name = 'can_gm_at'
    ) THEN
        ALTER TABLE staff_scenario_assignments 
        ADD COLUMN can_gm_at TIMESTAMPTZ;
        
        COMMENT ON COLUMN staff_scenario_assignments.can_gm_at IS 'GMができるようになった日時';
        
        RAISE NOTICE 'can_gm_at カラムを追加しました';
    ELSE
        RAISE NOTICE 'can_gm_at カラムは既に存在します';
    END IF;
END $$;

-- テーブル構造の確認
SELECT 
    column_name,
    data_type,
    column_default,
    col_description('staff_scenario_assignments'::regclass, ordinal_position) as description
FROM information_schema.columns
WHERE table_name = 'staff_scenario_assignments'
ORDER BY ordinal_position;

-- 使用例のコメント
/*
ステータスの種類:
- want_to_learn: 覚えたい（まだ遊んだことがない）
- experienced: 体験済み（プレイヤーとして遊んだが、GMはまだできない）
- can_gm: GM可能（サブGMができる）
- main_gm: メインGM可能（メインGMができる）

データ登録例:

1. 覚えたいシナリオを登録
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, status)
VALUES (
  (SELECT id FROM staff WHERE name = 'きゅう'),
  (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ'),
  'want_to_learn'
);

2. 体験済みに更新
UPDATE staff_scenario_assignments
SET 
  status = 'experienced',
  experienced_at = NOW(),
  notes = 'プレイヤーとして参加'
WHERE 
  staff_id = (SELECT id FROM staff WHERE name = 'きゅう')
  AND scenario_id = (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ');

3. GM可能に更新
UPDATE staff_scenario_assignments
SET 
  status = 'can_gm',
  can_gm_at = NOW(),
  notes = 'GMテスト合格'
WHERE 
  staff_id = (SELECT id FROM staff WHERE name = 'きゅう')
  AND scenario_id = (SELECT id FROM scenarios WHERE title = 'グロリアメモリーズ');

確認クエリ:
SELECT 
  s.name as スタッフ名,
  sc.title as シナリオ名,
  ssa.status as 習熟度,
  ssa.experienced_at as 体験日,
  ssa.can_gm_at as GM可能日,
  ssa.notes as 備考
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE s.name = 'きゅう'
ORDER BY ssa.status, sc.title;

-- GM可能なスタッフを検索
SELECT 
  sc.title as シナリオ名,
  STRING_AGG(s.name, ', ' ORDER BY s.name) as GM可能なスタッフ
FROM staff_scenario_assignments ssa
INNER JOIN staff s ON ssa.staff_id = s.id
INNER JOIN scenarios sc ON ssa.scenario_id = sc.id
WHERE ssa.status IN ('can_gm', 'main_gm')
GROUP BY sc.title
ORDER BY sc.title;
*/

