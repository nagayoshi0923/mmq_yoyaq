-- スタッフテーブルに「体験済みシナリオ」カラムを追加
-- 
-- シナリオの習熟度管理:
-- 1. experienced_scenarios: プレイヤーとして遊んだことがある（まだGMはできない）
-- 2. available_scenarios: GMができる
-- 3. want_to_learn: 覚えたいシナリオ

-- experienced_scenarios カラムを追加
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'staff' 
        AND column_name = 'experienced_scenarios'
    ) THEN
        ALTER TABLE staff 
        ADD COLUMN experienced_scenarios TEXT[] DEFAULT '{}';
        
        COMMENT ON COLUMN staff.experienced_scenarios IS 'プレイヤーとして体験済みのシナリオ（まだGMはできない）';
        
        RAISE NOTICE 'experienced_scenarios カラムを追加しました';
    ELSE
        RAISE NOTICE 'experienced_scenarios カラムは既に存在します';
    END IF;
END $$;

-- カラムの確認
SELECT 
    column_name,
    data_type,
    column_default,
    col_description('staff'::regclass, ordinal_position) as description
FROM information_schema.columns
WHERE table_name = 'staff' 
  AND column_name IN ('experienced_scenarios', 'available_scenarios', 'want_to_learn')
ORDER BY column_name;

-- 使用例のコメント
/*
シナリオの習熟度の流れ:

1. 初めて知る → want_to_learn に追加
   UPDATE staff SET want_to_learn = array_append(want_to_learn, 'グロリアメモリーズ') WHERE name = 'きゅう';

2. プレイヤーとして体験 → experienced_scenarios に追加
   UPDATE staff SET 
     experienced_scenarios = array_append(experienced_scenarios, 'グロリアメモリーズ'),
     want_to_learn = array_remove(want_to_learn, 'グロリアメモリーズ')
   WHERE name = 'きゅう';

3. GMができるようになる → available_scenarios に追加
   UPDATE staff SET 
     available_scenarios = array_append(available_scenarios, 'グロリアメモリーズ'),
     experienced_scenarios = array_remove(experienced_scenarios, 'グロリアメモリーズ')
   WHERE name = 'きゅう';

確認クエリ:
SELECT 
  name,
  array_length(want_to_learn, 1) as 覚えたい数,
  array_length(experienced_scenarios, 1) as 体験済み数,
  array_length(available_scenarios, 1) as GM可能数
FROM staff
WHERE 'gm' = ANY(role);
*/

