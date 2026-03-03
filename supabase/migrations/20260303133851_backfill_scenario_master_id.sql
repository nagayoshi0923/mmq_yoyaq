-- schedule_events の scenario_master_id を既存の scenario_id から補完
-- scenarios テーブルの scenario_master_id を使用してバックフィル
-- 作成日: 2026-03-03

-- scenarios テーブルには scenario_master_id カラムがあるので、それを直接使用

-- Step 1: schedule_events - scenarios.scenario_master_id を直接コピー
UPDATE schedule_events se
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE se.scenario_id = s.id
  AND se.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

-- Step 2: scenarios.scenario_master_id がない場合、titleでマッチング試行
UPDATE schedule_events se
SET scenario_master_id = sm.id
FROM scenarios s
JOIN scenario_masters sm ON LOWER(TRIM(s.title)) = LOWER(TRIM(sm.title))
WHERE se.scenario_id = s.id
  AND se.scenario_master_id IS NULL;

-- Step 3: reservations - scenarios.scenario_master_id を直接コピー
UPDATE reservations r
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE r.scenario_id = s.id
  AND r.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

-- Step 4: reservations - titleでマッチング
UPDATE reservations r
SET scenario_master_id = sm.id
FROM scenarios s
JOIN scenario_masters sm ON LOWER(TRIM(s.title)) = LOWER(TRIM(sm.title))
WHERE r.scenario_id = s.id
  AND r.scenario_master_id IS NULL;

-- Step 5: private_booking_requests - scenario_master_id カラムを追加（なければ）
ALTER TABLE private_booking_requests 
  ADD COLUMN IF NOT EXISTS scenario_master_id UUID REFERENCES scenario_masters(id) ON DELETE SET NULL;

-- Step 6: private_booking_requests - scenarios.scenario_master_id を直接コピー
UPDATE private_booking_requests pbr
SET scenario_master_id = s.scenario_master_id
FROM scenarios s
WHERE pbr.scenario_id = s.id
  AND pbr.scenario_master_id IS NULL
  AND s.scenario_master_id IS NOT NULL;

-- Step 7: private_booking_requests - titleでマッチング
UPDATE private_booking_requests pbr
SET scenario_master_id = sm.id
FROM scenarios s
JOIN scenario_masters sm ON LOWER(TRIM(s.title)) = LOWER(TRIM(sm.title))
WHERE pbr.scenario_id = s.id
  AND pbr.scenario_master_id IS NULL;

-- 確認
DO $$
DECLARE
  se_updated INTEGER;
  r_updated INTEGER;
  pbr_updated INTEGER;
  se_still_null INTEGER;
  r_still_null INTEGER;
  pbr_still_null INTEGER;
BEGIN
  -- バックフィル済みの件数
  SELECT COUNT(*) INTO se_updated FROM schedule_events 
    WHERE scenario_master_id IS NOT NULL;
  SELECT COUNT(*) INTO r_updated FROM reservations 
    WHERE scenario_master_id IS NOT NULL;
  SELECT COUNT(*) INTO pbr_updated FROM private_booking_requests 
    WHERE scenario_master_id IS NOT NULL;
  
  -- まだNULLの件数
  SELECT COUNT(*) INTO se_still_null FROM schedule_events 
    WHERE scenario_master_id IS NULL AND scenario_id IS NOT NULL;
  SELECT COUNT(*) INTO r_still_null FROM reservations 
    WHERE scenario_master_id IS NULL AND scenario_id IS NOT NULL;
  SELECT COUNT(*) INTO pbr_still_null FROM private_booking_requests 
    WHERE scenario_master_id IS NULL AND scenario_id IS NOT NULL;
  
  RAISE NOTICE 'バックフィル完了:';
  RAISE NOTICE '  schedule_events: %件設定済み, %件未マッチ', se_updated, se_still_null;
  RAISE NOTICE '  reservations: %件設定済み, %件未マッチ', r_updated, r_still_null;
  RAISE NOTICE '  private_booking_requests: %件設定済み, %件未マッチ', pbr_updated, pbr_still_null;
END $$;
