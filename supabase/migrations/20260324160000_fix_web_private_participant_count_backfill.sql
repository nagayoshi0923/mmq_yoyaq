-- =============================================================================
-- 20260324160000: 貸切（web_private）の参加人数・金額のバックフィル
-- =============================================================================
-- 背景:
-- - グループ申込で target_participant_count が未設定のとき、フロントが 6 名固定で
--   create_private_booking_request に渡していた期間があり、reservations が実態とずれていた。
-- 方針（アプリの表示ロジックと揃える）:
-- 1) private_groups.target_participant_count > 0 ならそれを正とする
-- 2) それ以外は private_group_members.status = 'joined' の人数
-- 3) どちらも使えない行は変更しない
-- total_price は「変更前の 1 人あたり単価（total_price / participant_count）」を維持して再計算。
-- 紐づく private_groups に total_price / per_person_price が入っている場合も同期する。
-- =============================================================================

CREATE TEMP TABLE tmp_private_participant_fix ON COMMIT DROP AS
WITH joined AS (
  SELECT
    group_id,
    COUNT(*)::integer AS joined_n
  FROM public.private_group_members
  WHERE status = 'joined'
  GROUP BY group_id
),
src AS (
  SELECT
    r.id AS reservation_id,
    r.private_group_id,
    r.participant_count AS old_participant_count,
    COALESCE(r.total_price, 0) AS old_total_price,
    CASE
      WHEN pg.target_participant_count IS NOT NULL AND pg.target_participant_count > 0
        THEN pg.target_participant_count
      WHEN COALESCE(j.joined_n, 0) > 0
        THEN j.joined_n
      ELSE r.participant_count
    END AS new_participant_count
  FROM public.reservations r
  INNER JOIN public.private_groups pg ON pg.id = r.private_group_id
  LEFT JOIN joined j ON j.group_id = r.private_group_id
  WHERE r.reservation_source = 'web_private'
    AND r.private_group_id IS NOT NULL
)
SELECT
  reservation_id,
  private_group_id,
  old_participant_count,
  old_total_price,
  new_participant_count,
  CASE
    WHEN old_participant_count > 0
      THEN ROUND(old_total_price::numeric / old_participant_count::numeric * new_participant_count::numeric)::integer
    ELSE old_total_price
  END AS new_total_price
FROM src
WHERE new_participant_count IS DISTINCT FROM old_participant_count;

-- reservations を更新
UPDATE public.reservations r
SET
  participant_count = t.new_participant_count,
  total_price = t.new_total_price,
  updated_at = NOW()
FROM tmp_private_participant_fix t
WHERE r.id = t.reservation_id;

-- グループ側の料金表示用カラムを同期（reservation と 1:1 で紐づく行のみ）
UPDATE public.private_groups pg
SET
  total_price = t.new_total_price,
  per_person_price = CASE
    WHEN t.new_participant_count > 0
      THEN GREATEST(
        1,
        ROUND(t.new_total_price::numeric / t.new_participant_count::numeric)::integer
      )
    ELSE pg.per_person_price
  END,
  updated_at = NOW()
FROM tmp_private_participant_fix t
WHERE pg.id = t.private_group_id
  AND pg.reservation_id = t.reservation_id;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n FROM tmp_private_participant_fix;
  RAISE NOTICE 'web_private 参加人数・金額バックフィル: % 件の予約を更新しました', n;
END $$;
