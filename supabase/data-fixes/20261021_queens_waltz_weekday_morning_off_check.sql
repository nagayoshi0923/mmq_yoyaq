-- 照合（読み取りのみ）: クインズワルツ平日朝枠の停止（20261021_queens_waltz_weekday_morning_off.sql）の前後
-- 実行: psql -X -v ON_ERROR_STOP=1 -f supabase/data-fixes/20261021_queens_waltz_weekday_morning_off_check.sql
-- 当てる前・当てた後・復旧した後のどれでも流せる。何も書き込まない。
--   1. 組織ごとの店舗数（queens-waltz 7・queenswaltz-sapporo 1 の見込み）
--   2. queens-waltz の店舗 × 曜日（月〜金）の 営業・開店・available_slots。退避表があれば「前（退避）→ 今」と差分の有無
--   3. 曜日の集計（朝が有効な店舗数）
--   4. 退避表の件数（無ければ「未適用」）
SELECT o.slug, count(*) AS settings_rows, count(DISTINCT b.store_id) AS stores
FROM public.business_hours_settings b JOIN public.organizations o ON o.id = b.organization_id
WHERE o.slug IN ('queens-waltz', 'queenswaltz-sapporo') GROUP BY o.slug ORDER BY o.slug;

SELECT to_regclass('archive.business_hours_settings_backup_20261021') IS NOT NULL AS qw_has_backup \gset
\if :qw_has_backup
SELECT b.store_id, s.name AS store_name, d.k AS day,
  d.v->>'open_time' AS open_time,
  k.opening_hours->d.k->'available_slots' AS before_slots,
  d.v->'available_slots' AS now_slots,
  (k.opening_hours->d.k->'available_slots') IS DISTINCT FROM (d.v->'available_slots') AS changed
FROM public.business_hours_settings b
JOIN public.organizations o ON o.id = b.organization_id
JOIN public.stores s ON s.id = b.store_id
LEFT JOIN archive.business_hours_settings_backup_20261021 k ON k.id = b.id
CROSS JOIN LATERAL jsonb_each(b.opening_hours) d(k,v)
WHERE o.slug = 'queens-waltz' AND d.k IN ('monday','tuesday','wednesday','thursday','friday')
ORDER BY s.name, array_position(ARRAY['monday','tuesday','wednesday','thursday','friday'], d.k);
SELECT count(*) AS backup_rows, min(backed_up_at) AS backed_up_at FROM archive.business_hours_settings_backup_20261021;
-- 土日・特別営業日・休業日・他の項目が退避時と同じか（false の行があれば調べる）
SELECT k.store_id,
  (b.opening_hours - ARRAY['monday','tuesday','wednesday','thursday','friday']) = (k.opening_hours - ARRAY['monday','tuesday','wednesday','thursday','friday']) AS weekend_same,
  (SELECT bool_and((b.opening_hours->d) - 'available_slots' = (k.opening_hours->d) - 'available_slots')
     FROM unnest(ARRAY['monday','tuesday','wednesday','thursday','friday']) d) AS weekday_other_fields_same
FROM archive.business_hours_settings_backup_20261021 k JOIN public.business_hours_settings b ON b.id = k.id
ORDER BY k.store_id;
\else
SELECT b.store_id, s.name AS store_name, d.k AS day, d.v->>'is_open' AS is_open, d.v->>'open_time' AS open_time,
  d.v->'available_slots' AS now_slots
FROM public.business_hours_settings b
JOIN public.organizations o ON o.id = b.organization_id
JOIN public.stores s ON s.id = b.store_id
CROSS JOIN LATERAL jsonb_each(b.opening_hours) d(k,v)
WHERE o.slug = 'queens-waltz' AND d.k IN ('monday','tuesday','wednesday','thursday','friday')
ORDER BY s.name, array_position(ARRAY['monday','tuesday','wednesday','thursday','friday'], d.k);
SELECT '未適用（退避表なし）' AS backup_rows;
\endif

SELECT d.k AS day, count(*) FILTER (WHERE d.v->'available_slots' @> '["morning"]') AS stores_with_morning, count(*) AS stores
FROM public.business_hours_settings b
JOIN public.organizations o ON o.id = b.organization_id
CROSS JOIN LATERAL jsonb_each(b.opening_hours) d(k,v)
WHERE o.slug = 'queens-waltz'
GROUP BY d.k ORDER BY array_position(ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], d.k);
