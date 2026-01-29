# セキュリティISSUE 実装調査結果（2026-01-30）

**調査日**: 2026-01-30  
**調査対象**: `docs/SECURITY_PRE_RELEASE_ISSUE_2026-01-30.md` で指摘されたP0項目  
**目的**: 「本当に問題か」「すでに対策済みか」を確定させる

---

## 🚨 緊急: 致命的な不整合を発見

### 問題: RPC関数のシグネチャ不一致

**フロントエンド（実際の呼び出し）**:
```typescript
// src/lib/reservationApi.ts: L196-215
await supabase.rpc('create_reservation_with_lock', {
  p_schedule_event_id: reservation.schedule_event_id,
  p_participant_count: reservation.participant_count,
  p_customer_id: reservation.customer_id,
  // ... 他のパラメータ ...
  p_base_price: reservation.base_price,        // ← 送信している
  p_total_price: reservation.total_price,      // ← 送信している
  p_unit_price: reservation.unit_price,        // ← 送信している
  p_requested_datetime: reservation.requested_datetime,  // ← 送信している
  p_reservation_number: reservationNumber,
  // ...
})
```

**データベース（022の定義）**:
```sql
-- database/migrations/022_fix_reservation_race_condition.sql: L10-19
CREATE OR REPLACE FUNCTION create_reservation_with_lock(
  p_schedule_event_id UUID,
  p_customer_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT,
  p_customer_phone TEXT,
  p_participant_count INTEGER,
  p_notes TEXT DEFAULT NULL,
  p_how_found TEXT DEFAULT NULL
)
-- ↑ 価格/日時/予約番号のパラメータが存在しない！
```

### 結論: **2つのバージョンが混在している可能性**

#### パターンA: 022が適用されていない（005/006が有効）
- **状況**: フロントは正常動作するが、料金はクライアント入力のまま
- **リスク**: **SEC-P0-02（料金改ざん）が確定**

#### パターンB: 022が適用されている
- **状況**: フロントからの予約作成が**エラーになるはず**
- **リスク**: **予約システムが壊れている**

### 今すぐ確認すべきこと

```sql
-- 本番DBで実行
SELECT 
  proname,
  pronargs,
  proargnames,
  proargtypes
FROM pg_proc 
WHERE proname = 'create_reservation_with_lock';
```

---

## 調査結果サマリ

### ✅ SEC-P0-01: reservations の顧客UPDATE許可 → **確定（危険）**

**証拠**:
```sql
-- database/migrations/025_allow_customer_reservation_update.sql: L21-26
CREATE POLICY reservations_update_customer ON reservations
  FOR UPDATE USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  ) WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );
-- ↑ 列制限なし = status, participant_count, schedule_event_id 等すべて変更可能
```

**実際にフロントで直接UPDATEしている箇所**:
1. `src/lib/reservationApi.ts`: L335-343
   ```typescript
   const { error: updateError } = await supabase
     .from('reservations')
     .update({
       participant_count: newCount,      // ← 在庫に影響
       total_price: newTotalPrice,       // ← 料金に影響
       final_price: newTotalPrice,
       updated_at: new Date().toISOString()
     })
     .eq('id', reservationId)
   ```
   - **問題**: この前に `updateParticipantsWithLock` RPC を呼んでいるが、その**後**に直接UPDATEで料金を更新している
   - **リスク**: RPCで在庫確保した後、料金だけ勝手に変更できる

2. `src/pages/MyPage/pages/ReservationsPage.tsx`: L535-543
   ```typescript
   const { error } = await supabase
     .from('reservations')
     .update({
       base_price: newBasePrice,
       total_price: newTotalPrice,
       final_price: newFinalPrice,
       unit_price: pricePerPerson
     })
     .eq('id', editTarget.id)
   ```
   - **問題**: RPCで人数変更した後、料金を直接UPDATE
   - **リスク**: 料金改ざん可能

3. `src/pages/MyPage/pages/ReservationsPage.tsx`: L634-641
   ```typescript
   const { error } = await supabase
     .from('reservations')
     .update({
       schedule_event_id: selectedNewEventId,  // ← 日程変更
       store_id: newEvent.store_id,
       requested_datetime: `${newEvent.date}T${newEvent.start_time}`
     })
     .eq('id', dateChangeTarget.id)
   ```
   - **問題**: 在庫ロックなしで `schedule_event_id` を変更
   - **リスク**: 旧イベントの在庫が戻らない、新イベントの在庫が消費されない

**判定**: **P0確定 - 即座に修正必須**

---

