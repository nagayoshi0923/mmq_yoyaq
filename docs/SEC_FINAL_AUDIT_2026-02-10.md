# 最終セキュリティ監査レポート — 本番リリース可否判定

**監査日**: 2026-02-10  
**対象環境**: staging (本番同期済み)  
**監査者**: AIセキュリティエンジニア (最終監査モード)  
**前提**: インターネット越しの第三者アクセスを想定した断定的評価  
**監査スコープ**: A〜F 全領域（認証/認可/データ保護/入力検証/状態遷移/運用安全/監視復旧）

---

## 最終判定

### リリース可否: ⚠️ 条件付き YES — P0 全3件修正済み・staging 検証合格（2026-02-10）
### 残条件: Sentry DSN の Vercel 環境変数設定、本番 DB へのマイグレーション適用

| 質問 | 回答 | 根拠 |
|------|------|------|
| 1) 第三者が悪意なく触っても壊れないか | **条件付きYES** | 一般ユーザー操作は概ね安全。ただし二重送信時のUX混乱、キャンセル後の通知漏れリスクあり |
| 2) 将来の開発者が仕様を忘れても事故らないか | **NO** | RLS ヘルパー(`is_admin`)がグローバルで org 境界なし。マイグレーション重複で安全な関数が上書き可能。CI に RLS チェックなし |
| 3) この状態で本番リリースしてよいか | **NO** | P0-A (価格改ざん RPC 共存)、P0-B (is_admin の org 境界不在)、P0-C (エラー監視不在) を修正するまでリリース不可 |

---

## P0 指摘（即リリース停止）

### P0-A: `create_reservation_with_lock_v2` — クライアント料金を受け入れるオーバーロードが共存

**攻撃シナリオ**:
1. `20260202120000_security_p0_fixes.sql` が定義する署名は `(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER DEFAULT 0, INTEGER DEFAULT 0, ...)` — `p_base_price`, `p_total_price` をクライアントから受け取る
2. これは `20260130233000` のサーバー側料金計算版と**異なるシグネチャ**（引数の順序・数が違う）のため、PostgreSQL は両方を別関数として保持
3. 攻撃者が `supabase.rpc('create_reservation_with_lock_v2', { p_schedule_event_id: '...', p_customer_id: '...', ..., p_base_price: 0, p_total_price: 0 })` を直叩きすると、安全版ではなく `20260202120000` 版にマッチし、**料金0円で予約が成立する**
4. クライアントコード (`reservationApi.ts:244`) は安全な署名で呼んでいるが、**API直叩きで回避可能**

**実害**: 任意の予約を0円で作成可能。売上損失。

**再発条件**: 同名関数を異なるシグネチャで `CREATE OR REPLACE` するたびに発生。PostgreSQL はシグネチャが異なれば上書きせず共存させる。

**最小修正（短期）**:
```sql
-- 危険なオーバーロードを削除
DROP FUNCTION IF EXISTS create_reservation_with_lock_v2(
  UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, UUID, TEXT
);
```

**再発防止（中期）**:
- CI で `SELECT proname, proargtypes FROM pg_proc WHERE proname = 'create_reservation_with_lock_v2'` を実行し、1行のみ返ることを検証
- マイグレーション追加時に既存の同名関数を確認するチェックリスト

---

### P0-B: `is_admin()` / `is_org_admin()` がグローバル判定 — マルチテナント境界が破壊される

**攻撃シナリオ**:
1. `is_admin()` は `role IN ('admin', 'license_admin')` のみをチェック（`20260201190000`）
2. Org-A の admin が Org-B の予約をキャンセル: `cancel_reservation_with_lock(p_reservation_id)` — `is_org_admin()` がグローバル true なので通過
3. Org-A の admin が Org-B のユーザーを admin に昇格: `users` UPDATE の RLS が `is_admin()` で許可
4. Org-A の admin が Org-B の予約ステータスを変更: `admin_update_reservation_fields` v2 に org チェックなし

