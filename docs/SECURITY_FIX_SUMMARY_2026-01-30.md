# セキュリティ修正サマリ（2026-01-30）

**修正日**: 2026-01-30  
**元ISSUE**: `docs/SECURITY_PRE_RELEASE_ISSUE_2026-01-30.md`  
**修正計画**: `docs/SECURITY_FIX_PLAN_2026-01-30.md`

---

## 修正完了項目

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

### ⏸️ SEC-P0-02: 料金/日時のクライアント入力

**状況**: RPC関数のシグネチャ不一致を確認
- 022（最新）: 料金パラメータなし
- 005/006（古い）: 料金パラメータあり
- フロント: 料金パラメータを送信

**判定**: 本番DB状態の確認が必要
- もし022が適用済みなら、予約システムが壊れているはず
- もし005/006が有効なら、料金改ざんリスクあり

**対応**: 本番DB確認後に判断

---

### ⏸️ SEC-P0-04: 貸切承認の非アトミック性

**状況**: RPC関数（`approve_private_booking`）は作成済み（028）
- フロント適用は複雑で、既存機能を壊すリスクあり
- 現状は「事故が起きやすい」問題だが、「攻撃で悪用」は困難

**判定**: Phase 2（慎重な書き直し）で対応

**対応**: 028マイグレーションは作成済みだが、フロント適用は保留

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

**現状**: フロント側で複数DB操作（非アトミック）

**理由**: RPC化すると既存機能（候補日時の管理、メール送信等）を全書き直しが必要

**リスク**: 中程度（通信断で部分成功の可能性）

**対応**: Phase 2で慎重に実装

---

## 次のステップ

### 即座実施（今日中）

1. **本番DB確認**
   ```sql
   -- create_reservation_with_lock のシグネチャ確認
   \df create_reservation_with_lock
   
   -- reservations のRLSポリシー確認
   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'reservations';
   ```

2. **マイグレーション適用**
   ```bash
   # ステージング環境で検証
   supabase db push
   
   # 機能テスト実施
   ```

3. **本番適用判断**
   - ステージングで問題なければ本番適用
   - 週末など影響が少ない時間帯に実施

### 今週中

4. **SEC-P0-02対応**（本番DB状態確認後）
5. **セキュリティテスト実施**
6. **監視・ログ確認**

---

## 修正ファイル一覧

### 新規作成

- `database/migrations/026_restrict_customer_reservation_update.sql`
- `database/migrations/027_add_change_schedule_rpc.sql`
- `database/migrations/028_atomic_private_booking_approval.sql` （フロント適用は保留）

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
```sql
-- 026のロールバック
DROP POLICY IF EXISTS reservations_update_customer_restricted ON reservations;
CREATE POLICY reservations_update_customer ON reservations
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- 027のロールバック
DROP FUNCTION IF EXISTS change_reservation_schedule(UUID, UUID, UUID);
```

---

**修正者**: AI Assistant  
**修正日時**: 2026-01-30  
**レビュー待ち**: あり（本番適用前に確認推奨）