### ❓ SEC-P0-02: 料金/日時のクライアント入力 → **要確定（シグネチャ不一致）**

**現状の矛盾**:

| バージョン | 料金パラメータ | 適用日 | 状態 |
|------------|---------------|--------|------|
| 005/006 | あり（受け取る） | 2026-01-28 | 古い？ |
| 022 | **なし（受け取らない）** | 2026-01-29 | **最新？** |

**フロントの呼び出し**:
- `p_base_price`, `p_total_price`, `p_unit_price`, `p_requested_datetime`, `p_reservation_number` を送信している
- 022のシグネチャにはこれらのパラメータが存在しない

**3つのシナリオ**:

#### シナリオ1: 022が本番DBに適用されている
- **結果**: フロントからのRPC呼び出しがエラーになる（パラメータ過多）
- **対応**: **予約システムが壊れている可能性** → 即座に動作確認が必要
- **修正**: フロントのパラメータを022に合わせる or 022を005/006に戻す

#### シナリオ2: 005/006が本番DBで有効（022は未適用/無視）
- **結果**: フロントは正常動作するが、料金はクライアント入力のまま
- **リスク**: **料金改ざん可能** → SEC-P0-02確定
- **修正**: 料金を005/006のRPC内で再計算するよう修正

#### シナリオ3: マイグレーション適用が複雑（database/ と supabase/ で二重管理）
- `database/migrations/` と `supabase/migrations/` が別々に存在
- どちらが本番DBに適用されているか不明

**判定**: **確定には本番DB確認が必要** → 優先度は保留（P0のまま調査継続）

**今すぐ実行すべきコマンド**:
```bash
# Supabase管理画面で実行 or ローカルで確認
SELECT 
  proname,
  pronargs,
  array_to_string(proargnames, ', ') as arg_names
FROM pg_proc 
WHERE proname = 'create_reservation_with_lock'
  AND pronamespace = 'public'::regnamespace;
```

---

### ✅ SEC-P0-03: notify-waitlist の権限 → **すでに対策済み！**

**調査結果**:
```typescript
// supabase/functions/notify-waitlist/index.ts: L58-67
// 🔒 認証チェック: ログイン済みユーザーのみ呼び出し可能
const authResult = await verifyAuth(req)
if (!authResult.success) {
  console.warn('⚠️ 認証失敗: notify-waitlist への不正アクセス試行')
  return errorResponse(
    authResult.error || '認証が必要です',
    authResult.statusCode || 401,
    corsHeaders
  )
}
```

**さらに権限チェック**:
```typescript
// L82-118
// スタッフかどうか確認
const { data: staffMember } = await staffQuery.maybeSingle()

if (!staffMember) {
  // スタッフでなければ、そのイベントに予約があるか確認
  const { data: customerReservation } = await serviceClient
    .from('reservations')
    .select('id, customers!inner(user_id)')
    .eq('schedule_event_id', data.scheduleEventId)
    .eq('customers.user_id', authResult.user.id)
    .maybeSingle()
  
  if (!customerReservation) {
    return errorResponse('このイベントへのアクセス権がありません', 403, corsHeaders)
  }
}
```

**ただし残る問題点**:
1. ✅ レートリミットあり（L51）
2. ✅ 認証チェックあり（L58-67）
3. ⚠️ **bookingUrl は入力値のまま**（L24, L271で使用）
4. ⚠️ **顧客（そのイベントに予約があれば）でも呼び出し可能**

**判定**: **部分的に対策済みだが、以下は残存**
- bookingUrl の入力値利用 → **フィッシングリスク残る**（P0維持）
- 顧客起動の許可 → **運用破壊リスク残る**（P1に格下げ検討）

**推奨修正**:
```typescript
// bookingUrl をサーバー側で生成
const { data: org } = await serviceClient
  .from('organizations')
  .select('slug')
  .eq('id', data.organizationId)
  .single()

const bookingUrl = `https://mmq-yoyaq.vercel.app/${org?.slug || 'queens-waltz'}`
// ↑ 入力値（data.bookingUrl）を無視
```

---

### ✅ SEC-P0-04: 貸切承認の非アトミック性 → **確定（危険）**

**証拠**:
```typescript
// src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts: L97-169

// ① reservations を UPDATE
const { error } = await supabase
  .from('reservations')
  .update({ status: 'confirmed', ... })
  .eq('id', requestId)

if (error) throw error

// ② schedule_events を INSERT
const { data: scheduleEvent, error: scheduleError } = await supabase
  .from('schedule_events')
  .insert({ ... })
  .select('id')
  .single()

