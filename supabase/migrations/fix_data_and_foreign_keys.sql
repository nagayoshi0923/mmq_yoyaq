-- ========================================
-- データ整合性修正 + 外部キー制約修正
-- ========================================
-- 問題：auth.users にはユーザーが存在するが、public.users に存在しない
--       → トリガーが正常に動作していなかった証拠
-- 
-- 対応：
-- 1. 不整合なデータを修正（NULLに設定）
-- 2. 外部キー制約を修正（ON DELETE SET NULL）
-- ========================================

BEGIN;

-- ========================================
-- ステップ1: データ整合性の修正
-- ========================================

-- 存在しないユーザーを参照しているレコードをNULLに設定
UPDATE public.reservations
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND created_by NOT IN (SELECT id FROM public.users);

UPDATE public.reservations
SET customer_id = NULL
WHERE customer_id IS NOT NULL
  AND customer_id NOT IN (SELECT id FROM public.users);

UPDATE public.daily_memos
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND created_by NOT IN (SELECT id FROM public.users);

UPDATE public.daily_memos
SET updated_by = NULL
WHERE updated_by IS NOT NULL
  AND updated_by NOT IN (SELECT id FROM public.users);

-- ========================================
-- ステップ2: 外部キー制約の修正
-- ========================================

-- 【1】 reservations.created_by
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_created_by_fkey,
  ADD CONSTRAINT reservations_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES public.users(id)
    ON DELETE SET NULL
    ON UPDATE NO ACTION;

-- 【2】 reservations.customer_id  
-- ※ 既にCASCADEだが、念のため明示的に再作成
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_customer_id_fkey,
  ADD CONSTRAINT reservations_customer_id_fkey
    FOREIGN KEY (customer_id)
    REFERENCES public.users(id)
    ON DELETE CASCADE
    ON UPDATE NO ACTION;

-- 【3】 daily_memos.created_by
ALTER TABLE public.daily_memos
  DROP CONSTRAINT IF EXISTS daily_memos_created_by_fkey,
  ADD CONSTRAINT daily_memos_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES public.users(id)
    ON DELETE SET NULL
    ON UPDATE NO ACTION;

-- 【4】 daily_memos.updated_by
ALTER TABLE public.daily_memos
  DROP CONSTRAINT IF EXISTS daily_memos_updated_by_fkey,
  ADD CONSTRAINT daily_memos_updated_by_fkey
    FOREIGN KEY (updated_by)
    REFERENCES public.users(id)
    ON DELETE SET NULL
    ON UPDATE NO ACTION;

COMMIT;

-- ========================================
-- 修正確認
-- ========================================

-- 整合性チェック
SELECT 
  '【整合性チェック】' as check_type,
  'reservations.created_by' as column_name,
  COUNT(*) as invalid_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ 整合性OK'
    ELSE '❌ 不整合あり'
  END as status
FROM public.reservations
WHERE created_by IS NOT NULL
  AND created_by NOT IN (SELECT id FROM public.users)
UNION ALL
SELECT 
  '【整合性チェック】',
  'reservations.customer_id',
  COUNT(*),
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ 整合性OK'
    ELSE '❌ 不整合あり'
  END
FROM public.reservations
WHERE customer_id IS NOT NULL
  AND customer_id NOT IN (SELECT id FROM public.users)
UNION ALL
SELECT 
  '【整合性チェック】',
  'daily_memos.created_by',
  COUNT(*),
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ 整合性OK'
    ELSE '❌ 不整合あり'
  END
FROM public.daily_memos
WHERE created_by IS NOT NULL
  AND created_by NOT IN (SELECT id FROM public.users)
UNION ALL
SELECT 
  '【整合性チェック】',
  'daily_memos.updated_by',
  COUNT(*),
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ 整合性OK'
    ELSE '❌ 不整合あり'
  END
FROM public.daily_memos
WHERE updated_by IS NOT NULL
  AND updated_by NOT IN (SELECT id FROM public.users);

-- 外部キー制約確認
SELECT
  '【外部キー制約】' as check_type,
  tc.table_name || '.' || kcu.column_name as column_name,
  rc.delete_rule,
  CASE 
    WHEN rc.delete_rule = 'SET NULL' THEN '✅'
    WHEN rc.delete_rule = 'CASCADE' THEN '⚠️'
    ELSE '❌'
  END as status
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.table_schema = 'public'
  AND tc.table_name IN ('reservations', 'daily_memos')
  AND rc.unique_constraint_name IN (
    SELECT constraint_name 
    FROM information_schema.table_constraints 
    WHERE table_name = 'users' 
      AND table_schema = 'public'
      AND constraint_type = 'PRIMARY KEY'
  )
ORDER BY tc.table_name, kcu.column_name;

