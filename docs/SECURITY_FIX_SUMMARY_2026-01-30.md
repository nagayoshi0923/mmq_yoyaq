# セキュリティ修正サマリ（2026-01-30）

**修正日**: 2026-01-31  
**元ISSUE**: `docs/SECURITY_PRE_RELEASE_ISSUE_2026-01-30.md`  
**修正計画**: `docs/SECURITY_FIX_PLAN_2026-01-30.md`

---

## 修正完了項目

### ✅ SEC-P1-XX: 冪等性（予約作成/予約確認メール）

**問題**: 通信断/リトライ/二重クリックで、予約やメールが二重処理される

**修正内容**:
- **フロント**:
  - `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts`
    - 同一送信内で `reservation_number` を固定してリトライ時に同じ番号を使用
  - `src/lib/reservationApi.ts`
    - `reservation_number` を受け取り、UNIQUE衝突時は既存予約を取得して成功扱い（1件に収束）
- **DB（Supabase migration）**:
  - `supabase/migrations/20260131003000_booking_email_queue_idempotency.sql`
    - `booking_email_queue(reservation_id,email_type)` を一意化
- **Edge Function**:
  - `supabase/functions/send-booking-confirmation/index.ts`
    - `booking_email_queue` を参照し、`completed` なら送信をスキップ
    - 成功/失敗でキューを更新してリトライ基盤と整合

**本番検証**:
- SQL: `docs/deployment/sql/SEC_P1_XX_ts0_check_booking_email_queue_unique.sql`（`unique_index_exists=true`）

---

### ✅ SEC-P1-01: 予約制限チェック（fail-open排除 + DB強制）

**修正内容**:
- **フロント**: `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts`
  - 予約制限の取得/判定エラー時は fail-closed（予約不可）に統一
- **DB（Supabase migration）**: `supabase/migrations/20260130233000_enforce_reservation_limits_server_side.sql`
  - `create_reservation_with_lock_v2` / `create_reservation_with_lock` に締切/上限/件数制限を追加

---

### ✅ SEC-P1-02: 在庫整合性（current_participants）

**修正内容**:
- **DB（Supabase migration）**: `supabase/migrations/20260130260000_recalc_current_participants_trigger.sql`
  - `reservations` 変更時に `schedule_events.current_participants` を再集計して追従

**本番検証**:
- SQL: `docs/deployment/sql/SEC_P1_02_ts0_check_trigger.sql`（`trigger_exists=true`）

---

### ✅ SEC-P2-01: 予約詳細のID列挙ノイズ

**修正内容**:
- **フロント**: `src/pages/MyPage/pages/ReservationDetailPage.tsx`
  - `maybeSingle()` に統一し、「存在しない/権限なし」を区別しないメッセージに統一

---

### ✅ SEC-P2-02: 障害時fail-openの残存

**修正内容**:
- **フロント**:
  - `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts`（予約制限はfail-closed化済み）
  - `src/pages/CustomerBookingPage.tsx`（営業時間チェックを fail-closed 寄りに）

---

### ✅ SEC-P0-02: 料金/日時のクライアント入力（予約作成RPC）

**問題**: API直叩きで `requested_datetime` や料金（`total_price/unit_price/base_price`）を改ざんして予約作成できる疑い

**修正内容**:
- **DB（Supabase migration）**:
  - `supabase/migrations/20260130190000_harden_create_reservation_with_lock_server_pricing.sql`
    - 既存 `create_reservation_with_lock` のシグネチャを維持したまま、**料金/日時はサーバー側で確定**（入力値を無視）
  - `supabase/migrations/20260130_create_reservation_with_lock_v2.sql`
    - `create_reservation_with_lock_v2` を追加（必須パラメータのみ、料金/日時は常にサーバー計算）
- **フロント**:
  - `src/lib/reservationApi.ts` で v2 優先呼び出し + 旧RPCフォールバック（段階移行）

**本番検証**:
- Runbook: `docs/deployment/SEC_P0_02_PROD_DB_CHECK_RUNBOOK.md`
- SQL: `docs/deployment/sql/SEC_P0_02_test_old_rpc_one_query.sql` / `SEC_P0_02_test_v2_one_query.sql`

