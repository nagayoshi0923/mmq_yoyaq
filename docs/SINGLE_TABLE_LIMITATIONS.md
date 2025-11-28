# 1つのテーブル（auth.usersのみ）に統合した場合の制限事項

## ❌ できなくなること

### 1. **ユーザー管理ページが使えなくなる**

現在の実装：
- `UserManagement.tsx`で`public.users`テーブルから全ユーザーを取得
- 管理者がユーザー一覧を表示・検索・ロール変更・削除

`auth.users`のみの場合：
- ❌ フロントエンドから直接クエリできない（Supabase Admin APIが必要）
- ❌ ユーザー一覧表示ができない
- ❌ ロール変更ができない（`user_metadata`は直接編集不可）
- ❌ ユーザー検索ができない

### 2. **RLSポリシーでの細かい権限管理ができない**

現在の実装：
```sql
-- 管理者は全ユーザー表示可能、一般ユーザーは自分のみ
CREATE POLICY users_select_policy ON users FOR SELECT USING (
  auth.uid() = id OR 
  EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = 'admin'
  )
);
```

`auth.users`のみの場合：
- ❌ RLSポリシーを設定できない（Supabaseが管理するテーブル）
- ❌ 管理者のみが全ユーザーを閲覧する権限を設定できない
- ❌ アプリケーション側での権限制御ができない

### 3. **外部キー制約で参照できない**

現在の実装：
```sql
-- customersテーブルがusersテーブルを参照
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ...
);
```

`auth.users`のみの場合：
- ❌ `customers.user_id`が`auth.users.id`を直接参照できない（スキーマが異なる）
- ❌ 外部キー制約でCASCADE削除ができない
- ❌ データベースレベルの整合性保証ができない

### 4. **JOINクエリができない**

現在の実装：
```typescript
// usersテーブルとstaffテーブルをJOIN
const { data } = await supabase
  .from('users')
  .select(`
    *,
    staff:staff!user_id(*)
  `)
```

`auth.users`のみの場合：
- ❌ `auth.users`と`public.staff`をJOINできない（スキーマが異なる）
- ❌ 複雑なクエリができない
- ❌ アプリケーション側でのデータ取得が制限される

### 5. **ロール情報の取得が複雑になる**

現在の実装：
```typescript
// AuthContext.tsx
const { data: userData } = await supabase
  .from('users')
  .select('role')
  .eq('id', supabaseUser.id)
  .single()
```

`auth.users`のみの場合：
- ❌ `user_metadata.role`から取得する必要がある
- ❌ `user_metadata`は直接編集できない（Supabase Admin APIが必要）
- ❌ ロール変更時にEdge Functionが必要になる

### 6. **スタッフ招待時のロール設定が複雑になる**

現在の実装：
```typescript
// invite-staff関数で直接usersテーブルにレコード作成
await supabase
  .from('users')
  .insert({
    id: userId,
    email: email,
    role: 'staff',
    ...
  })
```

`auth.users`のみの場合：
- ❌ `user_metadata.role`を設定する必要がある
- ❌ ロール変更時に`supabase.auth.admin.updateUserById()`が必要
- ❌ エラーハンドリングが複雑になる

### 7. **インデックスやパフォーマンス最適化ができない**

現在の実装：
```sql
-- roleカラムにインデックスを追加
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
```

`auth.users`のみの場合：
- ❌ `user_metadata`の特定フィールドにインデックスを追加できない
- ❌ パフォーマンス最適化が制限される
- ❌ クエリが遅くなる可能性がある

## ✅ 現在の実装で使っている機能

### 1. ユーザー管理ページ（UserManagement.tsx）
- 全ユーザー一覧表示
- メールアドレス検索
- ロール変更
- ユーザー削除

### 2. スタッフ管理ページ（StaffManagement）
- ユーザー検索（UserSearchCombobox）
- スタッフとユーザーの紐付け
- ロール更新

### 3. 認証コンテキスト（AuthContext.tsx）
- ログイン時のロール取得
- ユーザー情報の設定

### 4. データベースの整合性
- 外部キー制約（customers.user_id → users.id）
- CASCADE削除（ユーザー削除時に自動削除）

## 🎯 結論

**`public.users`テーブルを削除すると、以下の機能が使えなくなります：**

1. ❌ ユーザー管理ページ（一覧表示・検索・ロール変更・削除）
2. ❌ RLSポリシーでの細かい権限管理
3. ❌ 外部キー制約でのデータ整合性保証
4. ❌ JOINクエリでの複雑なデータ取得
5. ❌ パフォーマンス最適化（インデックス）

**現在の2テーブル構成を維持することを推奨します。**

