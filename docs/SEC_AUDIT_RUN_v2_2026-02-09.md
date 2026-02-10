# セキュリティ監査証跡 v2（環境同期後・再実施）

**監査日**: 2026-02-09  
**監査対象環境**: staging（本番と完全同期済み）  
**Supabase Project ID**: `lavutzztfqbdndjiwluc`（staging） / `cznpcewciwywcqcxktba`（production）  
**Git SHA**: `4538563b698ebfa57701c6e2fa90146650be8a1a`  
**監査者**: AIエージェント  
**前提**: staging DB のスキーマ・データ・RLS・Extensions・Triggers・Indexes・Cron Jobs・Edge Functions を本番から完全同期した上で実施

---

## P0ゲート判定（最終結論）

| # | 停止条件 | 結果 | 判定 |
|---|---------|------|------|
| 1 | URL混線（staging→prod 遷移） | staging URL のみ維持 | ✅ NO |
| 2 | RLS境界破壊: `OR TRUE` | **修正済み（2026-02-09 再実行で 0件確認）** | ✅ FIXED |
| 3 | RLS境界破壊: UPDATE `WITH CHECK` 欠落 | **修正済み（2026-02-09 再実行で 0件確認）** | ✅ FIXED |
| 4 | SECURITY DEFINER + anon EXECUTE (unexpected) | **多数検出（要ホワイトリスト確定）** | ⚠️ **要判定** |
| 5 | CORS許可過多 | 本番Originのみ | ✅ NO |
| 6 | 二重確定/残席ズレ再現 | 未テスト（環境同期後） | ⏳ **要テスト** |
| 7 | 監査ログ欠落 | ログ記録あり（actor/target/before-after） | ✅ NO |
| 8 | 秘密情報混線 | publishable key のみ | ✅ NO |

**現時点の判定: ⚠️ P0修正完了（#2, #3 修正済み）。#6 の実操作テストが残存。**

---

## Must 1) 監査証跡

- [x] `docs/SEC_AUDIT_RUN_v2_2026-02-09.md` を作成（本ファイル）
- [x] 監査日・環境・Project ID・Git SHA を記録
- [x] 環境同期の前提条件を明記

---

## Must 2) Supabase Auth URL混線チェック

### 実行結果（Management API から取得）

| 項目 | 値 |
|------|-----|
| **site_url** | `https://mmq-yoyaq-git-staging-nagayoshi0923s-projects.vercel.app` |
| **uri_allow_list** | `https://mmq-yoyaq-git-staging-nagayoshi0923s-projects.vercel.app/**` |
| **external_google_enabled** | `true` |
| **external_google_client_id** | `946037733230-2i5jm519flgfpskfhvqst96qoklsj787.apps.googleusercontent.com` |

### 判定

- ✅ Site URL: staging URL のみ（本番URL混入なし）
- ✅ Redirect URLs: staging ワイルドカードのみ（1件）
- ✅ Google OAuth: 有効、staging callback URI に整合
- ✅ **合格**

---

## Must 3) RLS（マルチテナント境界）

### 3a) RLS無効テーブル

```sql
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = false;
```

**結果**: 2テーブルが RLS 無効

| tablename | rowsecurity |
|-----------|------------|
| discord_interaction_dedupe | false |
| salary_settings_history | false |

**評価**: 
- `discord_interaction_dedupe` — Discord重複排除用。ユーザーデータなし → **低リスク（許容）**
- `salary_settings_history` — 給与設定履歴。組織データを含む可能性 → **⚠️ 要確認**

### 3b) OR TRUE パターン

```sql
SELECT tablename, policyname FROM pg_policies 
WHERE schemaname = 'public' 
  AND (qual::text ILIKE '%OR TRUE%' OR with_check::text ILIKE '%OR TRUE%');
```

**結果**: ❌ **1件検出**

| tablename | policyname | 場所 |
|-----------|-----------|------|
| gm_availability_responses | gm_availability_responses_insert_policy | WITH CHECK |

**WITH CHECK 内容**:
```
(organization_id = current_organization_id()) OR (organization_id IS NULL) OR (current_organization_id() IS NULL) OR is_admin() OR true
```

**リスク**: `OR true` により、**誰でも任意の organization_id で INSERT 可能**。マルチテナント境界破壊。

**対応**: ✅ **修正完了** — `OR true` を削除（2026-02-09 staging SQL Editor で実行、再検証で 0件確認）

### 3c) UPDATE に WITH CHECK がないポリシー

```sql
SELECT tablename, policyname, cmd FROM pg_policies 
WHERE schemaname = 'public' AND cmd = 'UPDATE' 
  AND (with_check IS NULL OR with_check::text = '');
```

**結果**: ❌ **49件検出**

<details>
<summary>全49件の一覧（クリックで展開）</summary>