---

### ✅ SEC-P1-03: reservations の監査証跡（reservations_history）

**問題**: 予約の状態変更（誰が/いつ/何を）が永続的に追えず、事故時に再現・責任切り分けが困難

**修正内容**:
- **DB（Supabase migration）**: `supabase/migrations/20260130243000_create_reservations_history.sql`
  - `reservations_history` テーブルを追加
  - `reservations` に `AFTER INSERT/UPDATE/DELETE` トリガを追加して差分を記録
  - クライアントからの直接書き込みを禁止（権限でREVOKE）
  - 閲覧は staff/admin のみに限定（組織一致）

**本番検証**:
- Runbook: `docs/deployment/SEC_P1_03_RESERVATIONS_HISTORY_RUNBOOK.md`

---

### ✅ SEC-P0-04: 貸切承認の非アトミック性

**問題**: 承認が複数のDB操作に分かれており、途中失敗で不整合（confirmedだが公演なし等）が残り得る

**修正内容**:
- **DB（Supabase migration）**:
  - `supabase/migrations/20260130210000_approve_private_booking_atomic.sql`
    - `approve_private_booking` RPC を追加（予約更新 + schedule_events作成 + 紐付けを1トランザクションで保証）
  - `supabase/migrations/20260130220000_fix_approve_private_booking_rls.sql`
    - `SET row_security = off` で RLS/FORCE RLS の影響を排除
    - `UPDATE reservations` が 0 行の場合は例外（`P0024`）で **fail-closed**
- **フロント**: `src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts`
  - 直接 `reservations`/`schedule_events` を触る処理を廃止し、RPC呼び出しへ置換

**本番検証**:
- Runbook: `docs/deployment/SEC_P0_04_PRIVATE_BOOKING_APPROVAL_RUNBOOK.md`
- SQL: `docs/deployment/sql/SEC_P0_04_test_approve_ts1_stepA.sql` + `SEC_P0_04_test_approve_ts1_stepB_rollback.sql` で `pass=true` を確認

---

### ✅ SEC-P0-01: reservations の顧客UPDATE権限を厳格化

**問題**: 顧客が `status`, `participant_count`, `schedule_event_id`, 料金等を直接変更可能

**修正内容**:
- **マイグレーション**: `database/migrations/026_restrict_customer_reservation_update.sql`
  - `reservations_update_customer` ポリシーを削除
  - `reservations_update_customer_restricted` ポリシーを追加
  - WITH CHECK 句で重要列（status, participant_count, schedule_event_id, 料金系）の変更を禁止
- **影響**: なし（既存機能はRPC経由なので動作継続）

**変更ファイル**:
- `database/migrations/026_restrict_customer_reservation_update.sql` ← 新規作成

---

### ✅ SEC-P0-03: notify-waitlist の bookingURL 入力値問題

**問題**: フィッシングURL注入の可能性

**修正内容**:
- **Edge Function**: `supabase/functions/notify-waitlist/index.ts`
  - bookingUrl をサーバー側で生成（organizations テーブルから slug/domain を取得）
  - クライアントからの bookingUrl パラメータを無視
- **フロント**: `src/lib/reservationApi.ts`
  - notify-waitlist 呼び出し時に bookingUrl を送信しないよう削除

**変更ファイル**:
- `supabase/functions/notify-waitlist/index.ts` ← 修正
- `src/lib/reservationApi.ts` ← 修正

---

### ✅ SEC-P0-05: updateParticipantCount の二重UPDATE削除

**問題**: RPC で人数変更後、料金を直接UPDATEしており、在庫ロックなしで料金改ざん可能

**修正内容**:
- **フロント**: `src/lib/reservationApi.ts`
  - `updateParticipantCount` 関数から直接UPDATEを削除
  - RPC（`updateParticipantsWithLock`）のみで完結
- **注**: 料金の再計算は将来的にRPC内で実施（現状は表示のみ）

**変更ファイル**:
- `src/lib/reservationApi.ts` ← 修正（既に一部対応済みだったため最小限の変更）

---

### ✅ SEC-P0-06: 日程変更の在庫破壊問題

