-- =============================================================================
-- 公演中止判定のcronジョブ状態確認
-- =============================================================================
-- 
-- このSQLを実行すると、公演中止判定に関連するcronジョブの状態を確認できます
-- =============================================================================

-- 1. 公演中止判定に関連するcronジョブを確認
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  CASE 
    WHEN active THEN '有効'
    ELSE '無効'
  END as status_jp,
  command
FROM cron.job 
WHERE jobname LIKE '%check-performance%' 
   OR jobname LIKE '%performance%cancellation%'
   OR command LIKE '%check-performance-cancellation%'
ORDER BY jobname;

-- 2. ジョブが存在しない場合のメッセージ
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM cron.job 
  WHERE jobname LIKE '%check-performance%' 
     OR jobname LIKE '%performance%cancellation%'
     OR command LIKE '%check-performance-cancellation%';
  
  IF v_count = 0 THEN
    RAISE NOTICE 'ℹ️  公演中止判定のcronジョブは設定されていません';
  ELSE
    RAISE NOTICE '✅ % 個のcronジョブが見つかりました', v_count;
  END IF;
END $$;