if (scheduleError) {
  logger.error('スケジュール記録エラー:', scheduleError)
  // ↑ エラーでもロールバックされない！
}

// ③ reservations に schedule_event_id を UPDATE
if (scheduleEvent?.id) {
  const { error: linkError } = await supabase
    .from('reservations')
    .update({ schedule_event_id: scheduleEvent.id })
    .eq('id', requestId)
  // ↑ これも失敗する可能性
}
```

**問題点**:
1. ①②③が**別々のクエリ**（トランザクションで結合されていない）
2. ②失敗時に①がロールバックされない → 「confirmed だけど公演がない」状態
3. ③失敗時に「公演はあるが予約と紐付いていない」状態

**判定**: **P0確定 - トランザクション保証が必要**

---

## 追加発見事項

### 🚨 新規P0: reservationApi.updateParticipantCount の危険な設計

**発見箇所**: `src/lib/reservationApi.ts`: L296-363

**問題の流れ**:
```typescript
// ① RPC で人数変更（在庫ロック付き）
await reservationApi.updateParticipantsWithLock(
  reservationId,
  newCount,
  customerId
)

// ② その後、料金を直接UPDATE（在庫ロックなし）
const { error: updateError } = await supabase
  .from('reservations')
  .update({
    participant_count: newCount,    // ← RPCで既に更新済みのはず
    total_price: newTotalPrice,     // ← 料金だけ追加更新
    final_price: newTotalPrice,
    updated_at: new Date().toISOString()
  })
  .eq('id', reservationId)
```

**なぜ危険か**:
1. RPCで `participant_count` を更新した後、**再度 participant_count を UPDATE** している（二重更新）
2. 料金更新が**在庫ロックなし**で行われる
3. RPC と 直接UPDATE の間に他の操作が入ると不整合

**攻撃シナリオ**:
```typescript
// 攻撃者が自分の予約で以下を実行
await supabase.from('reservations').update({
  participant_count: 100,   // ← RPC を通さずに直接変更
  total_price: 1,           // ← 料金も改ざん
}).eq('id', '自分の予約ID')

// 結果:
// - current_participants が再計算される（トリガー）
// - 在庫が破壊される
// - 料金が1円になる
```

**判定**: **新規P0（SEC-P0-05）として追加**

---

### 🚨 新規P0: 日程変更が在庫ロックなし

**発見箇所**: `src/pages/MyPage/pages/ReservationsPage.tsx`: L634-650

```typescript
// ① 在庫ロックなしで schedule_event_id を変更
const { error } = await supabase
  .from('reservations')
  .update({
    schedule_event_id: selectedNewEventId,
    store_id: newEvent.store_id,
    requested_datetime: `${newEvent.date}T${newEvent.start_time}`
  })
  .eq('id', dateChangeTarget.id)

if (error) throw error