**実害**: 異なる組織の予約・ユーザー・設定を操作可能。マルチテナント境界の完全破壊。

**再発条件**: `is_admin()` を RLS ポリシーや RPC で使うたびに、org 境界が暗黙的に欠落する。

**最小修正（短期）**:
```sql
-- 1. admin RPCに org チェックを追加
-- admin_update_reservation_fields:
IF (SELECT organization_id FROM reservations WHERE id = p_reservation_id) 
   IS DISTINCT FROM get_user_organization_id() THEN
  RAISE EXCEPTION 'FORBIDDEN_CROSS_ORG' USING ERRCODE = 'P0010';
END IF;

-- 2. cancel_reservation_with_lock にも同様に追加
-- 3. users UPDATE RLS に org 条件追加:
-- is_admin() AND (SELECT organization_id FROM users WHERE id = auth.uid()) = users.organization_id
```

**再発防止（中期）**:
- `is_admin_of_org()` 関数を新設し、`organization_id` パラメータを必須にする
- `is_admin()` の使用箇所を全て `is_admin_of_org(target_org_id)` に置換
- CI で `is_admin()` の直接使用を警告するlintルール

---

### P0-C: エラー監視サービスが未統合 — 本番障害が検知不能

**事故シナリオ**:
1. 本番デプロイ後、RLS 変更により一部の予約作成が静かに失敗
2. Supabase のエラーログは Dashboard でしか見えず、アラートなし
3. フロントエンドのランタイムエラー（TypeError等）は `ErrorBoundary` でキャッチされるが、どこにも通知されない
4. ユーザーからの問い合わせで初めて障害に気づく（数時間〜数日後）

**実害**: 障害の検知遅延、影響範囲の把握不能、SLA 違反。

**再発条件**: 任意のデプロイで発生しうる。監視がなければ永続。

**最小修正（短期）**:
- Sentry の無料プランを統合（`npm install @sentry/react`、`ErrorBoundary` に `Sentry.captureException` 追加）
- Edge Functions に `Sentry.captureException` またはログ集約（LogFlare/Datadog）

**再発防止（中期）**:
- アラートルール設定（エラー率 > 1%、特定エラーコード）
- `/health` エンドポイント + 外部 uptime 監視

---

## P1 指摘（リリース前に修正推奨）

### P1-1: Mass Assignment — `staffApi.update` / `customerApi.update` にフィールド制限なし

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/api/staffApi.ts:81`, `src/lib/reservationApi.ts:66` |
| シナリオ | 攻撃者が `{ organization_id: 'other-org' }` を注入し、自分のレコードを他組織に移動 |
| 実害 | テナント境界破壊、データ汚染 |
| 修正 | 更新可能フィールドのホワイトリスト（`name`, `phone`, `email`, `nickname` 等のみ） |

### P1-2: `admin_update_reservation_fields` v2 に org 境界チェックなし（P0-B の具体箇所）

| 項目 | 内容 |
|------|------|
| ファイル | `supabase/migrations/20260201200000_reservation_status_validation.sql:141-216` |
| シナリオ | Org-A の staff が Org-B の予約 UUID を指定してステータス変更 |
| 修正 | `get_user_organization_id()` と予約の `organization_id` を比較 |

### P1-3: `cancel_reservation_with_lock` の org 境界チェックなし（P0-B の具体箇所）

| 項目 | 内容 |
|------|------|
| ファイル | `supabase/migrations/20260201150000_security_definer_hardening.sql:134` |
| シナリオ | 他組織の admin が任意の予約をキャンセル |
| 修正 | 予約の `organization_id` とコール元の org を比較 |

### P1-4: `updateUserRole` がクロス組織の権限昇格を許可

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/userApi.ts:51`, RLS: `users_update_self_or_admin` |
| シナリオ | Org-A admin が Org-B のユーザーを admin に変更 |
| 修正 | RLS の `is_admin()` 分岐に `AND users.organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())` を追加 |

