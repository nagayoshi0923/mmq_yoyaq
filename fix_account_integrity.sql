-- ============================================================
-- アカウント・スタッフ・顧客データの整合性強化スクリプト
-- ============================================================

BEGIN;

-- 1. customers.user_id の外部キー制約を修正
-- ユーザーアカウントが削除されても、顧客データ（履歴）は残すようにする
-- （ON DELETE CASCADE -> ON DELETE SET NULL）

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_user_id_fkey;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES public.users(id)
    ON DELETE SET NULL
    ON UPDATE NO ACTION;

RAISE NOTICE '✅ customers.user_id の削除ルールを SET NULL に変更しました';


-- 2. staff.user_id にユニーク制約を追加
-- 1つのユーザーアカウントが複数のスタッフデータに紐付くのを防ぐ
-- ※ 重複データがある場合はエラーになるため、事前に重複解消が必要

-- まず重複がないか確認（あったら強制的にクリーニングする処理を入れることも可能だが、今回はエラーにする）
DO $$
DECLARE
  duplicate_count INT;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT user_id FROM staff 
    WHERE user_id IS NOT NULL 
    GROUP BY user_id 
    HAVING COUNT(*) > 1
  ) sub;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION '❌ user_id が重複しているスタッフデータが存在します。先に重複を解消してください。';
  END IF;
END $$;

-- ユニーク制約の追加（既に存在する場合はスキップされるようにしたいが、ALTER TABLEはIF NOT EXISTSが使えないのでDOブロックで）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_user_id_key'
  ) THEN
    ALTER TABLE public.staff ADD CONSTRAINT staff_user_id_key UNIQUE (user_id);
    RAISE NOTICE '✅ staff.user_id にユニーク制約を追加しました';
  ELSE
    RAISE NOTICE 'ℹ️ staff.user_id には既にユニーク制約があります';
  END IF;
END $$;

COMMIT;

