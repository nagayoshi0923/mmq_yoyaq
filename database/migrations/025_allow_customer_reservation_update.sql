-- 顧客が自分の予約を更新できるようにするRLSポリシー
-- 
-- 問題: reservations_update ポリシーがスタッフ/管理者のみに制限されていた
-- 解決: 顧客が自分の予約（customer_id が一致）を更新できるように追加

-- 既存のポリシーを削除して再作成
DROP POLICY IF EXISTS reservations_update ON reservations;
DROP POLICY IF EXISTS reservations_update_customer ON reservations;

-- スタッフ/管理者用の更新ポリシー
CREATE POLICY reservations_update_staff ON reservations
  FOR UPDATE USING (
    organization_id = get_user_organization_id()
    OR is_org_admin()
  ) WITH CHECK (
    organization_id = get_user_organization_id()
    OR is_org_admin()
  );

-- 顧客用の更新ポリシー（自分の予約のみ）
CREATE POLICY reservations_update_customer ON reservations
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

COMMENT ON POLICY reservations_update_staff ON reservations IS 
'スタッフと管理者は組織内の予約を更新可能';

COMMENT ON POLICY reservations_update_customer ON reservations IS 
'顧客は自分の予約（customer_idが一致）を更新可能';
