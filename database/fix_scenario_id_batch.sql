-- schedule_eventsのシナリオ名をマスタに合わせて修正し、scenario_idを設定

-- 1. 「季節マーダー／カノケリ」→「季節／カノケリ」に修正
UPDATE schedule_events
SET scenario = '季節／カノケリ',
    scenario_id = '4ed4f1dd-e0d7-439a-8fe5-f3403105429a'
WHERE scenario = '季節マーダー／カノケリ' AND scenario_id IS NULL;

-- 2. 「季節のマーダーミステリー／ニィホン」→「季節／ニィホン」に修正
UPDATE schedule_events
SET scenario = '季節／ニィホン',
    scenario_id = 'cb802ffb-2f54-4136-8b4e-a30b25be585b'
WHERE scenario = '季節のマーダーミステリー／ニィホン' AND scenario_id IS NULL;

-- 3. 「人狼村の悲劇」はマスタに存在しないため、scenario_idをNULLに設定
-- （シナリオマスタに追加するか、削除するか判断が必要）
-- UPDATE schedule_events SET scenario_id = NULL WHERE scenario = '人狼村の悲劇';

-- 4. 「学園の秘密」はマスタに存在しないため、scenario_idをNULLに設定
-- （シナリオマスタに追加するか、削除するか判断が必要）
-- UPDATE schedule_events SET scenario_id = NULL WHERE scenario = '学園の秘密';

-- 5. 「企業の陰謀」はマスタに存在しないため、scenario_idをNULLに設定
-- （シナリオマスタに追加するか、削除するか判断が必要）
-- UPDATE schedule_events SET scenario_id = NULL WHERE scenario = '企業の陰謀';

-- 6. 「古代遺跡の秘密」はマスタに存在しないため、scenario_idをNULLに設定
-- （シナリオマスタに追加するか、削除するか判断が必要）
-- UPDATE schedule_events SET scenario_id = NULL WHERE scenario = '古代遺跡の秘密';

-- 7. 「古城の呪い」はマスタに存在しないため、scenario_idをNULLに設定
-- （シナリオマスタに追加するか、削除するか判断が必要）
-- UPDATE schedule_events SET scenario_id = NULL WHERE scenario = '古城の呪い';

-- 8. 「密室の謎」はマスタに存在しないため、scenario_idをNULLに設定
-- （シナリオマスタに追加するか、削除するか判断が必要）
-- UPDATE schedule_events SET scenario_id = NULL WHERE scenario = '密室の謎';

-- 9. 「戦国武将の陰謀」はマスタに存在しないため、scenario_idをNULLに設定
-- （シナリオマスタに追加するか、削除するか判断が必要）
-- UPDATE schedule_events SET scenario_id = NULL WHERE scenario = '戦国武将の陰謀';

-- 10. 「時をかける少女」はマスタに存在しないため、scenario_idをNULLに設定
-- （シナリオマスタに追加するか、削除するか判断が必要）
-- UPDATE schedule_events SET scenario_id = NULL WHERE scenario = '時をかける少女';

-- 更新結果を確認
SELECT 
  COUNT(*) as 全公演数,
  COUNT(scenario_id) as ID設定済み,
  COUNT(*) - COUNT(scenario_id) as ID未設定
FROM schedule_events
WHERE date >= '2025-01-01';

-- まだIDが設定されていない公演を再確認
SELECT DISTINCT
  se.scenario as scenario_text,
  COUNT(*) as event_count
FROM schedule_events se
WHERE se.scenario_id IS NULL
  AND se.scenario IS NOT NULL
  AND se.scenario != ''
  AND se.date >= '2025-01-01'
GROUP BY se.scenario
ORDER BY event_count DESC;

