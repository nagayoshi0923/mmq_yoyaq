# SMTP設定確認チェックリスト

## 🔍 メールが届かない原因を特定

メッセージは表示されるがメールが届かない = SMTP設定に問題がある可能性が高い

---

## ステップ1: Supabase Dashboard で SMTP設定を確認

### 1-1. 設定画面を開く

```
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/settings/auth
```

### 1-2. 画面を下にスクロールして「SMTP Settings」を探す

### 1-3. 以下を確認

- [ ] **Enable Custom SMTP**: ON になっているか？
- [ ] **Sender name**: 何か入力されているか？（例: MMQ）
- [ ] **Sender email**: `noreply@mmq.game` または `onboarding@resend.dev` になっているか？
- [ ] **Host**: `smtp.resend.com` になっているか？
- [ ] **Port**: `587` になっているか？
- [ ] **Username**: `resend` になっているか？
- [ ] **Password**: 何か入力されているか？（`re_`で始まるAPIキー）

---

## ステップ2: Resend API Keyを確認

### 2-1. Resend Dashboardでキーを確認

```
https://resend.com/
左メニュー → API Keys
```

APIキーが表示される（`re_`で始まる文字列）

### 2-2. Supabase SecretsでRESEND_API_KEYを確認

ターミナルで実行：
```bash
cd /Users/nagayoshimai/mmq_yoyaq
supabase secrets list
```

`RESEND_API_KEY` の値を確認

### 2-3. 両方が一致するか確認

Supabase Auth SMTP設定の「Password」欄に入力した値と、
`RESEND_API_KEY` の値が**同じ**であることを確認

---

## ステップ3: Resendのドメイン認証を確認

### 3-1. Resend Dashboardでドメインを確認

```
https://resend.com/domains
```

### 3-2. mmq.game のステータスを確認

- [ ] ステータスが「**Verified**」になっているか？
- [ ] 「Pending」や「Failed」になっていないか？

### 3-3. もし認証されていない場合

#### オプション1: 一時的に開発用メールアドレスを使う

Supabase Auth SMTP設定で：
```
Sender email: onboarding@resend.dev
```

この設定で保存してテスト。届けば、ドメイン認証の問題。

#### オプション2: ドメイン認証を完了させる

Resend Dashboard → Domains → mmq.game → DNS設定を確認

---

## ステップ4: Supabase Logsで詳細なエラーを確認

### 4-1. ログを開く

```
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/logs
```

### 4-2. Auth関連のログをフィルター

- 「Auth」または「SMTP」でフィルター
- 最近のエラーログを確認

### 4-3. よくあるエラーメッセージ

| エラー | 原因 | 解決方法 |
|-------|------|---------|
| `Authentication failed` | SMTPパスワードが間違っている | 正しい`RESEND_API_KEY`を入力 |
| `Sender not verified` | ドメイン認証未完了 | `onboarding@resend.dev`を使うか、ドメイン認証を完了 |
| `Connection timeout` | Host/Portが間違っている | `smtp.resend.com:587`を確認 |

---

## ステップ5: Resend Dashboard でメール送信ログを確認

### 5-1. Resend Emailsページを開く

```
https://resend.com/emails
```

### 5-2. 最近の送信履歴を確認

- [ ] パスワードリセットのメールが表示されているか？
- [ ] ステータスは何か？（Sent / Failed / Bounced）
- [ ] エラーメッセージが表示されているか？

### 5-3. もしログに何も表示されていない場合

→ **Supabase AuthがResendに接続できていません**
→ SMTP設定（Host/Port/Username/Password）を再確認

---

## 🚨 最も可能性が高い原因

### 1. Enable Custom SMTP が OFF

→ ON にして保存

### 2. Sender email が認証されていないドメイン

`booking@mmq.example.com` などの存在しないドメインを使用していないか？

→ `onboarding@resend.dev`（開発用）または `noreply@mmq.game`（認証済み）を使用

### 3. SMTP Password が間違っている

空欄、または古いAPIキーを使用していないか？

→ 現在有効な`RESEND_API_KEY`を確認して入力

---

## ✅ 正しい設定（コピペ用）

```
Enable Custom SMTP: ON

Sender name: MMQ
Sender email: onboarding@resend.dev  ← まずはこれでテスト

Host: smtp.resend.com
Port: 587
Admin email: mai.nagayoshi@gmail.com

SMTP Username: resend
SMTP Password: [Your RESEND_API_KEY]  ← 必ず正しいキーを入力
```

---

## 🧪 設定後のテスト手順

1. **Save**をクリックして保存
2. **1-2分待つ**（設定反映に時間がかかる）
3. ブラウザをリフレッシュ
4. **別のメールアドレス**でテスト（レート制限を避けるため）
5. メールが届くか確認

---

## 📞 次に確認すること

上記をすべて確認したら、以下の情報を教えてください：

1. Supabase SMTP設定画面の「Enable Custom SMTP」は ON になっていますか？
2. 「Sender email」に何が入っていますか？
3. Resend Dashboard の Domains で mmq.game は「Verified」ですか？
4. Resend Dashboard の Emails で送信ログは表示されていますか？

これらの情報があれば、より具体的な解決策を提案できます。


