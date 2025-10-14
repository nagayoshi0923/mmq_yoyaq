-- 既存のGMアサインメントを全削除
-- ⚠️ 警告: このSQLは全てのGMアサインメントデータを削除します

DELETE FROM staff_scenario_assignments;

SELECT '✅ 既存のGMアサインメントを削除しました' as status;