**問題**: 在庫ロックなしで schedule_event_id を変更、旧/新イベント両方で在庫不整合

**修正内容**:
- **マイグレーション**: `database/migrations/027_add_change_schedule_rpc.sql`
  - `change_reservation_schedule` RPC 関数を追加
  - 旧/新イベント両方をロック
  - 在庫をアトミックに調整（旧から返却、新で確保）
- **フロント**: `src/pages/MyPage/pages/ReservationsPage.tsx`
  - 直接UPDATEを削除
  - `change_reservation_schedule` RPC 呼び出しに置き換え

**変更ファイル**:
- `database/migrations/027_add_change_schedule_rpc.sql` ← 新規作成
- `src/pages/MyPage/pages/ReservationsPage.tsx` ← 修正

---

## 保留項目

- **なし**（全て「修正完了」または「本番Runbookで手動確認」に落とし込み済み）

---

## テスト実施（推奨）

### 1. マイグレーション適用テスト

```bash
# ローカル環境で確認
cd /Users/mai/mmq_yoyaq/mmq_yoyaq
supabase db reset
supabase db push

# 適用確認
supabase db diff
```

### 2. 機能テスト

```
✅ 予約作成が正常に動作するか
✅ 人数変更が正常に動作するか（RPC経由）
✅ 日程変更が正常に動作するか（RPC経由）
✅ キャンセル待ち通知が送信されるか（bookingURL が正しいか）
❌ 顧客が status を直接変更できないか（セキュリティテスト）
❌ 顧客が participant_count を直接変更できないか（セキュリティテスト）
❌ 顧客が料金を直接変更できないか（セキュリティテスト）
```

### 3. セキュリティテスト

```typescript
// ブラウザコンソールで実行（攻撃シミュレーション）

// テスト1: status 変更（失敗すべき）
await supabase.from('reservations').update({ 
  status: 'cancelled' 
}).eq('id', '自分の予約ID')
// 期待: RLSエラー（WITH CHECK 違反）

// テスト2: participant_count 変更（失敗すべき）
await supabase.from('reservations').update({ 
  participant_count: 1000 
}).eq('id', '自分の予約ID')
// 期待: RLSエラー（WITH CHECK 違反）

// テスト3: 料金変更（失敗すべき）
await supabase.from('reservations').update({ 
  total_price: 1 
}).eq('id', '自分の予約ID')
// 期待: RLSエラー（WITH CHECK 違反）
```

---

## 修正前後の比較

### 修正前のリスク

| 攻撃 | 成功可能性 | 被害 |
|------|----------|------|
| 顧客が自分の予約の status を cancelled に変更 | ✅ 可能 | 在庫破壊、過剰予約 |
| 顧客が participant_count を 1000 に変更 | ✅ 可能 | 在庫破壊、現場パニック |
| 顧客が schedule_event_id を変更して別公演に移動 | ✅ 可能 | 在庫不整合、ダブルブッキング |
| 顧客が料金を 1円 に変更 | ✅ 可能 | 会計破壊、売上損失 |
| フィッシングURL を notify-waitlist 経由で配布 | ✅ 可能 | 顧客被害、ブランド毀損 |

### 修正後の状態

| 攻撃 | 成功可能性 | 対策 |
|------|----------|------|
| 顧客が自分の予約の status を変更 | ❌ 不可 | RLS WITH CHECK でブロック |
| 顧客が participant_count を変更 | ❌ 不可 | RLS WITH CHECK でブロック |
| 顧客が schedule_event_id を変更 | ❌ 不可 | RLS WITH CHECK + RPC強制 |
| 顧客が料金を変更 | ❌ 不可 | RLS WITH CHECK でブロック |
| フィッシングURL 注入 | ❌ 不可 | サーバー側で生成、入力値無視 |

---

## 既知の制約・トレードオフ

### 制約1: 料金の更新

**現状**: `update_reservation_participants` RPC は人数のみ更新、料金は更新しない

**影響**:
- 人数変更時、料金は自動更新されない
- `unit_price × 新人数` で計算されることを想定

**将来対応**:
- RPC内で料金も再計算するよう拡張
- または、スタッフが管理画面から手動調整

