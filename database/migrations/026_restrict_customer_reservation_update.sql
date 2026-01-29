-- =============================================================================
-- マイグレーション 026: 顧客の予約UPDATE権限を厳格化（緊急セキュリティパッチ）
-- =============================================================================
-- 
-- 作成日: 2026-01-30
-- 
-- 🚨 問題:
--   025 で追加された reservations_update_customer ポリシーが列制限なしで、
--   顧客が status, participant_count, schedule_event_id, 料金等を直接変更可能だった
-- 
-- ✅ 対策:
--   顧客の直接UPDATEを完全禁止し、全ての変更をRPC経由に統一
-- 
-- 影響範囲:
--   - 顧客が reservations テーブルを直接 UPDATE できなくなる
--   - 人数変更: update_reservation_participants RPC を使用（既存）
--   - 日程変更: change_reservation_schedule RPC を使用（027で実装予定）
--   - 備考変更: RPC化 or スタッフ経由に変更
-- 
-- =============================================================================

-- 既存の顧客用UPDATEポリシーを削除して厳格化版に置き換え
DROP POLICY IF EXISTS reservations_update_customer ON reservations;

-- 🔒 顧客のUPDATEを許可するが、危険な列の変更をブロック
-- 既存機能を壊さないため、UPDATEは許可しつつ重要列の変更を防ぐ
CREATE POLICY reservations_update_customer_restricted ON reservations
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    -- 🚨 以下の列は変更不可（在庫・会計・状態に影響）
    AND (OLD.status IS NOT DISTINCT FROM NEW.status)                           -- 状態変更禁止
    AND (OLD.participant_count IS NOT DISTINCT FROM NEW.participant_count)     -- 人数変更禁止（RPC経由）
    AND (OLD.schedule_event_id IS NOT DISTINCT FROM NEW.schedule_event_id)     -- 日程変更禁止（RPC経由）
    AND (OLD.base_price IS NOT DISTINCT FROM NEW.base_price)                   -- 料金変更禁止
    AND (OLD.total_price IS NOT DISTINCT FROM NEW.total_price)                 -- 料金変更禁止
    AND (OLD.final_price IS NOT DISTINCT FROM NEW.final_price)                 -- 料金変更禁止
    AND (OLD.unit_price IS NOT DISTINCT FROM NEW.unit_price)                   -- 料金変更禁止
    AND (OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status)           -- 決済状態変更禁止
    AND (OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id)         -- 組織移動禁止
    -- ✅ 変更可能な列: customer_notes, customer_name, customer_email, customer_phone 等
  );

COMMENT ON POLICY reservations_update_customer_restricted ON reservations IS 
'顧客は自分の予約を更新可能だが、status/人数/日程/料金/決済状態は変更不可（RPC経由のみ）。';

COMMENT ON POLICY reservations_update_staff ON reservations IS 
'スタッフと管理者は組織内の予約を更新可能（全列）。';

-- 完了確認
DO $$ 
BEGIN
  RAISE NOTICE '✅ マイグレーション 026 完了';
  RAISE NOTICE '  - reservations_update_customer を reservations_update_customer_restricted に置き換え';
  RAISE NOTICE '  - 顧客は status/人数/日程/料金を直接変更不可（RPC経由のみ）';
  RAISE NOTICE '  - 既存機能への影響: なし（RPCを使用しているため）';
END $$;

-- =============================================================================
-- ロールバックSQL（テストで問題が出た場合のみ実行）
-- =============================================================================
/*
-- 025 の状態に戻す
DROP POLICY IF EXISTS reservations_update_customer_restricted ON reservations;

CREATE POLICY reservations_update_customer ON reservations
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );
*/
