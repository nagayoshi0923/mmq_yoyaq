# Resend パスワードリセットメール設定ガイド

## 🎯 目標
ログイン画面からパスワードリセットメールを送信できるようにする

## 📋 現状確認

このシステムでは以下のメール送信を使用しています：
- ✅ **予約確認メール**: Resend API（Edge Function経由）
- ✅ **リマインダーメール**: Resend API（Edge Function経由）
- ✅ **スタッフ招待メール**: Resend API（Edge Function経由）
- ❌ **パスワードリセットメール**: Supabase Auth SMTP（**未設定**）

## ⚠️ 重要な違い

### Edge Function経由のメール（既に動作中）
- 予約確認メールなどは **Supabase Edge Functions** から **Resend API** を直接呼び出す
- `RESEND_API_KEY` シークレットを使用

### Supabase Auth関連のメール（設定が必要）
- パスワードリセット、サインアップ確認メールは **Supabase Auth** が送信
- Supabase Authには **SMTP設定** が必要（Resend SMTP経由）

---

## セットアップ手順

### ステップ1: Resend SMTP認証情報の取得（5分）

#### 1. Resendにログイン
https://resend.com/

#### 2. SMTP認証情報を取得

Resendダッシュボードで：
1. 左メニュー「**Settings**」→「**SMTP**」を選択
2. SMTP認証情報を確認：

```
Host: smtp.resend.com
Port: 587 (TLS) または 465 (SSL)
Username: resend
Password: re_xxxxxxxxxx (APIキーと同じ)
```

**注意**: パスワードは既存の **RESEND_API_KEY** と同じ値です！

---

### ステップ2: Supabase Auth SMTP設定（5分）

#### 1. Supabase Dashboardを開く

プロジェクトURL:
```
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/settings/auth
```

#### 2. SMTP設定セクションまでスクロール

画面下部の「**SMTP Settings**」セクションを探す

#### 3. 以下の情報を入力

```
Enable Custom SMTP: ON ✅

Sender name: MMQ予約システム
Sender email: onboarding@resend.dev

Host: smtp.resend.com
Port: 587
Admin email: mai.nagayoshi@gmail.com

SMTP Username: resend
SMTP Password: [Your RESEND_API_KEY]
```

**重要ポイント**:
- 📧 **Sender email**: 開発環境では `onboarding@resend.dev` を使用
- 🔑 **SMTP Password**: 既存の `RESEND_API_KEY` の値を入力
- 👤 **SMTP Username**: 常に `resend` です

#### 4. 保存

「**Save**」ボタンをクリック

---

### ステップ3: テスト（3分）

#### 3-1. パスワードリセットをテスト

1. アプリにアクセス: `http://localhost:5173`（または本番URL）
2. ログイン画面で「**パスワードを忘れた場合**」をクリック
3. メールアドレスを入力（例: `mai.nagayoshi@gmail.com`）
4. 「**リセットメールを送信**」をクリック
5. メールを確認 ✅

#### 3-2. サインアップメールもテスト（オプション）

1. 「**アカウントを作成**」をクリック
2. 新しいメールアドレスとパスワードを入力
3. 「**アカウント作成**」をクリック
4. 確認メールが届くか確認 ✅

---

## 本番環境の設定（独自ドメインを使用する場合）

### ステップA: Resendでドメインを認証

#### 1. Resendでドメインを追加

1. Resendダッシュボード → 「**Domains**」
2. 「**Add Domain**」
3. ドメインを入力（例: `mmq.example.com`）

#### 2. DNSレコードを設定

Resendが表示する以下のレコードをDNSに追加：

**SPFレコード**:
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.resend.com ~all
```

**DKIMレコード**:
```
Type: TXT
Name: resend._domainkey
Value: [Resendが提供する値]
```

**DMARCレコード**:
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com
```

#### 3. 認証を確認

Resendダッシュボードで「**Verify Domain**」をクリックし、認証が完了するまで待つ（数分〜数時間）

### ステップB: Supabase SMTP設定を更新

