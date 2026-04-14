-- ====================================================================
-- セキュリティ修正: authenticated ロールの schedule_events カラム制限
--
-- 問題: anon への制限（20260412100000）と同様に、
--       authenticated（ログイン済みの全ユーザー＝スタッフ・顧客・anon以外）が
--       schedule_events の非公開カラム（GM情報・財務情報・内部メモ等）を
--       PostgREST 経由で直接参照できる状態だった。
--       anon と authenticated は別 PostgreSQL ロールであるため、
--       anon への REVOKE では authenticated は保護されていなかった。
--
-- 修正方針:
--   1. authenticated にも anon と同様のカラムレベル制限を適用
--   2. スタッフ向けに schedule_events_staff_view ビューを作成
--      - WHERE is_staff_or_admin() により非スタッフには0件を返す
--      - スタッフは全カラムにアクセス可能
--   3. 全スタッフ向けクエリは schedule_events_staff_view を使用するよう
--      フロントエンドを更新（同コミットで実施）
--
-- 非公開カラム（顧客・一般ユーザーから隠すべき情報）:
--   - gms, gm_roles（スタッフ情報）
--   - venue_rental_fee, total_revenue, gm_cost, license_cost（財務）
--   - notes, reservation_notes, cancellation_reason（内部メモ）
--   - reservation_id, reservation_name, is_reservation_name_overwritten（予約紐付け）
--   - is_tentative（内部ワークフロー）
-- ====================================================================

-- ============================================================
-- 1. authenticated ロールへのカラム制限（anon と同等）
-- ============================================================
REVOKE SELECT ON public.schedule_events FROM authenticated;
GRANT SELECT (
  id, date, venue, scenario, start_time, end_time,
  category, is_cancelled, scenario_id, store_id,
  start_at, end_at, published, capacity, status,
  max_participants, reservation_deadline_hours,
  is_reservation_enabled, current_participants, time_slot,
  organization_id, participant_count,
  is_private_request, organization_scenario_id,
  is_recruitment_extended, is_private_booking,
  is_extended, extended_at,
  cancelled_at, scenario_master_id,
  created_at, updated_at
) ON public.schedule_events TO authenticated;

-- ============================================================
-- 2. スタッフ専用ビュー: 全カラムを参照可能
--    is_staff_or_admin() = false のユーザーには0件を返す
-- ============================================================
DROP VIEW IF EXISTS public.schedule_events_staff_view;
CREATE VIEW public.schedule_events_staff_view AS
  SELECT * FROM public.schedule_events
  WHERE public.is_staff_or_admin();

-- authenticated に SELECT 権限を付与（非スタッフは WHERE で0件）
GRANT SELECT ON public.schedule_events_staff_view TO authenticated;

-- ============================================================
-- 3. 確認ログ
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '🔒 セキュリティ修正完了:';
  RAISE NOTICE '  - schedule_events: authenticated の非公開カラムへのアクセスを制限';
  RAISE NOTICE '  - schedule_events_staff_view: スタッフ専用ビューを作成（is_staff_or_admin() チェック付き）';
END $$;
