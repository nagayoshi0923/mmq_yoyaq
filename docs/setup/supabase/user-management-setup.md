# ユーザー管理機能セットアップガイド

このドキュメントでは、ユーザー管理機能のセットアップ方法と使い方を説明します。

## 📋 概要

ユーザー管理機能では、管理者が以下の操作を実行できます：
- メールアドレスでユーザーを検索
- 全ユーザーの一覧表示
- ユーザーのロール（権限）を変更
  - **管理者** (admin): すべての機能にアクセス可能
  - **スタッフ** (staff): スタッフ向け機能にアクセス可能
  - **顧客** (customer): 予約など顧客向け機能のみ利用可能

## 🚀 セットアップ手順

### 1. データベースのRLSポリシーを更新

Supabaseダッシュボードで以下のSQLスクリプトを実行してください：

```sql
-- database/update_users_rls_policy.sql の内容を実行
```

または、Supabase CLIを使用：

```bash
# ローカル開発環境の場合
supabase db push

# または直接SQLを実行
psql $DATABASE_URL -f database/update_users_rls_policy.sql
```

### 2. 初期管理者アカウントの設定

システムにログインできる管理者アカウントを作成します：

#### オプション A: 既存のauth.usersをusersテーブルに追加

```sql
-- database/add_current_user.sql を参考に
INSERT INTO users (id, email, role)
SELECT 
  au.id,
  au.email,
  'admin'::app_role
FROM auth.users au
WHERE au.email = 'あなたのメールアドレス@example.com'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin'::app_role,
  updated_at = NOW();
```

#### オプション B: 新規アカウントを作成

1. ログインページで「アカウント作成」または「テストアカウント作成 → 管理者」をクリック
2. メールアドレスに `admin` を含むもの（例: `admin@example.com`）を使用すると自動的に管理者権限が付与されます
3. Supabaseでメール確認を無効にしている場合はすぐにログイン可能

### 3. メール確認の設定（開発環境）

開発環境でメール確認を無効にすると便利です：

1. Supabaseダッシュボード → Authentication → Settings
2. "Enable email confirmations" を **OFF** に設定
3. これでテストアカウント作成後すぐにログインできます

## 📱 使い方

### ユーザー管理ページへのアクセス

1. 管理者アカウントでログイン
2. トップメニューまたはナビゲーションバーから「ユーザー管理」をクリック
3. ダッシュボードの機能メニューからもアクセス可能

### メールアドレスで検索

1. 検索ボックスにユーザーのメールアドレスを入力
2. 「検索」ボタンをクリック
3. ユーザーが見つかったら、ロールを選択して変更

### 全ユーザーを表示

1. 「全ユーザーを表示」ボタンをクリック
2. 登録されている全ユーザーが一覧表示されます
3. 各ユーザーの横にあるアイコンボタンからロールを変更

### ロールの変更

各ユーザーカードには3つのボタンがあります：
- 🛡️ **管理者**: 全機能アクセス可能
- ⚙️ **スタッフ**: スタッフ機能のみ
- 👤 **顧客**: 予約機能のみ

希望のロールボタンをクリックすると即座に変更されます。

## 🔧 トラブルシューティング

### 「この機能は管理者のみ利用可能です」と表示される

- 現在ログインしているアカウントが管理者権限を持っていません
- `users` テーブルで該当ユーザーの `role` カラムが `admin` になっているか確認してください

```sql
-- ユーザーのロールを確認
SELECT id, email, role FROM users WHERE email = 'あなたのメールアドレス';

-- ロールを管理者に変更
UPDATE users SET role = 'admin'::app_role WHERE email = 'あなたのメールアドレス';
```

### 「該当するユーザーが見つかりませんでした」

- そのメールアドレスのユーザーが `users` テーブルに存在しません
- `auth.users` には存在するが `users` テーブルに存在しない場合があります
- 以下のSQLで追加できます：

```sql
INSERT INTO users (id, email, role)
SELECT id, email, 'customer'::app_role
FROM auth.users
WHERE email = '検索したメールアドレス'
ON CONFLICT (id) DO NOTHING;
```

### RLSポリシーエラー

エラー: `permission denied for table users`

- RLSポリシーが正しく設定されていない可能性があります
- `database/update_users_rls_policy.sql` を再度実行してください
- または、Supabaseダッシュボードの SQL Editorで以下を確認：

```sql
-- 現在のポリシーを確認
SELECT * FROM pg_policies WHERE tablename = 'users';
```

### AuthContextでロールが反映されない

- 現在のAuthContextは開発用に、メールアドレスからロールを推測しています
- 本番環境では `users` テーブルからロールを取得する必要があります
- `src/contexts/AuthContext.tsx` の TODO コメントを参照してください

## 🔐 セキュリティ上の注意

### RLS（Row Level Security）について

- `users` テーブルは RLS が有効になっています
- 管理者のみが他のユーザーのデータを閲覧・編集できます
- 一般ユーザーは自分自身のデータのみアクセス可能

### ロール変更の権限

- ロール変更は管理者のみ実行可能
- データベースレベルでも制限されているため、APIを直接呼んでも変更できません

## 🎯 次のステップ

1. **AuthContext の改善**: メールベースのロール判定を、データベースベースに変更
2. **ユーザー作成機能**: 管理者が直接新規ユーザーを作成できる機能を追加
3. **監査ログ**: ロール変更の履歴を記録する機能を追加
4. **一括操作**: 複数ユーザーのロールを一度に変更する機能

## 📚 関連ファイル

- **フロントエンド**:
  - `/src/pages/UserManagement.tsx` - ユーザー管理ページ
  - `/src/lib/userApi.ts` - ユーザー管理API
  - `/src/pages/AdminDashboard.tsx` - ルーティング設定
  - `/src/components/layout/NavigationBar.tsx` - ナビゲーションメニュー

- **データベース**:
  - `/database/update_users_rls_policy.sql` - RLSポリシー設定
  - `/database/add_current_user.sql` - 初期管理者作成スクリプト
  - `/database/create_tables.sql` - テーブル定義

## 💡 開発のヒント

### ローカルでのテスト

1. テストアカウントを複数作成:
   ```
   admin@test.com (管理者)
   staff@test.com (スタッフ)
   customer@test.com (顧客)
   ```

2. 各アカウントでログインして権限を確認

3. 管理者アカウントでロールを変更してテスト

### APIのテスト

```typescript
import { searchUserByEmail, updateUserRole } from '@/lib/userApi'

// ユーザー検索
const user = await searchUserByEmail('test@example.com')
console.log(user)

// ロール変更
await updateUserRole(user.id, 'staff')
```

---

**作成日**: 2025-10-16
**バージョン**: 1.0.0

