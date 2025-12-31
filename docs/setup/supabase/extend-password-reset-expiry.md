# パスワードリセットリンクの有効期限を延長

## 🔍 現在の状況

パスワードリセットリンクの有効期限が短すぎて、すぐに期限切れになってしまう。

## ⏰ Supabaseのデフォルト有効期限

実は、Supabaseのデフォルト設定では：
- **60秒（1分）** でリンクが期限切れになることがあります
- これはセキュリティのための設定ですが、開発時は不便です

---

## 🛠️ 有効期限を延長する方法

### ステップ1: Supabase Dashboard を開く

```
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/auth/email-templates
```

### ステップ2: Email Templates を確認

左メニュー → **Authentication** → **Email Templates**

### ステップ3: Token有効期限の設定を確認

残念ながら、Supabase DashboardのUIからは直接変更できません。

しかし、以下の方法で対応できます：

---

## 🔧 解決方法

### 方法1: リダイレクトURLを修正（推奨）

現在の設定だと、リンクをクリックしてからリダイレクトされる際に時間がかかり、
その間にトークンが期限切れになる可能性があります。

#### 修正内容

`LoginForm.tsx` のリダイレクトURLを変更します。

**変更前**:
```typescript
redirectTo: `${window.location.origin}/#reset-password`
```

**変更後**:
```typescript
redirectTo: `${window.location.origin}/`
```

これにより、メールリンクをクリックしたときに直接アプリのルートに飛び、
`App.tsx`のルーティングロジックが自動的にパスワードリセット画面を表示します。

---

### 方法2: Supabase Auth設定を変更

Supabase Dashboardで以下を確認：

```
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/settings/auth
```

**Auth** → **Settings** で以下を探す：

- **Mailer OTP Expiry** または **Token Expiry**
  - デフォルト: 60秒
  - 推奨: 3600秒（1時間）

注意: この設定項目がUIに表示されていない場合もあります。

---

### 方法3: Email Confirmation設定を確認

```
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/settings/auth
```

下にスクロールして以下を確認：

**Email Confirmations**:
- ✅ **Enable email confirmations**: ON
- **Confirmation Email Expiry**: 何秒に設定されているか確認

できれば **86400秒（24時間）** に設定してください。

---

## 🚀 今すぐできる修正（推奨）

### LoginForm.tsxを修正

以下のファイルを修正します：