認証が完了したら、Supabase DashboardのSMTP設定を更新：

```
Sender email: noreply@mmq.example.com
```

（`onboarding@resend.dev` から独自ドメインに変更）

---

## トラブルシューティング

### ❌ メールが届かない

#### 確認1: SMTP設定が保存されているか
- Supabase Dashboard → Settings → Auth → SMTP Settings
- 「Enable Custom SMTP」が **ON** になっているか確認

#### 確認2: RESEND_API_KEYが正しいか
```bash
# 現在の設定を確認
supabase secrets list
```

#### 確認3: 迷惑メールフォルダを確認
- Gmail、Outlookなどの迷惑メールフォルダをチェック

#### 確認4: Resendのログを確認
1. Resendダッシュボード → 「**Emails**」
2. 最近の送信履歴を確認
3. エラーがある場合は詳細を確認

#### 確認5: Supabaseのログを確認
- Supabase Dashboard → Logs
- Auth関連のエラーがないか確認

### ❌ "Invalid login credentials" エラー

SMTP認証情報が間違っている可能性があります：

- **Username**: `resend`（固定）
- **Password**: `RESEND_API_KEY`の値（`re_`で始まる）

### ❌ "Sender email not verified" エラー

本番環境で独自ドメインを使用する場合：
- Resendでドメイン認証が完了しているか確認
- DNSレコードが正しく設定されているか確認

---

## メールテンプレートのカスタマイズ（オプション）

### Supabase Email Templates

Supabase Dashboard → Auth → Email Templates で以下をカスタマイズ可能：

1. **Confirm signup** - サインアップ確認メール
2. **Invite user** - ユーザー招待メール
3. **Magic Link** - マジックリンクメール
4. **Reset password** - パスワードリセットメール

カスタマイズ例：

```html
<h2>パスワードリセット</h2>
<p>{{ .Email }} 様</p>
<p>パスワードをリセットするには、以下のリンクをクリックしてください：</p>
<p><a href="{{ .ConfirmationURL }}">パスワードをリセット</a></p>
<p>このリンクは1時間有効です。</p>
<p>心当たりがない場合は、このメールを無視してください。</p>
```

---

## 完了チェックリスト

- [ ] Resend SMTP認証情報を取得
- [ ] Supabase Auth SMTP設定を完了
- [ ] パスワードリセットメールのテストが成功
- [ ] サインアップ確認メールのテストが成功（オプション）
- [ ] 本番環境の場合：ドメイン認証を完了（オプション）

---

## 参考情報

### 使用中のメール送信方法まとめ

| メール種類 | 送信方法 | 設定場所 |
|---------|---------|---------|
| 予約確認メール | Edge Function → Resend API | `RESEND_API_KEY` シークレット |
| リマインダーメール | Edge Function → Resend API | `RESEND_API_KEY` シークレット |
| スタッフ招待 | Edge Function → Resend API | `RESEND_API_KEY` シークレット |
| パスワードリセット | Supabase Auth → Resend SMTP | Auth SMTP設定 |
| サインアップ確認 | Supabase Auth → Resend SMTP | Auth SMTP設定 |

### 関連ドキュメント

- [Resend SMTP Documentation](https://resend.com/docs/smtp)
- [Supabase SMTP Setup](https://supabase.com/docs/guides/auth/auth-smtp)
- [Resend Pricing](https://resend.com/pricing) - 月3,000通まで無料

### 料金について

**Resend無料枠**:
- 月 **3,000通** まで無料
- 無制限のドメイン認証
- 開発用に `onboarding@resend.dev` が使用可能

**注意**: 予約確認メール + パスワードリセットメールなど、すべてのメールが同じ月間上限にカウントされます。

---

## さらにヘルプが必要な場合

エラーが解決しない場合は、以下の情報を確認してください：

1. Supabase Dashboard → Logs（Auth関連のエラー）
2. Resend Dashboard → Emails（送信履歴とエラー）
3. ブラウザのコンソールログ（フロントエンドのエラー）

問題が続く場合は、開発チームに連絡してください。