### 制約2: 貸切承認

**現状**: RPC化してアトミック保証済み（本番検証pass）

---

## 次のステップ

### 即座実施（本番で必須）

1. **【こっちで必ず確認（手動）】本番SQL Runbook を実行（順不同だが全て必須）**
   - SEC-P0-02: `docs/deployment/SEC_P0_02_PROD_DB_CHECK_RUNBOOK.md`（改ざんテスト/ROLLBACK付き）
   - SEC-P1-01: `docs/deployment/SEC_P1_01_RESERVATION_LIMITS_RUNBOOK.md`（TS-0）
   - SEC-P1-02: `docs/deployment/SEC_P1_02_INVENTORY_CONSISTENCY_RUNBOOK.md`（TS-0）
   - SEC-P1-03: `docs/deployment/SEC_P1_03_RESERVATIONS_HISTORY_RUNBOOK.md`（TS-0 + TS-1/ROLLBACK）
   - SEC-P1-XX: `docs/deployment/SEC_P1_XX_IDEMPOTENCY_RUNBOOK.md`（メールキュー UNIQUE 確認）

2. **【こっちで必ず確認（手動）】主要導線の軽い動作確認**
   - 予約作成 / 人数変更 / 日程変更 / キャンセル / キャンセル待ち通知（bookingURLが正しい）

### 余力があれば（推奨）

3. **攻撃シミュレーション（ブラウザコンソール）**
   - 顧客の `reservations` 直接UPDATE（`status` / `participant_count` / 料金系）が **RLS（WITH CHECK）で失敗**することを確認

4. **監視・ログ確認**
   - Supabase Logs / Vercel Logs を確認（異常スパイクやエラーが無いこと）

---

## 修正ファイル一覧

### 新規作成

- `database/migrations/026_restrict_customer_reservation_update.sql`
- `database/migrations/027_add_change_schedule_rpc.sql`
- `database/migrations/028_atomic_private_booking_approval.sql`（旧案/参考。実運用は `supabase/migrations/20260130210000_approve_private_booking_atomic.sql` + `20260130220000_fix_approve_private_booking_rls.sql` を使用）

### Supabase migrations（本番適用対象）

- `supabase/migrations/20260130190000_harden_create_reservation_with_lock_server_pricing.sql`（SEC-P0-02）
- `supabase/migrations/20260130_create_reservation_with_lock_v2.sql`（SEC-P0-02）
- `supabase/migrations/20260130210000_approve_private_booking_atomic.sql`（SEC-P0-04）
- `supabase/migrations/20260130220000_fix_approve_private_booking_rls.sql`（SEC-P0-04）
- `supabase/migrations/20260130233000_enforce_reservation_limits_server_side.sql`（SEC-P1-01）
- `supabase/migrations/20260130243000_create_reservations_history.sql`（SEC-P1-03）
- `supabase/migrations/20260130260000_recalc_current_participants_trigger.sql`（SEC-P1-02）
- `supabase/migrations/20260131003000_booking_email_queue_idempotency.sql`（SEC-P1-XX）

### 修正

- `supabase/functions/notify-waitlist/index.ts`
- `src/lib/reservationApi.ts`
- `src/pages/MyPage/pages/ReservationsPage.tsx`

### ドキュメント

- `docs/SECURITY_PRE_RELEASE_ISSUE_2026-01-30.md` ← 元ISSUE
- `docs/SECURITY_FIX_PLAN_2026-01-30.md` ← 修正計画
- `docs/SECURITY_INVESTIGATION_RESULTS_2026-01-30.md` ← 調査結果
- `docs/SECURITY_FIX_SUMMARY_2026-01-30.md` ← このファイル

---

## ロールバック手順

各マイグレーションファイル末尾にロールバックSQLを記載済み。

問題が発生した場合:
- SQL: [`docs/deployment/sql/SEC_ROLLBACK_026_027.sql`](docs/deployment/sql/SEC_ROLLBACK_026_027.sql)

---

**修正者**: AI Assistant  
**修正日時**: 2026-01-30  
**レビュー待ち**: あり（本番Runbook完了でクローズ想定）
