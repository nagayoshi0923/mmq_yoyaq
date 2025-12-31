# メール送信機能セットアップガイド（Resend + 独自ドメイン）

## 📧 概要

このシステムでは、**Resend API** + **独自ドメイン（mmq.game）** を使用してメール送信を行っています。

### メール送信の種類

| メール種類 | 送信方法 | 使用するドメイン |
|---------|---------|---------------|
| 予約確認メール | Edge Function → Resend API | `booking@mmq.example.com` |
| リマインダーメール | Edge Function → Resend API | `booking@mmq.example.com` |
| スタッフ招待メール | Edge Function → Resend API | `noreply@mmq.game` ✅ |
| パスワードリセット | Supabase Auth → Resend SMTP | 要設定 |
| サインアップ確認 | Supabase Auth → Resend SMTP | 要設定 |

## 前提条件

- ✅ Supabaseプロジェクトが作成されている
- ✅ Supabase CLIがインストールされている（`npm install -g supabase`）
- ✅ 独自ドメイン `mmq.game` を所有している
- ⚠️ DNSレコードを編集できる権限がある

---

## セットアップ手順

### ステップ1: Resendアカウントの作成（5分）

#### 1. Resendアカウントを作成

1. [Resend](https://resend.com)にアクセス
2. 「Sign Up」でアカウントを作成
3. メールアドレスを認証

#### 2. APIキーを取得

1. Resendダッシュボード → 「**API Keys**」
2. 「**Create API Key**」をクリック
3. Name: `MMQ Production`
4. Permission: `Sending access` (Full Access)
5. 「**Create**」をクリック
6. **APIキーをコピー**（`re_`で始まる文字列）⚠️ 一度しか表示されません

---

### ステップ2: Resendでドメインを認証（15分）

#### 1. ドメインを追加

1. Resendダッシュボード → 「**Domains**」
2. 「**Add Domain**」をクリック
3. Domain: `mmq.game` を入力
4. 「**Add**」をクリック

#### 2. DNSレコードを設定

Resendが表示する以下のレコードをDNSに追加します：

**SPFレコード**:
```
Type: TXT
Name: @ (または mmq.game)
Value: v=spf1 include:_spf.resend.com ~all
TTL: 3600
```

**DKIMレコード**:
```
Type: TXT
Name: resend._domainkey
Value: [Resendが提供する長い文字列]
TTL: 3600
```

**DMARCレコード**（オプションだが推奨）:
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:postmaster@mmq.game
TTL: 3600
```

#### 3. DNS設定例（お名前.com / Cloudflare / Route53）

**お名前.comの場合**:
1. DNS設定画面を開く
2. 「DNSレコード設定」を選択
3. 上記のレコードを追加
4. 保存

**Cloudflareの場合**:
1. ダッシュボード → ドメイン → DNS
2. 「Add record」で上記を追加

**AWS Route53の場合**:
1. Hosted Zones → mmq.game を選択
2. 「Create record」で上記を追加

#### 4. ドメイン認証を確認

1. DNSレコード追加後、Resendに戻る
2. 「**Verify Domain**」をクリック
3. ステータスが「**Verified**」になるまで待つ（数分〜数時間）

💡 **ヒント**: DNS反映には最大48時間かかる場合がありますが、通常は数分で完了します。

---

### ステップ3: SupabaseにAPIキーを設定（3分）

#### 方法A: Supabase Dashboard（推奨）

1. [Supabase Dashboard](https://app.supabase.com)にログイン
2. プロジェクトを選択（`cznpcewciwywcqcxktba`）
3. 左メニュー → 「**Settings**」→「**Edge Functions**」
4. 「**Add new secret**」をクリック
5. 以下を入力：
   - Name: `RESEND_API_KEY`
   - Value: [ステップ1でコピーしたAPIキー]
6. 「**Save**」をクリック

#### 方法B: Supabase CLI

```bash
cd /Users/nagayoshimai/mmq_yoyaq

# Supabaseにログイン（初回のみ）
supabase login

# プロジェクトにリンク（初回のみ）
supabase link --project-ref cznpcewciwywcqcxktba

# シークレットを設定
supabase secrets set RESEND_API_KEY=re_your_api_key_here
```

---

### ステップ4: Supabase Auth SMTP設定（パスワードリセット用）（5分）

パスワードリセットメールやサインアップ確認メールを送信するには、Supabase AuthのSMTP設定が必要です。

#### 1. Supabase Auth設定を開く

```
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/settings/auth
```

#### 2. SMTP Settingsセクションまでスクロール

画面下部の「**SMTP Settings**」セクションを探す

#### 3. 以下の情報を入力

```
Enable Custom SMTP: ON ✅

Sender name: MMQ
Sender email: noreply@mmq.game

Host: smtp.resend.com
Port: 587
Admin email: mai.nagayoshi@gmail.com

SMTP Username: resend
SMTP Password: [ステップ1で取得したRESEND_API_KEY]
```

**重要ポイント**:
- 📧 **Sender email**: `noreply@mmq.game`（認証済みドメイン）
- 🔑 **SMTP Password**: `RESEND_API_KEY`と同じ値
- 👤 **SMTP Username**: 常に `resend`（固定）

#### 4. 保存

「**Save**」ボタンをクリック

---

### ステップ5: Edge Functionsのデプロイ（5分）

#### 1. Edge Functionsをデプロイ

```bash
cd /Users/nagayoshimai/mmq_yoyaq

# すべてのEdge Functionsをデプロイ
./deploy-functions.sh

# または個別にデプロイ
./deploy-single-function.sh send-booking-confirmation
./deploy-single-function.sh send-reminder-emails
./deploy-single-function.sh invite-staff
```

#### 2. デプロイの確認

```bash
# デプロイされたFunctionsを確認
supabase functions list
```

---

### ステップ6: 送信元メールアドレスの確認と統一（重要）

現在、異なるEdge Functionで異なるメールアドレスを使用しています。統一を推奨します。

#### 現在の設定:

| Function | 現在のメールアドレス | 推奨 |
|---------|-------------------|-----|
| `invite-staff` | `noreply@mmq.game` ✅ | そのまま |
| `send-booking-confirmation` | `booking@mmq.example.com` ❌ | `noreply@mmq.game`に変更 |
| `send-reminder-emails` | `booking@mmq.example.com` ❌ | `noreply@mmq.game`に変更 |

#### 統一する場合（推奨）:

すべてのメール送信元を `noreply@mmq.game` に統一することで、ドメイン認証が一貫します。

**変更方法**:

1. `supabase/functions/send-booking-confirmation/index.ts` の187行目を修正:
```typescript
from: 'MMQ予約システム <noreply@mmq.game>',
```

2. `supabase/functions/send-reminder-emails/index.ts` の91行目を修正:
```typescript
from: 'MMQ予約システム <noreply@mmq.game>',
```

3. 再デプロイ:
```bash
./deploy-functions.sh
```

---

## テスト手順

### テスト1: パスワードリセットメール（最優先）

#### 1. アプリにアクセス

本番: https://your-app-url.com  
ローカル: http://localhost:5173

#### 2. パスワードリセットをテスト

1. ログイン画面を開く
2. 「**パスワードを忘れた場合**」をクリック
3. メールアドレスを入力（例: `mai.nagayoshi@gmail.com`）
4. 「**リセットメールを送信**」をクリック
5. **メールを確認** ✅

**期待される結果**:
- ✅ 「パスワードリセット用のメールを送信しました」メッセージが表示される
- ✅ 数分以内にメールが届く
- ✅ メールのリンクをクリックするとパスワード変更画面に遷移

#### 3. トラブルシューティング

メールが届かない場合：
- 迷惑メールフォルダを確認
- Resend Dashboard → Emails で送信ログを確認
- Supabase Dashboard → Logs でエラーを確認

---

### テスト2: サインアップ確認メール（オプション）

1. 「**アカウントを作成**」をクリック
2. 新しいメールアドレスとパスワードを入力
3. 「**アカウント作成**」をクリック
4. 確認メールが届くことを確認 ✅

---

### テスト3: 予約確認メール

1. 予約サイトから実際に予約を作成
2. 予約確認メールが届くことを確認 ✅

**確認ポイント**:
- ✅ 送信元: `MMQ予約システム <noreply@mmq.game>`
- ✅ 件名: `【予約完了】シナリオ名 - 日付`
- ✅ 予約番号、シナリオ、日時などが正しく表示される

---

### テスト4: スタッフ招待メール

1. 管理画面でスタッフを招待
2. 招待メールが届くことを確認 ✅

---

## 現在実装されているメール機能

| メール種類 | トリガー | テンプレート | ステータス |
|---------|---------|------------|---------|
| 予約確認メール | 予約完了時 | HTMLテンプレート | ✅ 実装済み |
| リマインダーメール | スケジュール設定 | HTMLテンプレート | ✅ 実装済み |
| スタッフ招待メール | スタッフ招待時 | HTMLテンプレート | ✅ 実装済み |
| パスワードリセット | リセット要求時 | Supabase標準 | ⚠️ SMTP設定が必要 |
| サインアップ確認 | アカウント作成時 | Supabase標準 | ⚠️ SMTP設定が必要 |

---

## トラブルシューティング

### ❌ パスワードリセットメールが届かない

#### 確認1: Supabase Auth SMTP設定が有効か

```
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/settings/auth
```

- [ ] **Enable Custom SMTP**: ON になっているか
- [ ] **Sender email**: `noreply@mmq.game` になっているか
- [ ] **Host**: `smtp.resend.com` になっているか
- [ ] **Port**: `587` になっているか
- [ ] **Username**: `resend` になっているか
- [ ] **Password**: `RESEND_API_KEY` と同じ値が入っているか

#### 確認2: Resendのドメイン認証が完了しているか

Resend Dashboard → Domains → `mmq.game` のステータスが「**Verified**」になっているか確認

#### 確認3: 迷惑メールフォルダを確認

Gmail、Outlookなどの迷惑メールフォルダをチェック

#### 確認4: Resendのログを確認

1. Resend Dashboard → 「**Emails**」
2. 最近の送信履歴を確認
3. エラーがある場合は詳細を確認

#### 確認5: Supabaseのログを確認

```
https://supabase.com/dashboard/project/cznpcewciwywcqcxktba/logs
```

Auth関連のエラーがないか確認

---

### ❌ 予約確認メールが届かない

#### 確認1: RESEND_API_KEYが設定されているか

```bash
supabase secrets list
```

`RESEND_API_KEY` が表示されることを確認

#### 確認2: Edge Functionのログを確認

```bash
supabase functions logs send-booking-confirmation --limit 50
```

または、Supabase Dashboard → Edge Functions → send-booking-confirmation → Logs

#### 確認3: メールアドレスのドメインを確認

`booking@mmq.example.com` を使用している場合は `noreply@mmq.game` に変更してください（ステップ6参照）

---

### ❌ "Invalid login credentials" エラー（SMTP）

SMTP認証情報が間違っている可能性があります：

- **Username**: `resend`（固定）
- **Password**: `RESEND_API_KEY`の値（`re_`で始まる）

Supabase Auth設定を再確認してください。

---

### ❌ "Sender email not verified" エラー

Resendでドメイン認証が完了していない可能性があります：

1. Resend Dashboard → Domains → `mmq.game`
2. ステータスが「**Verified**」になっているか確認
3. DNSレコードが正しく設定されているか確認

DNSレコードの確認方法（ターミナル）:
```bash
# SPFレコードの確認
dig txt mmq.game +short

# DKIMレコードの確認
dig txt resend._domainkey.mmq.game +short
```

---

### ❌ "Rate limit exceeded" エラー

Resendの無料枠（月3,000通）を超えている可能性があります。

**対処方法**:
1. Resend Dashboard → Usage で使用量を確認
2. 必要に応じて有料プランにアップグレード

---

## セキュリティ

- ✅ Resend APIキーはSupabase Secretsで安全に管理
- ✅ Edge Functionは認証されたリクエストのみ処理
- ✅ メール送信はサーバーサイドで実行（クライアント側に秘密情報を露出しない）
- ✅ 独自ドメイン使用でSPF/DKIM/DMARC認証を実装
- ✅ Supabase Auth SMTPは暗号化接続（TLS）を使用

---

## 料金

### Resend料金

| プラン | 月間送信数 | 料金 |
|-------|-----------|------|
| Free | 3,000通 | 無料 |
| Pro | 50,000通 | $20/月 |
| Business | 100,000通 | $80/月 |

**注意**: 
- 予約確認メール + リマインダー + パスワードリセットなど、すべてのメールが同じ月間上限にカウントされます
- 上限を超えるとメール送信が停止します

詳細: https://resend.com/pricing

### Supabase Edge Functions料金

- **無料枠**: 月500,000リクエストまで無料
- **有料**: それ以降は$2 per 1M requests

詳細: https://supabase.com/pricing

---

## 完了チェックリスト

設定が完了したら、以下を確認してください：

- [ ] Resendアカウントを作成
- [ ] Resend APIキーを取得
- [ ] Resendで `mmq.game` ドメインを認証（Verified状態）
- [ ] Supabaseに `RESEND_API_KEY` を設定
- [ ] Supabase Auth SMTP設定を完了
- [ ] Edge Functionsをデプロイ
- [ ] 送信元メールアドレスを `noreply@mmq.game` に統一
- [ ] パスワードリセットメールのテストが成功
- [ ] 予約確認メールのテストが成功
- [ ] スタッフ招待メールのテストが成功

---

## 参考リンク

### 公式ドキュメント

- [Resend Documentation](https://resend.com/docs)
- [Resend SMTP Setup](https://resend.com/docs/send-with-smtp)
- [Supabase Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Secrets Management](https://supabase.com/docs/guides/functions/secrets)

### ヘルプとサポート

- [Resend Support](https://resend.com/support)
- [Supabase Discord](https://discord.supabase.com/)

---

## 関連ドキュメント

- `RESEND_PASSWORD_RESET_SETUP.md` - パスワードリセット詳細ガイド
- `deploy-functions.sh` - Edge Functionsデプロイスクリプト
- `deploy-single-function.sh` - 個別デプロイスクリプト

