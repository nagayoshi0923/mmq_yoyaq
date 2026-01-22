# マルチテナント対応不完全箇所リスト

> ✅ **2026-01-22 対応完了**: 以下の全問題を修正済み（コミット: 0b2c0aa9）

## 🚨 重大な問題（データ漏洩リスク）

### 1. scenarioApi.ts

#### `getPerformanceCount()` - organization_idフィルタ不足
**場所**: `src/lib/api/scenarioApi.ts:589-601`
**問題**: `schedule_events`テーブルから公演回数を取得する際、`organization_id`フィルタがない
```typescript
const { count, error } = await supabase
  .from('schedule_events')
  .select('*', { count: 'exact', head: true })
  .in('scenario_id', scenarioIds)
  .not('status', 'eq', 'cancelled')
// ❌ organization_idフィルタがない
```

#### `getScenarioStats()` - organization_idフィルタ不足
**場所**: `src/lib/api/scenarioApi.ts:606-915`
**問題**: 複数の`schedule_events`と`reservations`クエリで`organization_id`フィルタがない
- 行634-642: 公演回数取得
- 行645-653: 中止回数取得
- 行656-665: 初公演日取得
- 行671-678: 公演イベント取得
- 行689-694: 予約データ取得

#### `getAllScenarioStats()` - organization_idフィルタ不足
**場所**: `src/lib/api/scenarioApi.ts:800-815`
**問題**: `schedule_events`テーブルから全シナリオの統計を取得する際、`organization_id`フィルタがない

### 2. scheduleApi.ts

#### `addDemoParticipantsToAllActiveEvents()` - organization_idフィルタ不足
**場所**: `src/lib/api/scheduleApi.ts:896-1033`
**問題**: 全公演を取得する際、`organization_id`フィルタがない
```typescript
const { data: events, error: eventsError } = await supabase
  .from('schedule_events')
  .select('*')
  .eq('is_cancelled', false)
  .order('date', { ascending: true })
// ❌ organization_idフィルタがない
```

#### `getByMonth()` - reservationsクエリでorganization_idフィルタ不足
**場所**: `src/lib/api/scheduleApi.ts:346-360`
**問題**: 予約データ取得時に`organization_id`フィルタがない
```typescript
const { data: allReservations, error: reservationError } = await supabase
  .from('reservations')
  .select('schedule_event_id, participant_count, candidate_datetimes, reservation_source')
  .in('schedule_event_id', eventIds)
  .in('status', ['confirmed', 'pending', 'gm_confirmed'])
// ❌ organization_idフィルタがない（eventIdsは組織フィルタ済みだが、念のため追加すべき）
```

#### `getByScenarioId()` - reservationsクエリでorganization_idフィルタ不足
**場所**: `src/lib/api/scheduleApi.ts:611-616`
**問題**: 予約データ取得時に`organization_id`フィルタがない

### 3. salesApi.ts

#### `getSalesByPeriod()` - reservationsクエリでorganization_idフィルタ不足
**場所**: `src/lib/api/salesApi.ts:87-95`
**問題**: 予約データ取得時に`organization_id`フィルタがない
```typescript
const { data: reservations, error: reservationError } = await supabase
  .from('reservations')
  .select('participant_count, participant_names, payment_method, final_price')
  .eq('schedule_event_id', event.id)
  .in('status', ['confirmed', 'pending'])
// ❌ organization_idフィルタがない
```

### 4. staffApi.ts

#### `delete()` - schedule_eventsとreservationsクエリでorganization_idフィルタ不足
**場所**: `src/lib/api/staffApi.ts:202-229`
**問題**: スタッフ削除時に`schedule_events`と`reservations`からスタッフ名を削除する際、`organization_id`フィルタがない
```typescript
const { data: scheduleEvents, error: scheduleError } = await supabase
  .from('schedule_events')
  .select('id, gms')
  .contains('gms', [staffName])
// ❌ organization_idフィルタがない

const { data: reservations, error: resError } = await supabase
  .from('reservations')
  .select('id, assigned_staff, gm_staff')
  .or(`assigned_staff.cs.{${staffName}},gm_staff.eq.${staffName}`)
// ❌ organization_idフィルタがない
```

### 5. memoApi.ts

#### `getByMonth()` - organization_idフィルタ不足
**場所**: `src/lib/api/memoApi.ts:10-31`
**問題**: コメントで「organization_idカラムがない」と記載されているが、実際には`save()`で`organization_id`を設定している
```typescript
const { data, error } = await supabase
  .from('daily_memos')
  .select(`...`)
  .gte('date', startDate)
  .lte('date', endDate)
  .order('date', { ascending: true })
// ❌ organization_idフィルタがない（カラムが存在する場合は追加すべき）
```

#### `delete()` - organization_idフィルタ不足
**場所**: `src/lib/api/memoApi.ts:59-67`
**問題**: メモ削除時に`organization_id`フィルタがない

### 6. eventHistoryApi.ts

#### `getEventHistory()` - scheduleEventId指定時のorganization_idフィルタ不足
**場所**: `src/lib/api/eventHistoryApi.ts:226-243`
**問題**: 公演ID指定で履歴を取得する際、`organization_id`フィルタがない
```typescript
const { data: eventHistory, error: eventError } = await supabase
  .from('schedule_event_history')
  .select('*')
  .eq('schedule_event_id', scheduleEventId)
  .order('created_at', { ascending: false })
// ❌ organization_idフィルタがない（セル情報がある場合はフィルタされているが、ID指定時は不足）
```

