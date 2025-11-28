# ユーザー管理・認証ロジックの全体像

## 📋 概要

このシステムでは、以下の2つのテーブルでユーザーを管理しています：
- **`auth.users`** (Supabase Authentication): 認証情報（パスワード、メールアドレスなど）
- **`public.users`** (アプリケーション): アプリケーション固有の情報（ロール、権限など）

## 🔄 ユーザー作成フロー

### 1. 通常のユーザー登録（顧客）

**フロー:**
```
1. ユーザーがサインアップ（LoginForm.tsx）
   ↓
2. supabase.auth.signUp() で auth.users に作成
   ↓
3. トリガー（handle_new_user）が自動実行
   ↓
4. public.users にレコード作成（role='customer'）
```

**ロール設定ロジック:**
- デフォルト: `customer`
- メールアドレスに `admin` が含まれている場合: `admin`
- メールアドレスに `staff` が含まれている場合: `staff`

### 2. スタッフ招待（invite-staff Edge Function）

**フロー:**
```
1. 管理者がスタッフ招待（invite-staff関数呼び出し）
   ↓
2. supabase.auth.admin.createUser() で auth.users に作成
   - user_metadata.invited_as = 'staff' を設定
   ↓
3. トリガー（handle_new_user）が自動実行
   - invited_as='staff' を参照して role='staff' を設定
   ↓
4. invite-staff関数が確実に public.users にレコード作成/更新
   - トリガーに依存せず、確実に role='staff' を設定（リトライ5回）
   ↓
5. staffテーブルにレコード作成/更新（user_idを紐付け）
   ↓
6. 招待メール送信（パスワード設定リンク付き）
```

**重要なポイント:**
- `invite-staff`関数はトリガーに依存せず、確実に`users`テーブルにレコードを作成
- リトライ5回で確実に`staff`ロールを設定
- 最終的に失敗した場合はエラーを返す（後で手動修正ではなく、確実に設定）

## 🎯 ロール設定の優先順位

トリガー関数（`handle_new_user`）でのロール設定の優先順位：

1. **最優先**: `user_metadata.invited_as` が設定されている場合
   - `invited_as='staff'` → `role='staff'`
   - `invited_as='admin'` → `role='admin'`
2. **次**: メールアドレスに `admin` が含まれている場合 → `role='admin'`
3. **次**: メールアドレスに `staff` が含まれている場合 → `role='staff'`
4. **デフォルト**: `role='customer'`

## 🔐 認証フロー

### ログイン時（AuthContext.tsx）

```
1. getInitialSession() でセッション確認
   ↓
2. セッションがある場合、setUserFromSession() を実行
   ↓
3. public.users テーブルからロール情報を取得
   ↓
4. ロール情報を元にユーザー情報を設定
```

### パスワード設定時（SetPassword.tsx）

```
1. 招待リンクからアクセス（URLにaccess_token, refresh_tokenが含まれる）
   ↓
2. onAuthStateChange でセッション確立を監視
   ↓
3. URLからトークンを取得して setSession() を実行
   ↓
4. セッション確立後、パスワード設定可能
   ↓
5. updateUser() でパスワードを設定
```

## 📊 データベース構造

### auth.users (Supabase Authentication)
- `id`: UUID（主キー）
- `email`: メールアドレス
- `raw_user_meta_data`: メタデータ（`invited_as`など）

### public.users (アプリケーション)
- `id`: UUID（auth.users.idを参照、主キー）
- `email`: メールアドレス
- `role`: app_role型（'admin' | 'staff' | 'customer'）
- `created_at`, `updated_at`: タイムスタンプ

### public.staff
- `id`: UUID（主キー）
- `user_id`: UUID（auth.users.idを参照、NULL可）
- `name`, `email`, `phone` など: スタッフ情報

## ⚠️ 現在の問題点

1. **トリガーに依存している**: トリガーが失敗すると`users`テーブルにレコードが作成されない
2. **タイミングの問題**: トリガーの実行タイミングと`invite-staff`関数の実行タイミングがずれる可能性がある

## ✅ 解決策

1. **トリガー関数の改善**: エラーハンドリングを追加し、エラーが発生しても`auth.users`の作成は続行
2. **invite-staff関数の改善**: トリガーに依存せず、確実に`users`テーブルにレコードを作成
3. **リトライ処理**: 5回リトライして確実に`staff`ロールを設定

## 🔍 確認方法

### スタッフ招待が正しく動作しているか確認

1. **Supabase Dashboard** → **Authentication** → **Users** でユーザーが作成されているか確認
2. **Supabase Dashboard** → **Table Editor** → **users** でレコードが作成され、`role='staff'`になっているか確認
3. **Supabase Dashboard** → **Table Editor** → **staff** で`user_id`が設定されているか確認

### ログイン時のロール確認

1. ブラウザのコンソールで`AuthContext`のログを確認
2. `users`テーブルからロール情報が正しく取得されているか確認

