-- 孤立した一時バックアップテーブルの匿名アクセスを遮断する
--
-- 背景（2026-07-13 QAで検出）:
--   本番(cznpcewciwywcqcxktba)に、マイグレーション管理外の手動バックアップテーブルが
--   RLS無効かつ anon/authenticated にフル権限(SELECT/INSERT/UPDATE/DELETE/TRUNCATE)付きで
--   放置されていた。公開anonキーだけで匿名の読み書き・全削除が可能な状態だった。
--   対象2テーブルは app / DB関数 / ビュー / FK のいずれからも未参照（孤立）。
--     - customers_org_backfill_20260707        : platform_customers 移行時の手動退避（PIIカラム無し・1,524行）
--     - staff_scenario_assignments_backup_20260603 : 担当割当 削除監査導入時の手動バックアップ
--   staging には存在しないため、本マイグレーションは staging では no-op（IF EXISTS でスキップ）。
--
-- 方針: データは残したまま匿名アクセスのみを遮断（非破壊）。
--   RLS を有効化しポリシーを作らない＝ anon/authenticated からは一切アクセス不可。
--   service_role / postgres からは引き続きアクセス可能（バックアップ復元用途は温存）。
--   不要と判断でき次第、別途 DROP TABLE で完全削除してよい。

do $$
begin
  if to_regclass('public.customers_org_backfill_20260707') is not null then
    execute 'revoke all on table public.customers_org_backfill_20260707 from anon, authenticated';
    execute 'alter table public.customers_org_backfill_20260707 enable row level security';
    execute 'alter table public.customers_org_backfill_20260707 force row level security';
  end if;

  if to_regclass('public.staff_scenario_assignments_backup_20260603') is not null then
    execute 'revoke all on table public.staff_scenario_assignments_backup_20260603 from anon, authenticated';
    execute 'alter table public.staff_scenario_assignments_backup_20260603 enable row level security';
    execute 'alter table public.staff_scenario_assignments_backup_20260603 force row level security';
  end if;
end $$;
