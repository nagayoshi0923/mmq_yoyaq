# セキュリティ対策 実装済み機能一覧

最終更新: 2026-03-20

## この文書の位置づけ（評価メモ）

- **用途**: 社内向けの「何をしているか」の説明・チェックリストには十分使える。第三者監査の「証跡」としては、各項目を設定画面・マイグレーション・コード参照付きで補強するとよい。
- **HP 公開用の要約**: 一般向けの非技術的な説明はサイト上の **`/security`**（`src/pages/static/SecurityPage.tsx`）に掲載。本ファイルは内部用・個別開示用。
- **正確性の注意**: 下記は実装の**意図と主要な仕組み**をまとめたもの。文言の「すべて」「全」は、運用で変わりうるため定期的な再確認を推奨。

---

## 通信・インフラ層

### HTTPS 自動管理（Vercel + Supabase）
証明書の取得・更新・失効対応はすべてプラットフォームが自動処理。Let's Encrypt を手動管理する必要なし。

### HTTP セキュリティヘッダー
`vercel.json` で全ページに適用。

| ヘッダー | 設定値 | 効果 |
|---|---|---|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains; preload` | HTTPS 強制（1年間） |
| X-Frame-Options | `DENY` | クリックジャッキング防止 |
| X-Content-Type-Options | `nosniff` | MIME スニッフィング防止 |
| Referrer-Policy | `strict-origin-when-cross-origin` | 参照元 URL 漏洩の制限 |
| Permissions-Policy | `geolocation=(), microphone=(), camera=()` | デバイス機能への不正アクセス禁止 |

### CORS 制限
Edge Functions の `_shared/security.ts` で管理。本番環境では `https://mmq.game` と `https://mmq-yoyaq.vercel.app` のみを許可。開発環境の `localhost` は本番では無効化。

---

## 認証・認可層

### JWT ベース認証（Supabase Auth）
ログインユーザー向けの操作は Supabase が発行した JWT（セッション）で検証。匿名向けの公開読み取りは **anon キー + RLS** で制御。Edge Functions 内の処理は多くが **サービスロール** を用い、別途 HTTP 層で認可（JWT / Cron シークレット / Discord 署名など）を行う。

### ロールベースアクセス制御（RBAC）
`license_admin` / `admin` / `staff` / `customer` の 4 段階ロールを管理し、フロントのルートガードと Edge Functions の両方でチェック。

### フロントエンドのルートガード
未ログインユーザーや `customer` ロールが `/dashboard`・`/schedule`・`/settings` 等の管理パスにアクセスすると自動的にリダイレクト（`AppRoot.tsx`）。

### 新規登録時の重複メール事前チェック
`check_email_registered` RPC により、既存メールへのマジックリンク送信を抑制。**本番で効くのはマイグレーション適用後**。`customers` は **`user_id` が埋まっている行**（Auth と紐付いた顧客）のみ対象。メールのみの店舗登録レコードではブロックしない（初回マジックリンクで紐付け可能）。`public.users` に同一メールがある場合もブロック（スタッフ等）。副作用としてメールの登録有無が推測可能（列挙リスク）になる点は許容と判断している。

### complete-profile 用: メールが他 auth ユーザーの顧客に紐付いているか
`is_customer_email_linked_to_other_user`（`authenticated` のみ）。`check_email_registered` は `public.users` も参照するためログイン済みセッションでは常に真になり得ず、**二重アカウント案内**には使わない。メール列挙リスクは `check_email_registered` と同種。

### Edge Functions の認可チェック
現状 **37 本**の Edge Function があり、エンドポイントごとに次のいずれか（または併用）で保護している。

- `verifyAuth` / 手動の `getUser` + `users` テーブル参照 — JWT とロール確認
- `isCronOrServiceRoleCall` — Cron 専用ヘッダーまたはサービスロール相当の呼び出しのみ許可
- 業務ロジックによる検証 — 例: 予約 ID とメール一致（確認メール系）、Discord の Ed25519 署名検証（`discord-interactions` 等）
- **例外**: `quick-processor` はスタブ実装で認可ロジックなし。本番で有効化する場合は必ず保護を追加すること。

