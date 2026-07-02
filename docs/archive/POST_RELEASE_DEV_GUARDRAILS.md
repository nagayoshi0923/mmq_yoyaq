# リリース後の開発事故を防ぐための環境作り＆標準手順
**作成日**: 2026-02-03  
**対象**: MMQ予約システム（マルチテナント / Supabase（RLS/RPC/Edge Functions）/ Vercel / React）  
**目的**: 「半年後に仕様を忘れた開発者が触ってもP0を生まない」状態に寄せる（仕組み＋手順で防ぐ）

---

## 事故を“仕組み”で潰す基本方針

- **Fail-closed（安全側デフォルト）**: 設定漏れ・条件漏れは「通さない」方向に倒す  
  - 例: Edge Functions の CORS は「環境が不明なら本番扱い」で `localhost` を許可しない
- **本番は“人の承認”が必要**: ステージング確認なしで本番に入れない（運用ルール＋CI/Environment承認）
- **境界（organization_id / RLS / RPC権限）をDB側で強制**: フロントの都合やUIの分岐に依存しない
- **公開面（PUBLIC/anon）を増やさない**: RPC/Edge Functions の公開面は「増えたら検知して止める」
- **再現可能な手順**: 口頭や勘に依存しない。チェックリストを“実行ログ”として残す

---

## 環境（Local / Staging / Production）の作り方

### 環境の定義
- **Local**: Supabase Local + Vite（開発者PC）
- **Staging**: Supabase Staging + Vercel Preview（固定URL推奨）
- **Production**: Supabase Prod + Vercel Prod（`main`）

環境構築の詳細は `docs/STAGING_SETUP_GUIDE.md` を正とする（本書は“事故防止運用”に特化）。

### 環境変数の“必須セット”