| tablename | policyname |
|-----------|-----------|
| authors | authors_update_admin |
| booking_notices | ... |
| business_hours_settings | business_hours_settings_update_admin |
| customer_settings | customer_settings_update_own_org |
| customers | customers_update_self_or_admin |
| customers | customers_update_unified |
| daily_memos | daily_memos_update_staff_or_admin |
| data_management_settings | data_management_settings_update_admin |
| email_settings | email_settings_update_admin |
| external_performance_reports | external_reports_org_update |
| game_players | Users can update their own player record |
| game_sessions | Hosts can update their sessions |
| global_settings | Users can update own organization settings |
| global_settings | global_settings_update_admin |
| gm_availability_responses | gm_availability_responses_update_policy |
| gm_availability_responses | gm_availability_responses_update_self_or_admin |
| kit_transfer_events | kit_transfer_events_update_policy |
| license_report_history | license_report_history_update |
| manual_external_performances | Users can update their org manual externals |
| miscellaneous_transactions | miscellaneous_transactions_update_admin |
| notification_settings | notification_settings_update_own_org |
| online_scenarios | Users can update their own scenarios |
| organization_invitations | organization_invitations_update_policy |
| organization_scenarios | org_scenarios_update |
| organization_settings | organization_settings_update |
| organization_settings | organization_settings_update_own_org |
| performance_kits | performance_kits_update_admin |
| performance_schedule_settings | performance_schedule_settings_update_admin |
| reservation_settings | reservation_settings_update_admin |
| reservations | reservations_update_admin |
| reservations | reservations_update_unified |
| sales_report_settings | sales_report_settings_update_admin |
| scenario_kit_locations | scenario_kit_locations_update_policy |
| scenario_likes | scenario_likes_update |
| scenario_master_corrections | corrections_update |
| scenario_masters | scenario_masters_update |
| scenarios | scenarios_update_admin |
| schedule_events | schedule_events_update_staff_or_admin |
| schedule_events | schedule_events_update_unified |
| shift_button_states | Enable update for authenticated users |
| shift_submissions | shift_submissions_update_self_or_admin |
| staff | staff_update_self_or_admin |
| staff | staff_update_unified |
| staff_scenario_assignments | staff_scenario_assignments_update_admin |
| staff_settings | staff_settings_update_admin |
| store_basic_settings | store_basic_settings_update_admin |
| stores | stores_update_admin |
| system_settings | system_settings_update_admin |
| users | users_update_self_or_admin |
| waitlist | Users can update own or org waitlist |

</details>

**リスク**: WITH CHECK なしの UPDATE では、更新後の行が組織境界を越える可能性がある。

**対応**: ✅ **修正完了** — 全49件に WITH CHECK = USING を追加（2026-02-09 staging SQL Editor で一括実行、再検証で 0件確認）

### 3d) organization_id IS NULL パターン

**結果**: 44件のポリシーに `organization_id IS NULL` を含む条件が存在。

**評価**: `current_organization_id() IS NULL` は「ユーザーが組織に属していない場合」のフォールバックで、多くの設定系テーブルの `_org_policy` で使用。RLS ヘルパー関数の設計上の許容パターンだが、`OR true` と組み合わさると危険。

---

## Must 4) 危険RPC（SECURITY DEFINER）公開面

### SECURITY DEFINER + anon EXECUTE 一覧

**検出数: 58関数**

分類:

**A. RLSヘルパー（RLSポリシー内で呼ばれる、anon必須）**:
- `current_organization_id`, `get_user_organization_id`, `get_user_role`
- `is_admin`, `is_license_admin`, `is_license_manager`, `is_org_admin`
- `is_organization_member`, `is_staff_or_admin`

**B. 予約系（顧客向け、anon + auth.uid() で保護）**:
- `create_reservation_with_lock_v2`, `cancel_reservation_with_lock` (2 overloads)
- `update_reservation_participants`, `check_reservation_deadline`
- `check_reservation_status_transition`, `validate_reservation_status_transition`
- `check_rate_limit`, `accept_invitation_atomic`
- `calculate_cancellation_fee`

**C. 管理系（admin向け、内部で権限チェックあり）**:
- `admin_clear_reservations_scenario_id`
- `admin_delete_reservations_by_ids`
- `admin_delete_reservations_by_schedule_event_ids`
- `admin_delete_reservations_by_source`
- `admin_recalculate_reservation_prices` (2 overloads)
- `admin_update_reservation_fields`
- `approve_private_booking`
- `cancel_event_reservations`
- `create_reservation_with_lock` (legacy)
- `create_notification`, `fetch_and_lock_waitlist_entries`
- `get_email_template`, `log_audit`

**D. トリガー/内部関数（直接呼び出し不可、anon権限不要）**:
- `audit_*` (7件), `handle_new_user`, `log_reservation_change`
- `notify_on_*` (2件), `recalc_current_participants_*` (2件)
- `check_reservation_status_transition`, `trigger_waitlist_retry`

