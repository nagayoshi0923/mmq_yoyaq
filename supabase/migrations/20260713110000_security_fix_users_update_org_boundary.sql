-- =============================================================================
-- セキュリティ修正: users テーブル UPDATE ポリシーのテナント境界・自己権限昇格を是正
-- =============================================================================
-- 背景（2026-07-13 QA / pentest で確認。staging・本番の両方で再現）:
--   既存ポリシー users_update_self_or_admin は USING / WITH CHECK の双方で
--   素の public.is_staff_or_admin() を許可していた。is_staff_or_admin() は
--   role IN ('admin','staff','license_admin') を返すだけで組織境界を見ない。
--   このため authenticated な staff ユーザーが PostgREST 直叩き
--   (PATCH /rest/v1/users) で自分自身の行に対し
--     - role を 'admin' / 'license_admin' へ昇格（自己権限昇格）
--     - organization_id を別組織へ変更（テナントホップ→別組織のadminへ）
--   が可能だった。
--
--   ※ 他ユーザー行の改変は SELECT ポリシー users_select_self_or_admin が
--     UPDATE ... WHERE の行読取り時に組織境界で弾くため、実害は
--     「自分の行の書換え」に限られていた。ただし admin による
--     他組織への organization_id 押し込みは WITH CHECK 素通しで可能だった。
--
--   直前の 20260330010000 は WITH CHECK 先頭に素の is_staff_or_admin() を
--     残していたため修正が不完全だった（本マイグレーションで是正）。
--
-- 修正方針（既存の SELECT/DELETE ポリシーと同一の組織境界パターンに統一）:
--   USING     : 自分の行 / (is_admin() かつ 対象行が自組織) / service_role
--   WITH CHECK : service_role
--                / (is_admin() かつ 新値の organization_id も自組織)
--                / 自己更新（role・organization_id を現在値から変更しない）
--   → 素の is_staff_or_admin() 素通しを USING・WITH CHECK の双方から除去する。
--
-- 影響（アプリの正規フローは従来どおり動作）:
--   - admin による自組織ユーザーの role 変更（ユーザー管理 / スタッフ紐付け）… 継続可
--   - 本人によるプロフィール編集（display_name / email 等）… 継続可
--   - 顧客オンボーディング（CompleteProfile の自己 upsert/insert）… 自己分岐は不変のため継続可
--   staff 単独での他者・自己 role 変更、および全ユーザーの organization_id 越境変更のみ遮断。
-- =============================================================================

DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;

CREATE POLICY "users_update_self_or_admin" ON public.users
  FOR UPDATE
  USING (
    (id = auth.uid())
    OR (public.is_admin() AND organization_id = public.get_user_organization_id())
    OR (auth.role() = 'service_role')
  )
  WITH CHECK (
    -- service_role は従来どおり全フィールド変更可
    (auth.role() = 'service_role')
    -- admin は自組織内のみ変更可（新値の organization_id も自組織であること＝越境押し込み禁止）
    OR (public.is_admin() AND organization_id = public.get_user_organization_id())
    -- 本人は自分の行を更新できるが role・organization_id は現在値から変更不可
    OR (
      id = auth.uid()
      AND role = (SELECT u.role FROM public.users u WHERE u.id = auth.uid())
      AND organization_id IS NOT DISTINCT FROM
          (SELECT u.organization_id FROM public.users u WHERE u.id = auth.uid())
    )
  );

DO $$
BEGIN
  RAISE NOTICE '🔒 users_update_self_or_admin: 組織境界・自己権限昇格防止を適用しました';
END $$;