#### フロント（Vercel）
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`（= anon key）
- `VITE_APP_ENV`
  - Production: `production`
  - Preview/Staging: `staging`

#### Edge Functions（Supabase Secrets）
- `APP_ENV`
  - Production: `production`
  - Staging: `staging`
- `CRON_SECRET`（または `EDGE_FUNCTION_CRON_SECRET`）
- メール/通知を使う場合: `RESEND_API_KEY`, `DISCORD_*`, その他必要なキー

> 重要: **Edge Functions の `APP_ENV` は必ず本番で `production` を設定**（設定漏れ時は安全側デフォルトで本番扱いに倒す）。

---

## 権限・秘密情報（Secrets）運用ルール

- **禁止**: `service_role` をフロント/クライアントへ配る、ログに出す、共有ドキュメントに貼る
- **Secretsの棚卸し（定期）**:
  - 本番: 月1（またはリリースごと）
  - ステージング: リリース前
- **削除の原則**: “使ってないかも” は事故源。使っていないキーは消す（復活させるほうが安全）
- **送信系（メール/Discord/Twitter等）**: 本番は誤送信が最大事故になり得るため、**環境ごとに宛先/チャンネルを分ける**か、ステージングでは送信を無効化する

---

## Git / ブランチ / PR の標準フロー

### ブランチ戦略（最低限）
- 開発: `feature/*`
- ステージング検証: `staging`
- 本番: `main`

### PR必須のゲート（事故を止めるライン）
- **必須（ローカル/CIで通す）**:
  - `npm run typecheck`
  - `npm run lint`（運用上の許容範囲で）
  - `npm run build:fast`（ビルドが落ちない）
  - `npm run check:security-guardrails`
  - `npm run check:multi-tenant`
- **DB変更がある場合**（マイグレーション/RPC/RLS）:
  - ステージングで `docs/deployment/sql/SEC_check_rpc_public_surface_regression.sql` を実行し、`unexpected_count = 0`

> 例外的にスキップする場合は、PR本文に「なぜスキップしたか」「どのリスクが残るか」を書く。

---

## データベース（RLS/RPC/マイグレーション）事故を防ぐ手順

### 事故パターン（最頻）
- `organization_id` のフィルタ漏れ/挿入漏れ → **他組織データ漏洩**
- RPCの `EXECUTE` が `PUBLIC/anon` に開く → **即死**
- カラム名の思い込み → 本番で実行時エラー（静的に検知しにくい）

### 変更時の“絶対手順”
- **カラム名の事前確認**（推測禁止）:
  - `information_schema.columns` で確認してから実装する
- **マルチテナント**:
  - SELECT: `organization_id` フィルタ（コード側でも）
  - INSERT/UPSERT: `organization_id` を必ずセット
  - UPDATE/DELETE（範囲系）: `organization_id` フィルタ必須
- **RPC**:
  - 境界チェックはDB関数内で fail-closed
  - `PUBLIC/anon` に `EXECUTE` を付けない（増えたら即回帰）

### リリース前のDBチェック（人が実行）
- 本番SQL Editorで以下を必ず実行（Day0に準拠）:
  - `docs/deployment/sql/SEC_snapshot_rpc_public_surface.sql`
  - `docs/deployment/sql/SEC_check_rpc_public_surface_regression.sql`

---

## Edge Functions 事故を防ぐ手順

### 事故パターン（最頻）
- “テスト用関数”が公開のまま残る
- 認証/署名/cron secret なしで叩ける関数が残る
- CORSで `localhost` や preview URL が本番許可される

### 標準ルール
- **原則**: すべての関数は以下のどれかでガードする
  - `verifyAuth(req, requiredRoles?)`
  - `isCronOrServiceRoleCall(req)`（cron/トリガー専用）
  - Discordなど外部からのWebHookは **署名検証**
- **CORS**:
  - `getCorsHeaders(origin)` を使う
  - 本番は本番ドメインのみ許可、非本番は localhost を追加（環境変数で制御）

### “公開ゼロ化”チェック（AI/開発者が定期実行）
- `supabase/functions/**/index.ts` を見て、`serve()` 内にガードが無い関数がないことを確認
- テスト用の関数は **Cron/Service Role のみ**にするか、削除する

---

## ステージング → 本番の標準手順（これを守れば事故らない）

### ステージング反映（開発者）
- [ ] `feature/*` で開発
- [ ] ローカルで必須ゲートを通す（`typecheck/lint/build:fast/security/multi-tenant`）
- [ ] `staging` に反映（DB変更があれば `supabase db push` / Functions 変更があれば deploy）
- [ ] ステージングでスモークテスト（最低限）:
  - [ ] ログイン/ログアウト
  - [ ] 予約作成/キャンセル（該当する場合）
  - [ ] 管理操作（予約更新/削除など、危険系）
  - [ ] Edge Functions の送信系（テストモードで）

### 本番反映（人の承認が必須）
- [ ] **ステージング確認が完了した**ことを明記（OK/問題なし）
- [ ] `main` にマージ
- [ ] 本番スモークテスト（最小）:
  - [ ] 認証（ログイン/パスワードリセット導線）
  - [ ] 予約フローの1系統（実送信チェック含む）

> 重要: ステージングに出した時点で、AI/開発者は一旦止まる（ユーザー承認待ち）。

---

## 監視・アラート（事故の“拡大”を止める）

- **24時間監視セット**（リリース直後は必須）:
  - Vercel: エラー率/レイテンシ
  - Supabase: Functions 4xx/5xx、DB負荷、Auth失敗、メール失敗
- **ログの検索導線**を固定し、URLを共有（誰でも同じ場所から見られる）

---

## インシデント手順（事故った時に“最短で止める”）

### まずやる（5分）
- [ ] 影響範囲の切り分け（誰に、どの機能が、いつから）
- [ ] 送信系の停止（誤送信が疑われる場合）: 関数無効化/Secrets退避/宛先を退避
- [ ] 直近デプロイの停止（Vercelの自動デプロイ停止等）

### 戻す（状況次第）
- [ ] フロントのみで止まる事故: Vercel を1つ戻す
- [ ] Functions事故: Functions を前バージョンへ戻す or ガード追加でロールフォワード
- [ ] DB事故: 原則ロールフォワード（緊急時のみ復旧）

### 事後（必須）
- [ ] 原因（Root cause）と再発防止（仕組み/手順のどこが抜けたか）を1枚にまとめる

---

## すぐに追加すると強い“自動化”（Later）

- **公開RPCホワイトリストのCI化**（回帰したらCIで落とす）
- **Edge Functions “ガード必須”の静的チェック**（ガード無しを検出したらCIで落とす）
- **本番環境の承認フロー強制**（GitHub Environments の required reviewers）

