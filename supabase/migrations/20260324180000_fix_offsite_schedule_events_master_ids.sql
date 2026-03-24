-- =============================================================================
-- 花街叙情物語: 重複 scenario_masters を正式マスタへ統合 + 公演・参照の付け替え
-- ピアニストは音と共に: マスタ title を正式表記（接頭辞なし）に揃える
--
-- 正式マスタ（花街）: 2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5  title = 花街叙情物語
-- 統合元（削除）:
--   7838a17e-7622-4fc5-84cb-3017525c0d64  【出張公演】花街叙情物語
--   08e37f2c-88ba-4515-bff8-a8cab98b72e4  【出張公演】花街叙情物語
-- ピアニストマスタ: 046cafae-49cb-42e6-b4ae-74bbb489c06f
-- =============================================================================

-- 1) 同一顧客が「重複マスタ」と「正式マスタ」の両方にいいね/評価している場合は重複側を削除
DELETE FROM scenario_ratings sr_dup
WHERE sr_dup.scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
)
AND EXISTS (
  SELECT 1
  FROM scenario_ratings sr_can
  WHERE sr_can.customer_id = sr_dup.customer_id
    AND sr_can.scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
);

DELETE FROM scenario_likes sl_dup
WHERE sl_dup.scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
)
AND EXISTS (
  SELECT 1
  FROM scenario_likes sl_can
  WHERE sl_can.customer_id = sl_dup.customer_id
    AND sl_can.scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
);

-- 2) organization_scenarios: 同一組織に正式行がある重複行へ紐づく公演を正式行に付け替え → 重複行削除
UPDATE schedule_events se
SET organization_scenario_id = os_can.id
FROM organization_scenarios os_dup
JOIN organization_scenarios os_can
  ON os_can.organization_id = os_dup.organization_id
 AND os_can.scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE se.organization_scenario_id = os_dup.id
  AND os_dup.scenario_master_id IN (
    '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
    '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
  );

DELETE FROM organization_scenarios os_dup
WHERE os_dup.scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
)
AND EXISTS (
  SELECT 1
  FROM organization_scenarios os_can
  WHERE os_can.organization_id = os_dup.organization_id
    AND os_can.scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
);

-- 2b) 同一組織に重複マスタ用 org_scenario が複数残っている場合、公演参照を id 最小の1件に集約
--     （FROM 内の JOIN で更新対象 se を参照すると Postgres でエラーになるため WHERE で結合）
UPDATE schedule_events se
SET organization_scenario_id = k.keep_id
FROM (
  -- MIN(uuid) は古い Postgres で未定義のため text 経由
  SELECT organization_id, (MIN(id::text))::uuid AS keep_id
  FROM organization_scenarios
  WHERE scenario_master_id IN (
    '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
    '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
  )
  GROUP BY organization_id
) k
INNER JOIN organization_scenarios os
  ON os.organization_id = k.organization_id
 AND os.scenario_master_id IN (
    '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
    '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
  )
WHERE se.organization_scenario_id = os.id
  AND se.organization_scenario_id IS DISTINCT FROM k.keep_id;

DELETE FROM organization_scenarios os
WHERE os.scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
)
AND os.id <> (
  SELECT (MIN(os2.id::text))::uuid
  FROM organization_scenarios os2
  WHERE os2.organization_id = os.organization_id
    AND os2.scenario_master_id IN (
      '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
      '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
    )
);

-- 3) 残った organization_scenarios（正式行が無かった組織のみ残る）は scenario_master_id を正式へ
UPDATE organization_scenarios
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

-- 4) その他テーブル: scenario_master_id（または scenario_id がマスタ参照のもの）を付け替え
UPDATE schedule_events
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE reservations
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE scenario_likes
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE manual_play_history
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE external_performance_reports
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE miscellaneous_transactions
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE performance_kits
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE scenario_kit_locations
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE scenario_characters
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE scenario_ratings
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_master_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE private_groups
SET scenario_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

UPDATE staff_scenario_assignments
SET scenario_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE scenario_id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

-- 5) 重複マスタ行を削除（参照はすべて正式IDへ寄せ済み）
DELETE FROM scenario_masters
WHERE id IN (
  '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
  '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
);

-- 6) ピアニスト: マスタ表記を花街と同様（接頭辞なし）に統一
UPDATE scenario_masters
SET title = 'ピアニストは音と共に'
WHERE id = '046cafae-49cb-42e6-b4ae-74bbb489c06f'::uuid
  AND title = '【出張公演】ピアニストは音と共に';

-- 7) 出張公演でまだ scenario_master_id が空の行を正式IDへ（テキスト一致）
UPDATE schedule_events
SET scenario_master_id = '2b7d9c1d-bcbb-4d9a-9f88-8b201aa368d5'::uuid
WHERE category = 'offsite'
  AND scenario_master_id IS NULL
  AND TRIM(REGEXP_REPLACE(scenario, '^【出張公演】\s*', '')) = '花街叙情物語';

UPDATE schedule_events
SET scenario_master_id = '046cafae-49cb-42e6-b4ae-74bbb489c06f'::uuid
WHERE category = 'offsite'
  AND scenario_master_id IS NULL
  AND TRIM(REGEXP_REPLACE(scenario, '^【出張公演】\s*', '')) = 'ピアニストは音と共に';

-- 8) organization_scenario_id の補完
UPDATE schedule_events se
SET organization_scenario_id = os.id
FROM organization_scenarios os
WHERE se.organization_scenario_id IS NULL
  AND se.category = 'offsite'
  AND se.scenario_master_id IS NOT NULL
  AND se.organization_id = os.organization_id
  AND se.scenario_master_id = os.scenario_master_id
  AND TRIM(REGEXP_REPLACE(se.scenario, '^【出張公演】\s*', '')) IN (
    '花街叙情物語',
    'ピアニストは音と共に'
  );

DO $$
DECLARE
  n_dup_masters INTEGER;
BEGIN
  SELECT COUNT(*) INTO n_dup_masters
  FROM scenario_masters
  WHERE id IN (
    '7838a17e-7622-4fc5-84cb-3017525c0d64'::uuid,
    '08e37f2c-88ba-4515-bff8-a8cab98b72e4'::uuid
  );
  IF n_dup_masters > 0 THEN
    RAISE WARNING 'scenario_masters に重複IDが残っています（外部キー参照が残っている可能性）: %', n_dup_masters;
  ELSE
    RAISE NOTICE '花街叙情物語の重複マスタ統合完了（削除済み）';
  END IF;
END $$;
