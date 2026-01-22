# マルチテナント対応チェックリスト

## 🚨 必須チェック項目

### 新規コード追加時

#### 1. SELECTクエリ
- [ ] すべての`from('テーブル名')`に`organization_id`フィルタがあるか
- [ ] `getCurrentOrganizationId()`を呼び出しているか
- [ ] 例外テーブル（`users`, `organizations`, `authors`, `auth_logs`）でないか確認

**修正パターン:**
```typescript
// ❌ 悪い例
const { data } = await supabase
  .from('schedule_events')
  .select('*')

// ✅ 良い例
const orgId = await getCurrentOrganizationId()
let query = supabase
  .from('schedule_events')
  .select('*')

if (orgId) {
  query = query.eq('organization_id', orgId)
}

const { data } = await query
```

#### 2. INSERT/UPSERT
- [ ] `organization_id`が設定されているか
- [ ] `getCurrentOrganizationId()`で取得しているか

**修正パターン:**
```typescript
// ❌ 悪い例
await supabase
  .from('customers')
  .insert({ name: 'John', email: 'john@example.com' })

// ✅ 良い例
const orgId = await getCurrentOrganizationId()
if (!orgId) {
  throw new Error('組織情報が取得できません')
}

await supabase
  .from('customers')
  .insert({ 
    name: 'John', 
    email: 'john@example.com',
    organization_id: orgId
  })
```

#### 3. UPDATE/DELETE
- [ ] 範囲操作（複数レコード）に`organization_id`フィルタがあるか
- [ ] ID指定の単一操作でも念のため追加推奨

**修正パターン:**
```typescript
// ❌ 悪い例
await supabase
  .from('schedule_events')
  .update({ is_cancelled: true })
  .eq('scenario_id', scenarioId)

// ✅ 良い例
const orgId = await getCurrentOrganizationId()
let query = supabase
  .from('schedule_events')
  .update({ is_cancelled: true })
  .eq('scenario_id', scenarioId)

if (orgId) {
  query = query.eq('organization_id', orgId)
}

await query
```

### 既存コード修正時

- [ ] 修正したクエリに`organization_id`フィルタがあるか確認
- [ ] コピーしたコードに`organization_id`フィルタがあるか確認

## 🔍 チェック方法

### 1. 自動チェックスクリプト
```bash
npm run check:multi-tenant
```

### 2. 手動チェック
```bash
# 特定のテーブルを使用している箇所を検索
grep -r "\.from(['\"]schedule_events['\"])" src --include="*.ts" --include="*.tsx"

# organization_idフィルタがあるか確認
grep -r "\.eq(['\"]organization_id['\"])" src --include="*.ts" --include="*.tsx"
```

### 3. PR作成時
`.github/PULL_REQUEST_TEMPLATE.md`のチェックリストを確認

## 📋 対象テーブル一覧

### organization_id必須テーブル
- `schedule_events` - 公演スケジュール
- `reservations` - 予約
- `scenarios` - シナリオ
- `staff` - スタッフ
- `stores` - 店舗
- `customers` - 顧客
- `daily_memos` - 日次メモ
- `shift_submissions` - シフト提出
- `staff_scenario_assignments` - スタッフシナリオ割り当て
- `schedule_event_history` - 公演履歴

### organization_id不要テーブル（例外）
- `users` - 認証ユーザー
- `organizations` - 組織マスタ
- `authors` - 作者マスタ
- `auth_logs` - 認証ログ

## 🧪 テスト

### 単体テスト
```bash
npm run test:multi-tenant
```

### 手動テスト
1. 複数組織のアカウントでログイン
2. 各組織のデータが正しく表示されるか確認
3. 他組織のデータが表示されないか確認

## 📚 参考資料

- [マルチテナント対応不完全箇所リスト](./MULTI_TENANT_ISSUES.md)
- [プロジェクトルール](../rules/rurle.mdc) - 「マルチテナント対応ルール」セクション

