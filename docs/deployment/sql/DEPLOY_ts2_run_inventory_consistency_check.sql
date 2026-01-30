-- DEPLOY TS-2: 在庫整合性チェックの手動実行（置換不要）

-- 手動で在庫整合性チェックを実行
SELECT run_inventory_consistency_check();

-- 結果を確認（直近5件）
SELECT *
FROM inventory_consistency_logs
ORDER BY checked_at DESC
LIMIT 5;

