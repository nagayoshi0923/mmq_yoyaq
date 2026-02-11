# マイグレーション ロールバックガイド

## 概要

Supabase のマイグレーションはデフォルトでロールバック機能がないため、
各マイグレーションに対応するロールバック SQL を手動で管理する必要がある。

**重要**: ロールバックは本番適用前にステージングで必ず検証すること。

---

## ロールバック手順

### 1. 問題の特定

```sql
-- 最新のマイグレーション状態を確認
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10;
```

### 2. ロールバック SQL の実行

Supabase SQL Editor で該当のロールバック SQL を実行する。

### 3. マイグレーション履歴の更新

```sql
-- 問題のマイグレーションを履歴から削除（ロールバック後）
DELETE FROM supabase_migrations.schema_migrations WHERE version = 'YYYYMMDDHHMMSS';
```

---

## 各マイグレーションのロールバック

### 20260210000004_add_missing_audit_triggers.sql

```sql
-- 監査トリガーを削除
DROP TRIGGER IF EXISTS trigger_audit_schedule_events ON public.schedule_events;
DROP TRIGGER IF EXISTS trigger_audit_stores ON public.stores;
DROP TRIGGER IF EXISTS trigger_audit_scenarios ON public.scenarios;
DROP FUNCTION IF EXISTS public.audit_generic_changes();
```

### 20260210000003_auto_initialize_organization.sql

```sql
-- 組織初期化トリガーを削除
DROP TRIGGER IF EXISTS trigger_initialize_organization ON public.organizations;
DROP FUNCTION IF EXISTS public.initialize_organization_data();
```

### 20260210000002_fix_is_admin_org_boundary_all_policies.sql

```sql
-- ⚠️ 注意: このロールバックはセキュリティを低下させる
-- RLS ポリシーの修正を元に戻す場合は、以前のポリシーを再作成する必要がある
-- 詳細は該当マイグレーションファイルを参照
-- 基本的にこのマイグレーションはロールバックしないこと（セキュリティ修正のため）
```

### 20260210000001_security_p0_final_fixes.sql

```sql
-- ⚠️ 注意: セキュリティP0修正のロールバックは禁止
-- ロールバックすると重大なセキュリティ脆弱性が再発する
-- 問題がある場合は、新しいマイグレーションで修正すること
```

---

## ベストプラクティス

1. **セキュリティ関連のマイグレーションはロールバックしない** — 新しいマイグレーションで修正する
2. **ロールバック前にバックアップを取る** — `pg_dump` でスナップショット
3. **ステージングで先にテスト** — 本番ロールバック前にステージングで検証
4. **ロールバック SQL は各マイグレーション作成時に書く** — 後から思い出すのは困難

## 緊急時の対応

```bash
# 1. ステージングDBのスナップショット復元（Supabase ダッシュボード）
# Settings > Database > Backups > Restore

# 2. マイグレーション履歴のリセット（最終手段）
# supabase db reset --linked  ← ステージングのみ
```
