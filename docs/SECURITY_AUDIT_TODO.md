# セキュリティ監査 TODO（リリース前・あなたが実施）

このドキュメントは「本番リリース可否を判断するための監査TODO」です。  
**Must が全て YES になるまでリリースしない**こと。

---

## 監査ラン（証跡）テンプレ

以下を埋めて、実行したSQL/結果（テーブル）やスクショを添付する。

- **監査日**:
- **監査対象環境**: staging / production
- **Supabase Project ID**:
- **Vercel Deployment / Git SHA**:
- **監査者**:

---

## Must（これがYESになるまでリリース不可）

### 1) 監査証跡を作る
- [ ] `docs/SEC_AUDIT_RUN_YYYY-MM-DD.md` を作成し、以下を貼る
  - [ ] 監査日・環境・Project ID・デプロイSHA
  - [ ] 実行したSQL（コピペ）と結果
  - [ ] 重要画面（Auth設定、Function設定等）のスクショ

### 2) Supabase AuthのURL混線を止める（staging→prodに飛ぶ問題）
- [ ] Supabase Dashboard → Authentication → URL Configuration を確認
  - [ ] **Site URL** が対象環境のURLのみ（本番/ステージング混在禁止）
  - [ ] **Redirect URLs** が対象環境に限定（preview URL 混入禁止）
- [ ] Supabase Dashboard → Authentication → Providers → Google を確認
  - [ ] Google OAuth の redirect URI が対象環境に整合
- [ ] 実操作で確認（staging推奨）
  - [ ] Googleログイン後も **staging URLのまま維持**される

### 3) RLS（マルチテナント境界）の破壊が無いことをDBで確定する
- [ ] 主要テーブルのRLS状態を確認（RLS有効が前提）
  - 対象例: `reservations`, `schedule_events`, `customers`, `pricing_settings`, `organization_*`, `staff`, `stores`
- [ ] `pg_policies` で各テーブルの全ポリシーを抽出し、**条件式を目視レビュー**
  - [ ] **禁止パターンが存在しない**
    - [ ] `OR TRUE` が無い
    - [ ] 意図のない `OR organization_id IS NULL` が無い（意図があるなら「対象テーブル・理由・影響範囲」を監査ランに明記）
  - [ ] UPDATE/DELETE に **`WITH CHECK` が必ずある**

### 4) 危険RPC（SECURITY DEFINER）の公開面をホワイトリスト固定
- [ ] 本番 Supabase SQL Editor で実行し、結果を監査ランに貼る
  - [ ] `docs/deployment/sql/SEC_snapshot_rpc_public_surface.sql`
  - [ ] `docs/deployment/sql/SEC_check_rpc_public_surface_regression.sql`
- [ ] **合格条件**
  - [ ] `unexpected_count = 0`
  - [ ] `SECURITY DEFINER` 関数に **PUBLIC/anon の EXECUTE が無い**
  - [ ] admin系RPCは「必要最小限の実行権限」＋「組織境界チェック」がある

### 5) Edge Functions：認証/CORS/権限/入力検証が外部到達面で成立
- [ ] `supabase/functions/_shared/security.ts` の `ALLOWED_ORIGINS` を確認
  - [ ] 本番は **本番Originのみ**（例外運用があるなら明文化）
  - [ ] staging/preview の扱い（同一Supabaseに混在させるか）を決めて監査ランに明記
- [ ] 未認証で重要Functionが実行できない（例外は cron/service-role のみ）
- [ ] 送信系（メール等）は「権限（role/organization）＋入力検証」がある
- [ ] stagingで発生していた CORS（例: `send-booking-confirmation`）を再テストし、解消を確認

### 6) 予約/キャンセル競合：二重確定・残席ズレ・幽霊予約が出ない
- [ ] 実操作テスト（staging推奨）
  - [ ] 同一ユーザーで **同イベントを2タブ同時確定** → 重複予約にならない
  - [ ] 連打/リトライ/ページ更新 → 二重確定にならない
  - [ ] 通信断・タイムアウト想定 → DBが安全側に倒れる（中途半端に残らない）
- [ ] 結果（成功/失敗の組合せ・DB状態）を監査ランに貼る

### 7) ログ/追跡性：事故時に「誰が/いつ/何を」まで追える
- [ ] 重要操作を1回実行（予約作成/変更/キャンセル/管理操作）
- [ ] `audit_logs`（または相当）に以下が残ることを確認し、監査ランに貼る
  - [ ] actor（誰が）
  - [ ] organization（どの組織で）
  - [ ] target id（何を）
  - [ ] before/after（どう変えたか）

### 8) 秘密情報：publishable/service-role が混線していない
- [ ] Vercel Environment Variables を確認
  - [ ] **service role** がフロントビルドに混入していない
  - [ ] publishable key のみがクライアントへ出る前提で成立している（RLSで防御）
- [ ] Git差分/コミット対象に `.env.local` 等が入らない

### 9) リリース停止条件（P0ゲート）をYES/NOで埋める
- [ ] このドキュメントの Must を全て YES にしたうえで、監査ランに「停止条件」を明記する
  - 例:
    - `unexpected_count > 0`
    - URL混線（staging→prod 遷移）
    - CORS許可過多（本番Origin以外を許可）
    - RLS境界破壊（他組織の読み書き可能）
    - 二重確定/残席ズレが再現

---

## Should（リリース前にやると事故率が落ちる）

### 10) organization_id が null の挙動を潰す（フィルタ無し取得の事故源）
- [ ] `organization_id が null のためフィルタなし` のログ/導線を洗い出す
- [ ] その状態での読み取りが境界を破らないことを確認（または早期エラーで止める）

### 11) 管理画面の権限境界（admin/staff/customer）の回帰テスト
- [ ] customerロールで管理UIの主要機能が実行できない
- [ ] admin系操作が組織境界を跨がない（対象org一致が強制される）

### 12) 濫用耐性（送信系/検索/一覧）
- [ ] 送信系Functionの濫用が成立しない（制限/拒否/ログがある）

---

## Later（運用で回せるが、方針は監査ランに残す）

### 13) 監査SQLの定期実行（週次 or デプロイ時）を運用手順化
- [ ] snapshot/regression SQL を「本番デプロイ直後の儀式」にする

### 14) 最小権限の棚卸し（DB role / function grants / storage）
- [ ] PUBLIC/anon/authenticated の権限を棚卸しし、逸脱を検知できる形にする