### 7. customersテーブルアクセス

#### SettingsPage.tsx - organization_idフィルタ不足
**場所**: `src/pages/MyPage/pages/SettingsPage.tsx:93-101`
**問題**: 顧客情報取得時に`organization_id`フィルタがない（RLSで保護されている可能性はあるが、明示的に追加すべき）

#### LoginForm.tsx - organization_id設定不足
**場所**: `src/components/auth/LoginForm.tsx:240-264`
**問題**: 顧客登録時に`organization_id`を設定していない
```typescript
await supabase
  .from('customers')
  .upsert({
    user_id: signUpData.user.id,
    name: customerName.trim(),
    email: email,
    // ❌ organization_idが設定されていない
  }, { onConflict: 'email' })
```

#### useFavorites.ts - organization_id設定不足
**場所**: `src/hooks/useFavorites.ts:76-84`
**問題**: 顧客作成時に`organization_id`を設定していない

### 8. shiftApi.ts

#### `getByDate()` - organization_idフィルタ不足
**場所**: `src/lib/shiftApi.ts:74-88`
**問題**: 日付指定でシフトを取得する際、`organization_id`フィルタが条件付きでしか適用されていない
```typescript
let query = supabase
  .from('shift_submissions')
  .select('*')
  .eq('date', date)
  .eq('status', 'submitted')

if (orgId && staffIds.length > 0) {
  query = query.in('staff_id', staffIds)
}
// ❌ organization_idフィルタがない（staffIdsで間接的にフィルタされているが、明示的に追加すべき）
```

#### `upsert()` / `upsertMultiple()` - organization_id設定確認が必要
**場所**: `src/lib/shiftApi.ts:91-110`
**問題**: シフト作成時に`organization_id`が設定されているか確認が必要

## ⚠️ 中程度の問題（パフォーマンス・一貫性）

### 9. scheduleApi.ts

#### `getByMonth()` - 予約データ取得の最適化
**場所**: `src/lib/api/scheduleApi.ts:346-360`
**問題**: `eventIds`は組織フィルタ済みだが、予約データ取得時にも明示的に`organization_id`フィルタを追加すべき（多層防御）

### 10. scenarioApi.ts

#### `delete()` - 関連データ更新時のorganization_idフィルタ不足
**場所**: `src/lib/api/scenarioApi.ts:509-526`
**問題**: シナリオ削除時に`reservations`と`schedule_events`を更新する際、`organization_id`フィルタがない
```typescript
const { error: reservationError } = await supabase
  .from('reservations')
  .update({ scenario_id: null })
  .eq('scenario_id', id)
// ❌ organization_idフィルタがない（scenario_idで間接的にフィルタされているが、明示的に追加すべき）
```

## 📋 修正優先度

### P0（緊急）: データ漏洩リスク
1. scenarioApi.getPerformanceCount()
2. scenarioApi.getScenarioStats()
3. scenarioApi.getAllScenarioStats()
4. scheduleApi.addDemoParticipantsToAllActiveEvents()
5. staffApi.delete() - schedule_events/reservationsクエリ
6. customersテーブルへのINSERT時のorganization_id設定

### P1（高）: セキュリティ強化
7. salesApi.getSalesByPeriod() - reservationsクエリ
8. scheduleApi.getByMonth() - reservationsクエリ
9. scheduleApi.getByScenarioId() - reservationsクエリ
10. memoApi.getByMonth() / delete()
11. eventHistoryApi.getEventHistory()

### P2（中）: 一貫性・パフォーマンス
12. shiftApi.getByDate()
13. scenarioApi.delete() - 関連データ更新
14. その他の最適化

## 🔍 確認が必要なテーブル

以下のテーブルに`organization_id`カラムが存在するか確認が必要：
- `daily_memos` - memoApiで使用
- `shift_submissions` - shiftApiで使用
- `customers` - 複数箇所で使用

## 📝 修正パターン

### SELECTクエリの修正例
```typescript
// ❌ 修正前
const { data } = await supabase
  .from('schedule_events')
  .select('*')
  .eq('scenario_id', id)

// ✅ 修正後
const orgId = await getCurrentOrganizationId()
let query = supabase
  .from('schedule_events')
  .select('*')
  .eq('scenario_id', id)

if (orgId) {
  query = query.eq('organization_id', orgId)
}

const { data } = await query
```

### INSERT/UPSERTの修正例
```typescript
// ❌ 修正前
await supabase
  .from('customers')
  .insert({
    name: name,
    email: email
  })

// ✅ 修正後
const orgId = await getCurrentOrganizationId()
if (!orgId) {
  throw new Error('組織情報が取得できません')
}

await supabase
  .from('customers')
  .insert({
    name: name,
    email: email,
    organization_id: orgId
  })
```

### UPDATE/DELETEの修正例
```typescript
// ❌ 修正前
await supabase
  .from('schedule_events')
  .update({ gms: newGms })
  .eq('id', eventId)

// ✅ 修正後
const orgId = await getCurrentOrganizationId()
await supabase
  .from('schedule_events')
  .update({ gms: newGms })
  .eq('id', eventId)
  .eq('organization_id', orgId)
```

## 🎯 例外テーブル（organization_id不要）

以下のテーブルは`organization_id`フィルタが不要：
- `users` - 認証テーブル
- `organizations` - 組織テーブル自体
- `authors` - 共有マスタデータ
- `auth_logs` - システムログ