// ② 旧公演の参加者数を再計算
if (oldEventId) {
  await recalculateCurrentParticipants(oldEventId)
}
// ③ 新公演の参加者数を再計算
await recalculateCurrentParticipants(selectedNewEventId)
```

**問題点**:
1. ①②③が**非アトミック**
2. ①と②の間に旧イベントで新規予約が入ると、在庫計算が狂う
3. ②と③の間に新イベントが満席になると、オーバーブッキング

**攻撃/事故シナリオ**:
```
時刻 | 顧客A | 顧客B | DB状態
-----|-------|-------|-------
T0   | 日程変更開始（旧Event1→新Event2） | - | Event1: 5/8, Event2: 7/8
T1   | UPDATE完了（Event1→Event2に変更） | - | Event1: 5/8（在庫戻ってない）, Event2: 7/8（在庫増えてない）
T2   | - | Event2に新規予約（1名） | Event2: 8/8（満席）
T3   | recalc(Event1) → 4/8 | - | Event1: 4/8
T4   | recalc(Event2) → ??? | - | Event2: 9/8（オーバーブッキング）
```

**判定**: **新規P0（SEC-P0-06）として追加**

---

### ✅ SEC-P1-03: 監査証跡不足 → **確定（不足）**

**調査結果**:
```bash
# reservations の更新履歴テーブルを検索
find database/ supabase/ -name "*.sql" -exec grep -l "reservations_history\|reservation_history" {} \;
# → 見つからず
```

**確認**: `schedule_event_history` は存在するが、`reservations_history` は未実装

**判定**: **P1確定**

---

## 優先度の再判定

### P0（即死 / 確定）

| ID | 項目 | 状態 | 緊急度 |
|----|------|------|--------|
| SEC-P0-01 | reservations UPDATE許可 | **確定** | 🔴🔴🔴 |
| SEC-P0-02 | 料金/日時クライアント入力 | **要DB確認** | 🔴🔴 |
| SEC-P0-03 | notify-waitlist bookingURL | **部分対策済み** | 🟠 |
| SEC-P0-04 | 貸切承認非アトミック | **確定** | 🔴🔴 |
| **SEC-P0-05** | **updateParticipantCount二重更新** | **新規発見** | 🔴🔴🔴 |
| **SEC-P0-06** | **日程変更の在庫破壊** | **新規発見** | 🔴🔴🔴 |

### 修正の優先順序（更新）

#### 即座対応（今日中）

1. **RPC関数のシグネチャ確認**
   - 本番DBで `\df create_reservation_with_lock` を実行
   - 005/006 か 022 か確定
   - フロントとの整合性確認

2. **SEC-P0-01 の緊急対策**
   - `reservations_update_customer` ポリシーを一時無効化 or 列制限追加
   ```sql
   -- 緊急パッチ
   DROP POLICY IF EXISTS reservations_update_customer ON reservations;
   -- 顧客の直接UPDATE完全禁止（RPC経由のみ）
   ```

3. **SEC-P0-05/06 の緊急対策**
   - フロントの直接UPDATE削除
   - 日程変更機能を一時無効化

#### 1週間以内

4. **統合修正マイグレーション作成**
   - 026: RLS厳格化
   - 027: RPC料金検証（シグネチャ統一）
   - 028: 日程変更RPC化
   - 029: 貸切承認RPC化

---

## 今すぐ実施すべきアクション

### ステップ1: 現状確認（30分）

```bash
# 1. 本番DBのRPC関数シグネチャ確認
# Supabase Dashboard → SQL Editor
SELECT 
  proname,
  pronargs,
  array_to_string(proargnames, ', ') as parameters
FROM pg_proc 
WHERE proname LIKE '%reservation%lock%'
  AND pronamespace = 'public'::regnamespace;

# 2. 適用済みマイグレーション確認
SELECT version, name 
FROM supabase_migrations.schema_migrations 
ORDER BY version DESC 
LIMIT 30;

# 3. 現在のRLSポリシー確認
SELECT tablename, policyname, cmd
FROM pg_policies 
WHERE tablename = 'reservations'
ORDER BY policyname;
```

### ステップ2: 緊急パッチ適用判断（1時間）

**もし予約システムが現在正常動作しているなら**:
- 005/006が有効 = 料金改ざんリスクあり
- **緊急対応**: RLS厳格化マイグレーションを即座適用

**もし予約作成がエラーになっているなら**:
- 022が有効 = フロントが壊れている
- **緊急対応**: フロントのパラメータ修正 or 022ロールバック

### ステップ3: 修正計画の最終化（2時間）

調査結果を反映して修正計画を更新

---

## リスク評価（現時点）

### 最悪のシナリオ

**もし 025 + トリガー が有効な状態で放置すると**:

```typescript
// 悪意ある顧客が実行可能な攻撃
const myReservation = await supabase
  .from('reservations')
  .select('*')
  .eq('customer_id', myCustomerId)
  .single()

// 攻撃1: 料金を1円に
await supabase.from('reservations').update({
  total_price: 1,
  final_price: 1,
  unit_price: 1
}).eq('id', myReservation.id)

// 攻撃2: 定員を破壊
await supabase.from('reservations').update({
  participant_count: 1000
}).eq('id', myReservation.id)
// → トリガーで current_participants が再計算される
// → 在庫が破壊される

// 攻撃3: 別の公演に移動
await supabase.from('reservations').update({
  schedule_event_id: '別公演のID'
}).eq('id', myReservation.id)
// → 在庫が両方のイベントで不整合
```

**被害規模**:
- 1人の攻撃者で複数公演の在庫を破壊可能
- 料金改ざんで会計が壊れる
- 復旧に数時間〜数日

---

## 推奨アクション（優先順）

### 🚨 最優先（今日中）

1. **動作確認**
   - ステージング/本番で実際に予約作成を試行
   - エラーログ確認

2. **緊急パッチ検討**
   - `reservations_update_customer` ポリシーを無効化
   - または RLS を一時的に強化

### 📋 今週中

3. **統合マイグレーション作成**
4. **フロント修正**
5. **テスト実施**

---

**調査者**: AI Assistant  
**調査日時**: 2026-01-30  
**次のアクション**: 本番DB状態確認 → 緊急対応判断
