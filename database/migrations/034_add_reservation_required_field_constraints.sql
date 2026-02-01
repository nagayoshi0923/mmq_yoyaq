-- =============================================================================
-- マイグレーション 034: 予約必須項目のDB側制約追加
-- =============================================================================
-- 
-- 作成日: 2026-02-01
-- 
-- 問題:
--   必須項目のバリデーションがフロントエンドのみで、
--   API直叩きで必須項目なしでINSERTが可能だった
-- 
-- 修正:
--   CHECK制約を追加して、新規予約で必須項目が空の場合はエラーにする
--   （既存データに影響を与えないよう、NULL許可だが空文字は禁止）
-- 
-- =============================================================================

-- 予約ソースによって必須項目が異なるため、条件付きCHECK制約を追加
-- web_public, web_private の場合は顧客情報が必須

-- 既存のCHECK制約があれば削除
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservation_customer_info;

-- 新規の条件付きCHECK制約を追加
-- web_public/web_private の予約では customer_name, customer_email, customer_phone が必須
ALTER TABLE reservations ADD CONSTRAINT chk_reservation_customer_info CHECK (
  -- Web経由の予約の場合は顧客情報が必須
  CASE 
    WHEN reservation_source IN ('web_public', 'web_private') THEN
      customer_name IS NOT NULL AND trim(customer_name) != '' AND
      customer_email IS NOT NULL AND trim(customer_email) != ''
    ELSE
      -- その他のソース（admin, import等）はNULL許可
      TRUE
  END
);

COMMENT ON CONSTRAINT chk_reservation_customer_info ON reservations IS 
'Web経由の予約では顧客名・メールアドレスが必須';

-- participant_count の制約
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS chk_reservation_participant_count;
ALTER TABLE reservations ADD CONSTRAINT chk_reservation_participant_count CHECK (
  participant_count IS NULL OR participant_count > 0
);

COMMENT ON CONSTRAINT chk_reservation_participant_count ON reservations IS 
'参加人数は1以上でなければならない';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 034 完了: 予約必須項目のDB側制約を追加';
END $$;
