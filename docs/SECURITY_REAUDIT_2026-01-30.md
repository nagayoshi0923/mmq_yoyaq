# SECURITY RE-AUDIT（ゼロから再点検） 2026-01-30

このドキュメントは **GitHub Issue を参照せず**、現時点の `main` を対象に再度ゼロから監査した結果です。  
前回監査（`docs/SECURITY_AUDIT_2026-01-30.md`）で挙げたP0〜P3の修正後に、**まだ残っている/新たに目立った**点を中心に記載します。

---

## サマリー（結論）

- **P0（即対応推奨）**:
  - **テスト用Edge Functionが「認証なし」「署名検証無効」「ログに機密を出す」状態で残っている**
  - **在庫整合性チェックのDB関数（`check_and_fix_inventory_consistency` / `run_inventory_consistency_check`）がクロステナントで走り得る**
- **P1（優先度高）**:
  - Discord系のInteractionに **レート制限/入力バリデーション（UUID検証）/再送（リプレイ）耐性**が不足
  - `retry-discord-notifications` がDBに保存されたURLへ fetch するため、**URL検証が弱いとSSRFの芽**
- **P2/P3**:
  - `.select('*')` の過多（最小権限の観点）や、ログ/エラーのサニタイズ不統一など

---

## 監査範囲

- **Edge Functions**: `supabase/functions/**`
- **DB/SQL**: `database/migrations/**`, `supabase/migrations/**`
- **フロント**: `src/**`

---

## Findings（残存/新規）

### P0: テスト用Edge Functionが公開状態

- **対象**
  - `supabase/functions/discord-interactions-test/index.ts`
  - `supabase/functions/discord-test/index.ts`
- **根拠**
  - `discord-interactions-test` は「認証無視」「署名検証完全無効」「Headers/Body/公開鍵をログ出力」
    - 例: `console.log('⚠️ Signature verification completely disabled')`
    - 例: `console.log('Headers:', Object.fromEntries(req.headers))`
  - `discord-test` は **Authorizationが無い場合に service role をセット**しようとする（危険）
- **リスク**
  - もしデプロイされていた/誤って公開されると、第三者が踏み台にできる（情報漏えい/DoS/運用事故）
- **推奨対策**
  - これらは **本番から削除**、または
    - `if (Deno.env.get('ENV') !== 'development') return 404;` のような環境ガード
    - `verifyAuth(req, ['admin'])` 必須化
  - そもそも `SUPABASE_SERVICE_ROLE_KEY` をリクエスト経由で扱う挙動は撤去

### P0: 在庫整合性チェックDB関数がクロステナントで走り得る

- **対象**
  - `database/migrations/009_inventory_consistency_check.sql`
    - `check_and_fix_inventory_consistency()`
    - `run_inventory_consistency_check()`
  - `database/migrations/010_fix_inventory_check_and_security.sql`（セキュリティ強化の意図はあるが、org境界は未対応）
- **根拠**
  - `check_and_fix_inventory_consistency()` が `schedule_events` を **organization_id で絞らず**走査し、更新も行う
  - `details` に `organization_id` を含めて返す
  - `run_inventory_consistency_check()` が内部で上記を呼び出すが、関数内に **呼び出し権限チェックが無い**
- **リスク**
  - どこかで authenticated に実行権限が付く/付いている場合、**他組織の在庫を修正/参照**できる可能性
- **推奨対策**
  - 関数を「adminのみ」or「service roleのみ」に限定（fail-closed）
  - `organization_id` を引数に取り、`WHERE se.organization_id = p_org_id` を必須化
  - 既存の `run_inventory_consistency_check()` は、運用上は Edge Function 側で守っていても **DB側でも守る**

### P1: Discord Interaction の乱用/リプレイ/入力検証

- **対象例**
  - `supabase/functions/discord-interactions/index.ts`
  - `supabase/functions/discord-shift-interactions/index.ts`
- **観点**
  - レート制限（IP/discord user単位）が入っていない
  - `custom_id` から取り出す `requestId` 等の **UUID検証**が薄い
  - ボタン連打（リプレイ）への耐性（idempotency）が弱い
- **推奨対策**
  - `checkRateLimit()` を導入（discord user id + endpoint でキー化）
  - UUID形式チェック（正規表現/parse）を追加し、失敗時は即400
  - Interactionの処理ログ/重複検知テーブルを導入（必要なら）

### P1: `retry-discord-notifications` のURL検証

- **対象**
  - `supabase/functions/retry-discord-notifications/index.ts`
- **観点**
  - DBの `webhook_url` へ `fetch()` しているため、万一DBへ不正URLが入るとSSRFの芽
- **推奨対策**
  - `discord.com/api/v10/channels/.../messages` など **許可URLのみ**送信するバリデーションを追加
  - 不正URLは `failed` に落とす

### P2: `.select('*')` 過多 / 最小権限

- **対象**
  - `src/**` / `supabase/functions/**` に `.select('*')` が多数
- **リスク**
  - RLSが正しくても「不要カラム」まで返ることで、将来の追加カラムが漏れる等の事故につながる
- **推奨対策**
  - 重要テーブル（`users`, `customers`, `reservations`, `staff` 等）から優先して列挙へ寄せる

### P2/P3: ログ/エラーサニタイズの不統一

- **観点**
  - `sanitizeErrorMessage()` を使っている箇所と、`error.message` をそのまま返す箇所が混在
- **推奨対策**
  - Edge Functionのエラーレスポンスは原則 `sanitizeErrorMessage()` に統一
  - URLやトークンが混入し得るログはリダクション

---

## 前回から「改善確認できた」点（抜粋）

- 公開系の危険エンドポイント（Twitter投稿/Google Sheets同期/問い合わせ宛先）に対し、認証/レート制限/宛先固定等が導入されている
- CORSが許可外Originに対して **prodを返す挙動が廃止**されている
- Service Role比較が `timingSafeEqualString()` に置換されている（主要なcron系）
- `calculate_cancellation_fee` に権限チェックを追加するマイグレーションが追加されている

