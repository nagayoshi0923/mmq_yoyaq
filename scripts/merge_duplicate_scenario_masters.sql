-- 重複した scenario_masters を統合するスクリプト
--
-- 経緯: タイトルの全角/半角・空白・ハイフンの違いで別マスタとして登録されている
-- ケースが複数判明 (staging で 11 グループ・25 マスタ)。
--
-- 動作:
--   1. タイトルを正規化（空白・スラッシュ・ハイフン除去、全角→半角、小文字化）
--   2. 同じ正規化キーで複数あるグループを抽出
--   3. canonical 選定優先: 利用組織数 DESC > approved > pending > draft > rejected > created_at ASC
--   4. canonical 以外のマスタを参照する外部キーをすべて canonical に付け替え
--   5. UNIQUE 制約のあるテーブルでは衝突する dup 側の行を削除
--   6. dup のマスタを削除
--
-- 安全性:
--   - 全体を BEGIN/COMMIT トランザクションで囲む
--   - 重複がなくなるまで idempotent（再実行しても何もしない）
--
-- 適用方法:
--   psql "$DB_URL" -f scripts/merge_duplicate_scenario_masters.sql

BEGIN;

-- 1. 統合ペアを一時テーブルに格納
CREATE TEMP TABLE _merge_pairs ON COMMIT DROP AS
WITH normalized AS (
  SELECT
    id,
    title,
    master_status,
    created_at,
    LOWER(translate(
      regexp_replace(title, '[\s/／\-−ー_]', '', 'g'),
      '（）０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ',
      '()0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    )) AS norm_title,
    (SELECT COUNT(*) FROM organization_scenarios os WHERE os.scenario_master_id = scenario_masters.id) AS using_count
  FROM scenario_masters
),
groups AS (
  SELECT norm_title FROM normalized GROUP BY norm_title HAVING COUNT(*) > 1
),
ranked AS (
  SELECT n.*,
    FIRST_VALUE(n.id) OVER (
      PARTITION BY n.norm_title
      ORDER BY n.using_count DESC,
               CASE n.master_status WHEN 'approved' THEN 1 WHEN 'pending' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END,
               n.created_at ASC
    ) AS canonical_id
  FROM normalized n
  JOIN groups g ON g.norm_title = n.norm_title
)
SELECT canonical_id, id AS dup_id
FROM ranked
WHERE id <> canonical_id;

-- 実行前の確認用出力
SELECT 'Merge pairs to process: ' || COUNT(*)::text AS info FROM _merge_pairs;

-- 2. 各ペアについて、外部参照を canonical に移し dup を削除
DO $$
DECLARE
  pair RECORD;
  merged_count INT := 0;
BEGIN
  FOR pair IN SELECT * FROM _merge_pairs LOOP
    -- ── UNIQUE 制約のあるテーブル: 衝突する dup の行を削除してから UPDATE ──

    -- organization_scenarios: UNIQUE(org_id, master_id)
    DELETE FROM public.organization_scenarios os
    WHERE os.scenario_master_id = pair.dup_id
      AND EXISTS (
        SELECT 1 FROM public.organization_scenarios os2
        WHERE os2.organization_id = os.organization_id
          AND os2.scenario_master_id = pair.canonical_id
      );
    UPDATE public.organization_scenarios SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;

    -- staff_scenario_assignments: UNIQUE(staff_id, master_id)
    DELETE FROM public.staff_scenario_assignments
    WHERE scenario_master_id = pair.dup_id
      AND EXISTS (
        SELECT 1 FROM public.staff_scenario_assignments a2
        WHERE a2.staff_id = staff_scenario_assignments.staff_id
          AND a2.scenario_master_id = pair.canonical_id
      );
    UPDATE public.staff_scenario_assignments SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;

    -- scenario_ratings: UNIQUE(customer_id, master_id)
    DELETE FROM public.scenario_ratings
    WHERE scenario_master_id = pair.dup_id
      AND EXISTS (
        SELECT 1 FROM public.scenario_ratings r2
        WHERE r2.customer_id = scenario_ratings.customer_id
          AND r2.scenario_master_id = pair.canonical_id
      );
    UPDATE public.scenario_ratings SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;

    -- kit_transfer_completions: 複合 UNIQUE
    DELETE FROM public.kit_transfer_completions
    WHERE scenario_master_id = pair.dup_id
      AND EXISTS (
        SELECT 1 FROM public.kit_transfer_completions k2
        WHERE k2.organization_id = kit_transfer_completions.organization_id
          AND k2.scenario_master_id = pair.canonical_id
          AND k2.kit_number = kit_transfer_completions.kit_number
          AND k2.performance_date = kit_transfer_completions.performance_date
          AND k2.to_store_id = kit_transfer_completions.to_store_id
      );
    UPDATE public.kit_transfer_completions SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;

    -- manual_external_performances: 複合 UNIQUE (org, master, year, month)
    DELETE FROM public.manual_external_performances
    WHERE scenario_master_id = pair.dup_id
      AND EXISTS (
        SELECT 1 FROM public.manual_external_performances mep2
        WHERE mep2.organization_id = manual_external_performances.organization_id
          AND mep2.scenario_master_id = pair.canonical_id
          AND mep2.year = manual_external_performances.year
          AND mep2.month = manual_external_performances.month
      );
    UPDATE public.manual_external_performances SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;

    -- scenario_likes: UNIQUE(customer_id, scenario_id)（カラム名は scenario_id だが FK は scenario_masters.id）
    DELETE FROM public.scenario_likes
    WHERE scenario_master_id = pair.dup_id
      AND EXISTS (
        SELECT 1 FROM public.scenario_likes l2
        WHERE l2.customer_id = scenario_likes.customer_id
          AND l2.scenario_master_id = pair.canonical_id
      );
    UPDATE public.scenario_likes SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;

    -- ── UNIQUE なし、SET NULL/SET DEFAULT 系: 単純 UPDATE ──
    UPDATE public.external_performance_reports SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;
    UPDATE public.kit_transfer_events          SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;
    UPDATE public.manual_play_history          SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;
    UPDATE public.miscellaneous_transactions   SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;
    UPDATE public.performance_kits             SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;
    UPDATE public.private_booking_requests     SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;
    UPDATE public.private_groups               SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;
    UPDATE public.private_groups               SET scenario_id        = pair.canonical_id WHERE scenario_id        = pair.dup_id;
    UPDATE public.reservations                 SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;
    UPDATE public.scenarios                    SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;
    UPDATE public.schedule_events              SET scenario_master_id = pair.canonical_id WHERE scenario_master_id = pair.dup_id;
    UPDATE public.staff_scenario_assignments   SET scenario_id        = pair.canonical_id WHERE scenario_id        = pair.dup_id;

    -- ── CASCADE 系の子テーブル: dup の子は canonical 側にコピーせず削除 ──
    DELETE FROM public.scenario_characters         WHERE scenario_master_id = pair.dup_id;
    DELETE FROM public.scenario_kit_locations      WHERE scenario_master_id = pair.dup_id;
    DELETE FROM public.scenario_master_corrections WHERE scenario_master_id = pair.dup_id;

    -- ── dup の master 自体を削除 ──
    DELETE FROM public.scenario_masters WHERE id = pair.dup_id;

    merged_count := merged_count + 1;
    RAISE NOTICE 'Merged % -> %', pair.dup_id, pair.canonical_id;
  END LOOP;

  RAISE NOTICE 'Total merged: %', merged_count;
END $$;

-- 3. 検証: 重複が残っていないか
WITH normalized AS (
  SELECT
    id,
    LOWER(translate(
      regexp_replace(title, '[\s/／\-−ー_]', '', 'g'),
      '（）０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ',
      '()0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    )) AS norm_title
  FROM scenario_masters
)
SELECT 'Remaining duplicate groups: ' || COUNT(*)::text AS verification
FROM (
  SELECT norm_title FROM normalized GROUP BY norm_title HAVING COUNT(*) > 1
) sub;

COMMIT;
