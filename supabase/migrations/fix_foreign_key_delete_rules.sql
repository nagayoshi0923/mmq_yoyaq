-- ========================================
-- 外部キー制約の削除動作を修正
-- ========================================
-- 目的：Supabase UIからユーザーを削除できるようにする
-- 
-- 修正内容：
-- 1. reservations.created_by: NO ACTION → SET NULL
-- 2. daily_memos.created_by: NO ACTION → SET NULL
-- 3. daily_memos.updated_by: NO ACTION → SET NULL
--
-- 理由：
-- - 予約やメモの作成者が削除されても、履歴として残すべき
-- - DELETE時にNULLに設定することで、外部キー制約違反を防ぐ
-- ========================================

BEGIN;

-- 【1】 reservations.created_by
ALTER TABLE public.reservations
  DROP CONSTRAINT IF EXISTS reservations_created_by_fkey,
  ADD CONSTRAINT reservations_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES public.users(id)
    ON DELETE SET NULL
    ON UPDATE NO ACTION;

-- 【2】 daily_memos.created_by
ALTER TABLE public.daily_memos
  DROP CONSTRAINT IF EXISTS daily_memos_created_by_fkey,
  ADD CONSTRAINT daily_memos_created_by_fkey
    FOREIGN KEY (created_by)
    REFERENCES public.users(id)
    ON DELETE SET NULL
    ON UPDATE NO ACTION;

-- 【3】 daily_memos.updated_by
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
SELECT
  tc.table_name,
  kcu.column_name,
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
  AND rc.unique_constraint_name IN (
    SELECT constraint_name 
    FROM information_schema.table_constraints 
    WHERE table_name = 'users' 
      AND table_schema = 'public'
      AND constraint_type = 'PRIMARY KEY'
  )
ORDER BY tc.table_name, kcu.column_name;