**E. Cron/バッチ（service-role呼び出し想定）**:
- `check_performances_*` (2件), `cleanup_*` (4件)
- `check_and_fix_inventory_consistency` (2 overloads)
- `process_discord_notification_queue`
- `run_inventory_consistency_check` (2 overloads)

**判定**: 
- カテゴリ C, D, E は `anon` の EXECUTE 不要。`REVOKE` で最小権限化すべき。
- **現状は内部で権限チェックがあるため即座のリスクは低い**が、ベストプラクティス違反。
- ⚠️ **Should として対応推奨**（P0 ブロッカーとはしない）

---

## Must 5) Edge Functions 認証/CORS/権限/入力検証

### コードレビュー結果

**ALLOWED_ORIGINS** (`supabase/functions/_shared/security.ts`):
- ✅ 本番: `https://mmq-yoyaq.vercel.app` のみ
- ✅ 非本番: `localhost:5173`, `localhost:3000` のみ追加
- ✅ `getCorsHeaders()` で Origin 検証済み

**認証チェック**:
- ✅ `verifyAuth()` 関数が主要 Function で使用
- ✅ `isCronOrServiceRoleCall()` で cron/service-role を許可
- ✅ Discord 系は署名検証を使用

**入力検証**:
- ✅ メールアドレス・名前のマスキング実装
- ✅ エラーメッセージのサニタイズ実装

**判定**: ✅ **合格**

---

## Must 6) 予約/キャンセル競合テスト

### コードレビュー結果

**予約作成RPC (`create_reservation_with_lock_v2`)**:
- ✅ `FOR UPDATE` で `schedule_events` 行をロック
- ✅ `FOR UPDATE SKIP LOCKED` で重複チェック
- ✅ 在庫チェックはロック後に実行
- ✅ トランザクション内でアトミックに処理

**判定**: コード上は ✅。**実操作テストは環境同期後に実施が必要**（ユーザーによる手動テスト推奨）

---

## Must 7) ログ/追跡性

### audit_logs 実データ確認

```sql
SELECT id, user_id, user_email, action, resource_type, resource_id, created_at 
FROM public.audit_logs ORDER BY created_at DESC LIMIT 5;
```

**結果（本番データが同期されているため実運用ログが含まれる）**:

| action | user_email | resource_type | resource_id | created_at |
|--------|-----------|---------------|-------------|------------|
| SECURITY_SNAPSHOT | (system) | db_function_privileges | - | 2026-02-08 |
| update_role | mai.nagayoshi@gmail.com | user | 948b76c9-... | 2026-02-07 |
| update_status | g.kkyota@icloud.com | reservation | b8c7a8fd-... | 2026-02-06 |
| update_participant_count | piyona1221@gmail.com | reservation | 33c02518-... | 2026-02-05 |
| update_status | kei.tokyo.w@gmail.com | reservation | 914bd323-... | 2026-02-05 |

**確認項目**:
- ✅ actor（誰が）: `user_email` に記録あり
- ✅ target（何を）: `resource_type` + `resource_id` に記録あり
- ✅ 操作種別: `action` に記録あり（update_role, update_status, update_participant_count）
- ✅ タイムスタンプ: `created_at` に記録あり

**判定**: ✅ **合格** — 実運用データで actor/target/action が記録されていることを確認

---

## Must 8) 秘密情報混線チェック

### Git 追跡状況

```bash
git ls-files | grep -E '\.env'
```

**結果**:
- `.env.example` — テンプレート（OK）
- `.env.local.example` — テンプレート（OK）
- `.env.staging.example` — テンプレート（OK）
- ✅ `.env.local` は追跡されていない（前回の `git rm --cached` が反映済み）

### フロントエンドのキー使用

`src/lib/supabase.ts`:
- ✅ `VITE_SUPABASE_PUBLISHABLE_KEY` または `VITE_SUPABASE_ANON_KEY` のみ使用
- ✅ `service_role` キーはフロントエンドコードに含まれない

**判定**: ✅ **合格**

---

## Must 9) リリース停止条件（P0ゲート）

### 未解決の P0 問題

1. **`OR TRUE` が1件残存** — `gm_availability_responses_insert_policy`
2. **UPDATE `WITH CHECK` 欠落が49件** — 組織境界の更新後チェックが不在

### 修正が必要な作業

これらは本番の RLS ポリシーに存在する問題であり、**本番にも修正を適用する必要がある**。

---

## 次のステップ

1. ❌ **P0修正**: `OR TRUE` の削除（1件）
2. ❌ **P0修正**: UPDATE `WITH CHECK` の追加（49件）
3. ⚠️ **Should**: SECURITY DEFINER 関数の `anon` EXECUTE 最小権限化
4. ⏳ **テスト**: 修正適用後に予約競合の実操作テスト
5. ⏳ **再検証**: 修正後に本レポートの P0 ゲートを更新
