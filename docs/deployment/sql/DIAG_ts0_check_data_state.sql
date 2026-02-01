-- =============================================================================
-- DIAG TS-0: データ状態の診断（置換不要・全部コピペOK）
-- =============================================================================
-- まずこれを実行して、現状を把握してください。
-- 結果を教えていただければ、次のステップを案内します。
-- 
-- 注意: Supabase SQL Editor では RLS がバイパスされるため全データが見えるはずです
-- =============================================================================

-- -----------------------------------------------------------------------------
-- (1) 使用中の organization_id を確認
-- -----------------------------------------------------------------------------
SELECT '1_organization_id' AS section, 
       COALESCE(get_user_organization_id()::text, '(NULL - RLSで取得できない)') AS current_org_id
UNION ALL
SELECT '1_organization_id', 'dummy_row_to_ensure_output';

-- -----------------------------------------------------------------------------
-- (2) 組織一覧（どの組織が存在するか）
-- -----------------------------------------------------------------------------
SELECT '2_organizations' AS section, id, name, created_at
FROM public.organizations
ORDER BY created_at DESC
LIMIT 10;

-- -----------------------------------------------------------------------------
-- (3) schedule_events で current_participants > 0 のイベント数
-- -----------------------------------------------------------------------------
SELECT '3_events_with_participants' AS section,
       COUNT(*) AS total_events_with_participants,
       SUM(CASE WHEN current_participants > 0 THEN 1 ELSE 0 END) AS events_with_participants_gt_0,
       SUM(current_participants) AS sum_current_participants
FROM public.schedule_events;

-- -----------------------------------------------------------------------------
-- (4) 直近の schedule_events（current_participants の状態を確認）
-- -----------------------------------------------------------------------------
SELECT '4_recent_events' AS section,
       id,
       organization_id,
       date,
       start_time,
       scenario,
       current_participants,
       max_participants,
       capacity
FROM public.schedule_events
WHERE date >= '2025-01-01'
ORDER BY date DESC, start_time DESC
LIMIT 30;

-- -----------------------------------------------------------------------------
-- (5) reservations テーブルの状態
-- -----------------------------------------------------------------------------
SELECT '5_reservations_summary' AS section,
       COUNT(*) AS total_reservations,
       SUM(CASE WHEN schedule_event_id IS NULL THEN 1 ELSE 0 END) AS orphan_reservations,
       SUM(CASE WHEN status IN ('pending','confirmed','gm_confirmed') THEN 1 ELSE 0 END) AS active_reservations,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_reservations
FROM public.reservations;

-- -----------------------------------------------------------------------------
-- (6) 直近の reservations（孤児があるか確認）
-- -----------------------------------------------------------------------------
SELECT '6_recent_reservations' AS section,
       id,
       organization_id,
       schedule_event_id,
       status,
       reservation_source,
       customer_name,
       participant_count,
       created_at
FROM public.reservations
WHERE created_at >= '2025-01-01'
ORDER BY created_at DESC
LIMIT 30;

-- -----------------------------------------------------------------------------
-- (7) reservations_history の最近の履歴（削除があったか確認）
-- -----------------------------------------------------------------------------
SELECT '7_recent_history' AS section,
       id,
       reservation_id,
       action_type,
       old_values->>'status' AS old_status,
       new_values->>'status' AS new_status,
       created_at
FROM public.reservations_history
WHERE created_at >= now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 30;

-- -----------------------------------------------------------------------------
-- (8) schedule_event_history の最近の履歴（参加者追加/削除があったか）
-- -----------------------------------------------------------------------------
SELECT '8_event_history' AS section,
       id,
       schedule_event_id,
       action_type,
       old_values->>'current_participants' AS old_participants,
       new_values->>'current_participants' AS new_participants,
       created_at
FROM public.schedule_event_history
WHERE created_at >= now() - interval '7 days'
ORDER BY created_at DESC
LIMIT 30;

