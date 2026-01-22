-- ============================================================
-- 既存シナリオをscenario_mastersに移行するスクリプト
-- 実行日: 2026-01-22
-- 
-- 概要:
-- - scenariosテーブルの scenario_master_id が NULL のシナリオを対象
-- - 各シナリオに対応する scenario_masters レコードを作成
-- - scenarios.scenario_master_id を更新
-- - master_status = 'approved' で作成（即座にMMQトップに表示される）
--
-- 注意:
-- - 本番環境で実行する前に必ずバックアップを取得してください
-- - 移行対象のシナリオ数を確認してから実行してください
-- ============================================================

-- ============================================================
-- STEP 0: 移行前の状態を確認
-- ============================================================
SELECT 
  'scenarios' as table_name,
  COUNT(*) as total,
  COUNT(scenario_master_id) as with_master,
  COUNT(*) - COUNT(scenario_master_id) as without_master
FROM scenarios;

SELECT 
  'scenario_masters' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE master_status = 'approved') as approved,
  COUNT(*) FILTER (WHERE master_status = 'pending') as pending,
  COUNT(*) FILTER (WHERE master_status = 'draft') as draft
FROM scenario_masters;

-- ============================================================
-- STEP 1: scenario_masters に存在しないシナリオをマスタとして追加
-- ============================================================
-- organization_id でクインズワルツ（または全組織）を対象にする

-- まず、移行対象のシナリオを確認
SELECT id, title, author, organization_id, scenario_master_id
FROM scenarios
WHERE scenario_master_id IS NULL
  AND status = 'available'
ORDER BY title
LIMIT 10;

-- ============================================================
-- STEP 2: マスタを作成し、シナリオに紐付ける（トランザクション）
-- ============================================================
-- 以下のSQLを実行してマスタを作成

DO $$
DECLARE
  scenario_rec RECORD;
  new_master_id UUID;
  migrated_count INTEGER := 0;
BEGIN
  -- scenario_master_id が NULL のシナリオをループ
  FOR scenario_rec IN 
    SELECT 
      id, title, author, author_email, description, key_visual_url,
      player_count_min, player_count_max, duration, genre, difficulty,
      organization_id, status
    FROM scenarios
    WHERE scenario_master_id IS NULL
      AND status IN ('available', 'unavailable', 'draft')  -- 有効なシナリオのみ
    ORDER BY title
  LOOP
    -- 新しいマスタを作成
    INSERT INTO scenario_masters (
      title,
      author,
      key_visual_url,
      description,
      player_count_min,
      player_count_max,
      official_duration,
      genre,
      difficulty,
      master_status,
      submitted_by_organization_id
    ) VALUES (
      scenario_rec.title,
      scenario_rec.author,
      scenario_rec.key_visual_url,
      scenario_rec.description,
      scenario_rec.player_count_min,
      scenario_rec.player_count_max,
      scenario_rec.duration,
      COALESCE(scenario_rec.genre, '{}'),
      scenario_rec.difficulty::TEXT,
      'approved',  -- 承認済みとして作成
      scenario_rec.organization_id
    )
    RETURNING id INTO new_master_id;
    
    -- シナリオにマスタIDを紐付け
    UPDATE scenarios
    SET scenario_master_id = new_master_id,
        updated_at = NOW()
    WHERE id = scenario_rec.id;
    
    migrated_count := migrated_count + 1;
    
    -- 進捗ログ（10件ごと）
    IF migrated_count % 10 = 0 THEN
      RAISE NOTICE '移行進捗: % 件完了', migrated_count;
    END IF;
  END LOOP;
  
  RAISE NOTICE '==============================';
  RAISE NOTICE '移行完了: % 件のシナリオをマスタに移行しました', migrated_count;
  RAISE NOTICE '==============================';
END $$;

-- ============================================================
-- STEP 3: 移行後の状態を確認
-- ============================================================
SELECT 
  'scenarios (移行後)' as table_name,
  COUNT(*) as total,
  COUNT(scenario_master_id) as with_master,
  COUNT(*) - COUNT(scenario_master_id) as without_master
FROM scenarios;

SELECT 
  'scenario_masters (移行後)' as table_name,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE master_status = 'approved') as approved,
  COUNT(*) FILTER (WHERE master_status = 'pending') as pending,
  COUNT(*) FILTER (WHERE master_status = 'draft') as draft
FROM scenario_masters;

-- 移行されたシナリオの確認（最初の10件）
SELECT 
  s.title,
  s.author,
  s.scenario_master_id,
  sm.master_status,
  sm.title as master_title
FROM scenarios s
JOIN scenario_masters sm ON s.scenario_master_id = sm.id
ORDER BY s.title
LIMIT 10;

-- ============================================================
-- 完了
-- ============================================================
SELECT '✅ 移行スクリプト実行完了' as result;

