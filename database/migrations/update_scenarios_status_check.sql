-- ============================================================
-- scenariosテーブルのstatus CHECK制約を更新
-- 新しいステータス値を追加: 'draft', 'unavailable'
-- 2026-01-09
-- ============================================================

-- 既存のCHECK制約を削除
ALTER TABLE scenarios DROP CONSTRAINT IF EXISTS scenarios_status_check;

-- 新しいCHECK制約を追加（draft, unavailableを追加）
ALTER TABLE scenarios ADD CONSTRAINT scenarios_status_check 
  CHECK (status IN ('available', 'maintenance', 'retired', 'draft', 'unavailable'));

-- 確認
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'scenarios'::regclass
  AND contype = 'c';

-- ============================================================
-- 参考: 各ステータスの意味
-- ============================================================
-- available: 公開中（予約可能）
-- maintenance: メンテナンス中（一時的に非公開）
-- retired: 引退（完全に非公開）
-- draft: 下書き（未公開、編集中）
-- unavailable: 利用不可（公開停止）
-- ============================================================