### タイミングセーフ比較
Cron シークレットやサービスロールキーの比較に `timingSafeEqualString` を使用し、タイミング攻撃に耐性を持たせている。

---

## データアクセス層

### Row Level Security（RLS）
機密テーブルは RLS で保護。ポリシーはテーブルごとに異なり、**自組織・本人データ**に限定するものが中心。シナリオ公開など **匿名読み取りを許すポリシー** を持つテーブルもある（意図的な公開範囲はマイグレーションとポリシー名で確認）。

### マルチテナント強制（組織 ID による分離）
INSERT / UPDATE / SELECT 全操作でコード側にも `organization_id` フィルタを追加（RLS との二重防御）。  
**顧客（`customers`）** は同一 `user_id` で組織ごとに行が分かれ得るため、予約・貸切・グループチャット等では **公演／グループの `organization_id` で顧客行を解決**する（2026-03-20 セルフレビューで反映）。詳細は [docs/development/pii-review-priority.md](./development/pii-review-priority.md) の P0 ログ参照。

### 明示的カラム選択（`select('*')` の原則排除）
フロントの主要クエリは列明示に寄せている。互換用に **`reservationApi` 等で `select('*')` フォールバック**が残る箇所あり。Edge Functions 内にも `*` 選択が残る場合がある。

### Edge Functions の組織 ID 検証
`invite-staff`・`delete-user`・`send-email` 等の管理系関数で、呼び出し元の組織 ID とリクエストの組織 ID が一致するか確認。自組織以外への操作は 403 で拒否。

### 自己削除防止
管理者が自分自身を削除しようとすると 400 で拒止（`delete-user`）。

---

## ログ・情報漏洩対策

### 個人情報マスキング
ログに出力する際、個人情報を自動マスキング（`src/utils/security.ts`・`_shared/security.ts`）。

| 対象 | マスキング例 |
|---|---|
| メールアドレス | `ma***l@example.com` |
| 電話番号 | `***-****-5678` |
| UUID | `123e4567-****-****-****-426614174000` |

### エラーメッセージのサニタイズ
PostgreSQL エラーコード・テーブル名・スタックトレース等の技術情報がクライアントに漏洩しないよう、エラーメッセージを汎用メッセージに変換（`sanitizeErrorMessage`）。

### `SERVICE_ROLE_KEY` のフロント非公開
フロントエンドコード（`src/` 配下）に `service_role_key` は一切含まれていないことを確認済み。

---

## 運用・監視層

### 監査ログ（`audit_logs` テーブル）
ユーザー削除（管理者・本人退会）などの重要操作を操作前・操作後の 2 段階で記録。

### レートリミット
Discord インタラクション・外部連携系の API に対してリクエスト数制限を実装（`check_rate_limit` RPC）。

### Cron シークレット
定期実行系 Edge Functions は専用の `x-cron-secret` ヘッダーがないと実行できない（`CRON_SECRET` 環境変数）。

### セキュリティガードレールスクリプト
危険な RLS パターン・`select('*')` の残留・`organization_id` フィルタ漏れをコード上でチェックするスクリプトを `package.json` に組み込み。

```bash
npm run check:security-guardrails  # RLS パターン・select('*') チェック
npm run check:multi-tenant         # organization_id フィルタ漏れチェック
```

---

## 未対応項目（将来的な検討事項）

| 項目 | 概要 |
|---|---|
| CSP（Content Security Policy）ヘッダー | `vercel.json` に未設定。追加すれば XSS 耐性がさらに向上 |
| HSTS プリロードリストへの登録 | `preload` は指定済みだが [hstspreload.org](https://hstspreload.org) への申請が別途必要 |
| 外部の専門セキュリティ監査 | 顧客規模拡大時に ISMS・SOC2 等を検討推奨 |