### P1-5: `admin_update_reservation_fields` に `FOR UPDATE` ロックなし

| 項目 | 内容 |
|------|------|
| ファイル | `supabase/migrations/20260201200000:157` |
| シナリオ | 2人の admin が同時にステータス変更 → 最後の書き込みが勝ち、一方の操作が無言で上書きされる |
| 修正 | `SELECT ... FOR UPDATE` に変更 |

### P1-6: スケジュール編集に楽観的ロックなし

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/api/scheduleApi.ts:966-983` |
| シナリオ | 2人の admin が同時に同じイベントを編集 → 後から保存した方が前の変更を無言で上書き |
| 修正 | `updated_at` ベースの楽観的ロック RPC を実装 |

### P1-7: キャンセル後の通知がトランザクション外で送信

| 項目 | 内容 |
|------|------|
| ファイル | `src/lib/reservationApi.ts:550-676` |
| シナリオ | キャンセル成功 → メール送信失敗 → 顧客に確認メールなし、ウェイトリスト通知もなし |
| 修正 | キャンセルトリガーで `booking_email_queue` に INSERT |

### P1-8: キャンセル/変更メールにべき等性チェックなし

| 項目 | 内容 |
|------|------|
| ファイル | `supabase/functions/send-cancellation-confirmation/`, `send-booking-change-confirmation/` |
| シナリオ | ネットワークリトライで同じメールが2通以上送信される |
| 修正 | `booking_email_queue` パターンを全メール関数に統一 |

### P1-9: マイグレーション関数チェーンで安全版が上書きされるリスク

| 項目 | 内容 |
|------|------|
| ファイル | `handle_new_user` (11回上書き), `create_reservation_with_lock_v2` (5回+共存) |
| シナリオ | マイグレーションの選択的リプレイで古い不安全版が最終定義になる |
| 修正 | CI で関数本体のハッシュ検証、または最終マイグレーションで `ASSERT` |

### P1-10: CI に RLS 検証なし — 新テーブル追加時に RLS 漏れが検知されない

| 項目 | 内容 |
|------|------|
| ファイル | `.github/workflows/ci.yml`, `scripts/check-security-guardrails.mjs` |
| シナリオ | 新規開発者がテーブル追加時に RLS を忘れる → 全データが公開 |
| 修正 | CI に `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false` の検証を追加 |

### P1-11: 監査ログの不足箇所

| 未ログ操作 | リスク |
|-----------|--------|
| スケジュールイベントの作成/変更/削除 | 予約に直結するビジネスデータの変更が追跡不能 |
| ログイン失敗 | ブルートフォース攻撃の検知不能 |
| Edge Function の実行記録 | 障害時のトレーサビリティ不足 |

### P1-12: 相関ID（Correlation ID）なし

| 項目 | 内容 |
|------|------|
| シナリオ | 予約作成→メール送信→ウェイトリスト通知の多段処理で、途中失敗時にどこで止まったか追跡不能 |
| 修正 | `audit_logs` に `correlation_id` カラム追加、Edge Functions でリクエストごとに UUID 生成・伝播 |

### P1-13: DB マイグレーションのロールバック手段なし

| 項目 | 内容 |
|------|------|
| シナリオ | 不正なマイグレーション適用後、元に戻す手段が手動 SQL のみ |
| 修正 | クリティカルなマイグレーションに対応するロールバック SQL を `docs/rollback/` に用意 |

---

## P2 指摘（運用でカバー可能）

| # | 指摘 | カテゴリ |
|---|------|---------|
| P2-1 | `customerApi.findByEmail` にコード側 org フィルタなし（RLS 依存） | 多層防御 |
| P2-2 | `external_sales`, `miscellaneous_transactions`, `schedule_events` の DELETE/SELECT に org フィルタなし | 多層防御 |
| P2-3 | `change_reservation_schedule` で `is_org_admin()` が二重記述（コピペバグ） | ロジック |
| P2-4 | クライアント側 `recalculateCurrentParticipants` が DB トリガーと競合 | 整合性 |
| P2-5 | `getByMonth` 内の fire-and-forget 参加者同期がトリガーと競合 | 整合性 |
| P2-6 | 予約送信ボタンに二重クリック防止なし | UX/整合性 |
| P2-7 | ウェイトリスト `processing` ステータスのタイムアウトなし | 運用 |
| P2-8 | メール確認キュー INSERT が Edge Function 内（呼び出し失敗でキュー漏れ） | 運用 |
| P2-9 | `reservations.schedule_event_id` に FK 制約なし | 整合性 |
| P2-10 | `CompleteProfile` の `DEFAULT_ORG_ID` ハードコード | 設計 |
| P2-11 | `shift_submissions` upsert でクライアント提供の org_id を優先 | 入力検証 |
| P2-12 | `booking_notices` SELECT で `organization_id IS NULL` を許可 | 情報漏洩 |
| P2-13 | レガシーマイグレーション（`database/`）に冪等性ガードなし | 運用 |
| P2-14 | `audit_logs` のリテンション/クリーンアップポリシーなし | 運用 |
| P2-15 | npm 依存パッケージに既知脆弱性（brace-expansion High, lodash Moderate） | 依存関係 |

---

## 前回修正済み項目の確認

| 項目 | ステータス |
|------|----------|
| RLS `OR TRUE` パターン | ✅ 修正済み・再検証済み |
| UPDATE `WITH CHECK` 欠落 (49件) | ✅ 修正済み・再検証済み |
| 二重予約テスト | ✅ 手動テスト合格 |
| オープンリダイレクト（returnUrl 検証） | ✅ 修正済み |
| レートリミットのフェイルオープン | ✅ フェイルクローズに修正済み |
| CORS 設定 | ✅ 本番 Origin のみ |
| 秘密情報（env/キー）混線 | ✅ publishable key のみ |
| 監査ログの基盤 | ✅ actor/target/action/org_id |

---

## Day-0（リリース当日）最小チェックリスト

リリース前に以下を**全て**確認すること：

- [ ] **1. 危険な RPC オーバーロードの削除確認**: `SELECT proname, pronargs FROM pg_proc WHERE proname = 'create_reservation_with_lock_v2'` → 1行のみ返ること
- [ ] **2. `is_admin()` が使われている RLS/RPC の org 境界確認**: 本番 SQL Editor で `SELECT policyname, qual FROM pg_policies WHERE qual::text ILIKE '%is_admin%'` → 全件に org チェックがあること
- [ ] **3. Sentry（または同等監視）が初期化されていること**: 本番 URL にアクセスし、DevTools Console で Sentry DSN のロードを確認
- [ ] **4. RLS 全テーブル有効確認**: `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false` → `discord_interaction_dedupe` と `salary_settings_history` のみ（許容済み）
- [ ] **5. メール送信テスト**: staging で予約作成→確認メール受信、キャンセル→キャンセルメール受信を確認
- [ ] **6. OAuth ログインテスト**: Google ログイン → プロフィール登録 → マイページ表示を確認
- [ ] **7. 予約フローの E2E テスト**: 未ログイン → イベント選択 → ログイン → 予約完了 → マイページに反映
- [ ] **8. 管理画面の基本操作確認**: ログイン → スケジュール表示 → イベント編集 → 保存
- [ ] **9. Vercel デプロイの正常性**: `curl -s https://mmq-yoyaq.vercel.app | grep -o 'build-id'` でビルドIDが最新であること
- [ ] **10. DB バックアップの確認**: Supabase Dashboard → Database → Backups で最新バックアップが24時間以内であること
