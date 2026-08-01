-- anon から organization_scenarios.external_license_amount を剥奪する
--
-- 経緯:
--   20260801130000 では /{org}/rental-report（ルートガード無しの公開ページ）が
--   anon でこの列を読んでいたため、回帰を避けて暫定的に許可を残していた。
--
-- 本番実測（2026-08-01）でこのページが既に機能不全と判明したため、暫定許可を解除する:
--   - フォームは external_performance_reports へ scenario_id / reporter_company_name /
--     reporter_email / organization_id=null を INSERT しようとするが、
--     実テーブルにこれらの列は存在せず organization_id / reported_by は NOT NULL。
--   - anon は external_performance_reports に対して SELECT/INSERT いずれの GRANT も持たない。
--   → 送信は列不一致でも権限でも必ず失敗する。つまり報告受付は成立しておらず、
--     このページの実効的な作用は「他社向けライセンス単価の公開」だけだった。
--
-- 影響:
--   単価取得クエリが 42501 になり extPriceMap が空になるため、画面の単価・小計・合計は
--   0 円表示になる（`|| 0` フォールバックがあるためクラッシュはしない）。
--   失われる機能はない。
--
-- フォーム自体の再建（トークン付き公開API化・金額はサーバー側計算）は YOYAQ-010 で行う。

BEGIN;

REVOKE SELECT (external_license_amount) ON public.organization_scenarios FROM anon;

COMMIT;
