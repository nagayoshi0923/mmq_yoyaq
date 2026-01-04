# マルチテナント セキュリティガイド

**最終更新**: 2026-01-04

---

## 概要

MMQシステムは複数の組織（マルチテナント）に対応しています。
各組織のデータは `organization_id` で分離され、他組織のデータにアクセスできないようになっています。

---

## 🚨 重要：organization_id の設定漏れは重大なセキュリティ問題

organization_id の設定を忘れると：
- 他組織のデータが表示される
- 他組織にデータが保存される
- **顧客情報や売上データが漏洩する可能性**

---

## 保護の仕組み（多層防御）

### 1. RLS（Row Level Security）- データベースレベル

PostgreSQL のネイティブ機能で、全てのクエリに自動的にフィルタが適用されます。

```sql
-- 例: reservations テーブルの RLS ポリシー
CREATE POLICY reservations_strict ON reservations FOR ALL USING (
  CASE
    WHEN get_user_organization_id() IS NOT NULL THEN
      organization_id = get_user_organization_id() OR is_org_admin()
    ELSE
      customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  END
);
```

**適用テーブル**: 27テーブル（organization_id を持つ全テーブル）

### 2. コード側フィルタ - アプリケーションレベル

```typescript
import { getCurrentOrganizationId } from '@/lib/organization'

// SELECT 時
const orgId = await getCurrentOrganizationId()
let query = supabase.from('reservations').select('*')
if (orgId) {
  query = query.eq('organization_id', orgId)
}

// INSERT 時
await supabase.from('reservations').insert({
  ...data,
  organization_id: orgId
})
```

### 3. インデックス - パフォーマンス

全ての主要テーブルに `organization_id` インデックスが設定されています。

```sql
CREATE INDEX idx_reservations_org ON reservations(organization_id);
```

---

## 操作別ルール

### INSERT / UPSERT

**必須**: `organization_id` を明示的に設定

```typescript
// ✅ 正しい
const orgId = await getCurrentOrganizationId()
await supabase.from('table').insert({
  ...data,
  organization_id: orgId
})

// ❌ 間違い
await supabase.from('table').insert(data)
```

### SELECT

**推奨**: `organization_id` でフィルタ（RLS があるので必須ではないが推奨）

```typescript
// ✅ 推奨
const orgId = await getCurrentOrganizationId()
let query = supabase.from('table').select('*')
if (orgId) {
  query = query.eq('organization_id', orgId)
}

// ⚠️ RLS で保護されるが、明示的フィルタなし
await supabase.from('table').select('*')
```

### UPDATE / DELETE

**ID で特定する場合**: RLS で保護されるため OK

```typescript
// ✅ OK（ID で特定）
await supabase.from('table').update(data).eq('id', id)

// ⚠️ 範囲更新の場合は organization_id フィルタ推奨
await supabase.from('table').update(data).eq('status', 'pending')
```

---

## organization_id 不要なテーブル

| テーブル | 理由 |
|----------|------|
| `users` | 認証テーブル（ユーザーは複数組織に所属可能） |
| `organizations` | 組織テーブル自体 |
| `authors` | 共有マスタデータ |
| `auth_logs` | システムログ |

---

## 新機能追加時のチェックリスト

### 新しいテーブルを作成する場合

1. [ ] `organization_id UUID REFERENCES organizations(id)` カラムを追加
2. [ ] `CREATE INDEX idx_tablename_org ON tablename(organization_id)` を実行
3. [ ] RLS ポリシーを作成（`database/migrations/004_strict_rls_policies_safe.sql` を参考）
4. [ ] 型定義（`src/types/index.ts`）に `organization_id` を追加

### 新しい API 関数を作成する場合

1. [ ] `getCurrentOrganizationId()` をインポート
2. [ ] INSERT/UPSERT に `organization_id` を含める
3. [ ] SELECT に `organization_id` フィルタを追加
4. [ ] UPDATE/DELETE が範囲操作の場合はフィルタを追加

---

## 確認コマンド

### organization_id フィルタ漏れを検索

```bash
# INSERT で organization_id がない箇所
grep -rn "\.insert(" src --include="*.ts" --include="*.tsx" | head -20

# SELECT で organization_id フィルタがない箇所
grep -rn "\.from(" src --include="*.ts" --include="*.tsx" | head -20
```

### RLS の動作確認（Supabase SQL Editor）

```sql
-- 現在のユーザーの organization_id
SELECT get_user_organization_id();

-- RLS が有効か確認
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- 自組織のデータのみ返るか確認
SELECT organization_id, COUNT(*) 
FROM reservations 
GROUP BY organization_id;
```

---

## トラブルシューティング

### 問題: 他組織のデータが見える

1. RLS ポリシーが正しく適用されているか確認
2. `service_role` キーを使用していないか確認（RLS をバイパスする）
3. ポリシーに `OR organization_id IS NULL` のような緩和措置がないか確認

### 問題: データが保存されない

1. INSERT に `organization_id` が含まれているか確認
2. RLS ポリシーで INSERT が許可されているか確認

---

## 関連ファイル

| ファイル | 説明 |
|----------|------|
| `database/migrations/004_strict_rls_policies_safe.sql` | RLS ポリシー定義 |
| `src/lib/organization.ts` | organization_id 取得ユーティリティ |
| `src/hooks/useOrganization.ts` | organization_id を取得するフック |
| `.cursorrules` | プロジェクトルール |

