-- ロールバック: 026 / 027（必要時のみ）
--
-- 注意:
-- - 本番で実行する場合は影響範囲を理解した上で実施してください。

-- 026のロールバック
DROP POLICY IF EXISTS reservations_update_customer_restricted ON reservations;
CREATE POLICY reservations_update_customer ON reservations
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- 027のロールバック
DROP FUNCTION IF EXISTS change_reservation_schedule(UUID, UUID, UUID);

