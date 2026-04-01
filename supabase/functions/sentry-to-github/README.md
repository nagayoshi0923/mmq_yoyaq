# sentry-to-github Edge Function

Sentry Internal Integration の Webhook を受け取り、条件を満たす場合のみ GitHub Issue を自動作成します。

```
Sentry Internal Integration
  → Webhook (sentry-hook-signature: HMAC-SHA256)
    → sentry-to-github Edge Function
      → GitHub Issues API
      → sentry_github_issues テーブル（重複防止）
```

## 処理フロー

1. POST メソッド・CORS チェック
2. `sentry-hook-signature` ヘッダーを HMAC-SHA256 で検証
3. payload を JSON パース・正規化
4. `SENTRY_ALLOWED_ENVIRONMENT`（デフォルト: `production`）以外はスキップ（200）
5. `sentry_github_issues` テーブルで重複チェック → 既存ならスキップ（200）
6. GitHub Issues API で Issue 作成
7. `sentry_github_issues` テーブルに対応関係を保存

## Step 1: Sentry Internal Integration を作成する

通常の Alert Rule Webhook とは**異なる**設定が必要です。

1. Sentry にログイン → **Settings** → **Developer Settings** → **New Internal Integration**
2. 以下を設定:
   - **Name**: `GitHub Issue Creator`（任意）
   - **Webhook URL**: `https://<project-ref>.supabase.co/functions/v1/sentry-to-github`
   - **Webhooks**: `✅ Enable webhooks` をオン
   - **Subscribe to Events**: `Issue` にチェック
   - **Permissions**: `Issue & Event` → `Read`
3. **Save** をクリック
4. 保存後に表示される **Client Secret** をコピーしておく（`SENTRY_WEBHOOK_SECRET` として使う）

## Step 2: 必要な Secrets を設定する

| Secret 名 | 説明 | 取得場所 |
|-----------|------|---------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | GitHub → Settings → Developer settings → Personal access tokens |
| `GITHUB_OWNER` | GitHub オーナー名（例: `myorg`） | リポジトリ URL から |
| `GITHUB_REPO` | GitHub リポジトリ名（例: `myapp`） | リポジトリ URL から |
| `SENTRY_WEBHOOK_SECRET` | Sentry Internal Integration の Client Secret | Step 1 で取得 |
| `SENTRY_ALLOWED_ENVIRONMENT` | 対象 environment（デフォルト: `production`） | 任意 |
| `GITHUB_ISSUE_LABELS` | カンマ区切りラベル（デフォルト: `bug,sentry,production`） | 任意 |

### GitHub Token に必要なスコープ

- **Classic token**: `repo` スコープ（private リポジトリ）または `public_repo`（public）
- **Fine-grained token**: 対象リポジトリへの `Issues: Read and write` 権限

### Supabase CLI で設定

```bash
# ステージング
supabase secrets set \
  GITHUB_TOKEN=ghp_xxxxxxxxxxxx \
  GITHUB_OWNER=myorg \
  GITHUB_REPO=myapp \
  SENTRY_WEBHOOK_SECRET=<Sentry の Client Secret> \
  --project-ref lavutzztfqbdndjiwluc

# 本番（確認後）
supabase secrets set \
  GITHUB_TOKEN=ghp_xxxxxxxxxxxx \
  GITHUB_OWNER=myorg \
  GITHUB_REPO=myapp \
  SENTRY_WEBHOOK_SECRET=<Sentry の Client Secret> \
  --project-ref cznpcewciwywcqcxktba
```

## Step 3: デプロイ

```bash
# DB migration 適用（ステージング）
npm run db:push:staging

# Edge Function デプロイ（ステージング）
supabase functions deploy sentry-to-github --project-ref lavutzztfqbdndjiwluc
```

ステージングで動作確認後、本番への適用はユーザー判断で実行してください。

## ローカルテスト（curl サンプル）

```bash
supabase start
```

HMAC-SHA256 の署名を手動で生成してテストします。

```bash
# シークレットと payload を用意
SECRET="your-client-secret"
PAYLOAD='{"action":"created","data":{"issue":{"id":"12345678","title":"予約作成時に500エラー","culprit":"src/lib/reservationApi.ts","level":"error","count":"3","userCount":2,"project":{"slug":"mmq-yoyaq"},"permalink":"https://sentry.io/organizations/myorg/issues/12345678/"},"event":{"event_id":"abcdef1234567890","timestamp":"2026-04-02T10:00:00.000Z","environment":"production"}}}'

# HMAC-SHA256 署名を生成
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

# リクエスト送信
curl -s -X POST http://localhost:54321/functions/v1/sentry-to-github \
  -H "Content-Type: application/json" \
  -H "sentry-hook-signature: $SIG" \
  -d "$PAYLOAD"
```

### 正常系: production + 新規 issue → GitHub Issue 作成

期待レスポンス:
```json
{ "success": true, "created": true, "github_issue_number": 42, "github_issue_url": "..." }
```

### production 以外 → スキップ

`"environment": "staging"` に変えてリクエスト。

期待レスポンス:
```json
{ "success": true, "skipped": true, "reason": "environment_not_target" }
```

### 同一 sentry_issue_id 再送 → スキップ

同じ payload を2回送信。

期待レスポンス:
```json
{ "success": true, "skipped": true, "reason": "already_exists", "github_issue_number": 42, "github_issue_url": "..." }
```

### 署名不一致 → 401

```bash
curl -s -X POST http://localhost:54321/functions/v1/sentry-to-github \
  -H "Content-Type: application/json" \
  -H "sentry-hook-signature: invalidsignature" \
  -d "$PAYLOAD"
```

期待レスポンス: HTTP 401

### payload 不正 → 400

```bash
curl -s -X POST http://localhost:54321/functions/v1/sentry-to-github \
  -H "Content-Type: application/json" \
  -H "sentry-hook-signature: $SIG" \
  -d 'not-json'
```

期待レスポンス: HTTP 400

### メソッド不正 → 405

```bash
curl -s -X GET http://localhost:54321/functions/v1/sentry-to-github
```

期待レスポンス: HTTP 405

## 残課題・注意点

- **action フィルタ**: 現在は「DB 未登録 = 新規」で判定。`action === "created"` に絞る場合は `normalizeSentryPayload` の戻り値に `action` を追加して呼び出し元でフィルタしてください
- **レート制限**: 大量 Webhook が来た場合の保護なし。必要なら `checkRateLimit`（`_shared/security.ts`）を追加できます
- **Sentry の再通知**: Issue が resolved → regressed すると再度 Webhook が来ますが、DB に sentry_issue_id が既にある場合はスキップされます。これが意図しない動作の場合は `reason: already_exists` の処理を調整してください
