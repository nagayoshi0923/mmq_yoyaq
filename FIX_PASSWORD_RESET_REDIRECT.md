# パスワードリセット リダイレクト修正

## 🔍 問題

パスワードリセットメールのリンクをクリックしても、パスワード変更画面ではなくログイン画面に戻ってしまう。

## 原因

Supabase Dashboardの「Site URL」と「Redirect URLs」の設定が必要です。

---

## 🛠️ 修正手順

### ステップ1: Supabase Dashboard を開く

```
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/auth/url-configuration
```

### ステップ2: Site URL を設定

**Site URL** に以下を入力：

**開発環境**:
```
http://localhost:5174
```

**本番環境**（デプロイ後）:
```
https://your-production-domain.com
```

### ステップ3: Redirect URLs を追加

**Redirect URLs** に以下を追加（複数可）：

```
http://localhost:5173/*
http://localhost:5174/*
http://localhost:5175/*
```

本番環境がある場合は追加：
```
https://your-production-domain.com/*
```

### ステップ4: Save をクリック

---

## ✅ 確認方法

### 1. 設定を保存したら、もう一度パスワードリセットメールを送信

60秒待ってから、新しいメールを送信してください。

### 2. メールのリンクをクリック

### 3. URLを確認

ブラウザのアドレスバーに以下のようなURLが表示されるはずです：

```
http://localhost:5174/#access_token=eyJhb...&expires_in=3600&refresh_token=...&token_type=bearer&type=recovery
```

重要なパラメータ：
- ✅ `access_token=...` がある
- ✅ `type=recovery` がある

### 4. パスワード変更画面が表示される

正しく設定されていれば、`ResetPassword` コンポーネントが表示されます。

---

## 🔍 トラブルシューティング

### 問題A: まだログイン画面に戻る

**原因**: Site URLが間違っている

**解決方法**:
1. Supabase Dashboard → Auth → URL Configuration
2. Site URLを正確に設定（末尾にスラッシュなし）
3. Save

### 問題B: URLにaccess_tokenが含まれていない

**原因**: Redirect URLsが設定されていない

**解決方法**:
1. Redirect URLsに `http://localhost:5174/*` を追加
2. Save
3. 新しいパスワードリセットメールを送信

### 問題C: "Invalid redirect URL" エラー

**原因**: リダイレクト先がRedirect URLsに登録されていない

**解決方法**:
1. エラーメッセージに表示されているURLをコピー
2. Redirect URLsに追加
3. Save

---

## 📝 設定例

### 開発環境のみ

```
Site URL: http://localhost:5174

Redirect URLs:
  http://localhost:5173/*
  http://localhost:5174/*
  http://localhost:5175/*
```

### 開発環境 + 本番環境

```
Site URL: https://mmq.example.com

Redirect URLs:
  http://localhost:5173/*
  http://localhost:5174/*
  http://localhost:5175/*
  https://mmq.example.com/*
  https://www.mmq.example.com/*
```

---

## 🎯 重要なポイント

1. **Site URL**: メインのアプリURL（末尾にスラッシュなし）
2. **Redirect URLs**: 許可するリダイレクト先（ワイルドカード `/*` を使用）
3. **開発環境の複数ポート**: Viteはポートが使用中の場合、自動的に次のポートを使うので、複数登録しておく

---

## ✅ 完了後のテスト

1. Supabase Dashboard で設定を保存
2. 60秒待つ
3. パスワードリセットメールを再送信
4. メールのリンクをクリック
5. パスワード変更画面が表示される ✅

---

## 参考: App.tsxのルーティング

システムは以下のロジックでパスワードリセット画面を表示します：

```typescript
// URLにaccess_tokenとtype=recoveryが含まれている場合
if (fullUrl.includes('access_token=') && fullUrl.includes('type=recovery')) {
  return <ResetPassword />  // パスワード変更画面を表示
}

// それ以外の場合
// 通常のルーティング（ログイン画面など）
```

つまり、メールからのリダイレクトで `access_token` と `type=recovery` パラメータが
正しく渡されることが重要です。


