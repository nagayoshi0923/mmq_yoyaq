# セキュアコーディング・ガイドライン（予約/在庫/料金）

**作成日**: 2026-01-30  
**目的**: 同種のP0（RLS逸脱・在庫破壊・料金改ざん・URL注入）を“作れない”状態にする  

---

## 大原則

- **サーバーが真実**（クライアント入力は信用しない）
- **予約/在庫/料金に影響する更新はRPCでアトミックに**（直接UPDATEを禁止）
- **fail-closed**（エラー時は安全側に倒す）
- **マルチテナントは organization_id を必ず意識**（漏れは重大事故）

---

## 禁止事項（Must Not）

### 1) 予約/在庫/料金の“直接UPDATE/DELETE”

以下は禁止（例）:

```ts
// ❌ 禁止: 予約の重要列を直接UPDATE
await supabase.from('reservations').update({
  status: 'cancelled',
  participant_count: 999,
  schedule_event_id: '...',
  total_price: 1,
}).eq('id', reservationId)

// ❌ 禁止: 在庫（current_participants）を直接UPDATE
await supabase.from('schedule_events').update({
  current_participants: 999,
}).eq('id', eventId)
```

### 2) 複数DB操作をフロントで“非アトミック”に連結

以下は禁止（例）:

```ts
// ❌ 禁止: UPDATE → INSERT → UPDATE をフロントで順に実行（途中失敗で不整合）
await supabase.from('reservations').update({ status: 'confirmed' }).eq('id', id)
await supabase.from('schedule_events').insert({ ... })
await supabase.from('reservations').update({ schedule_event_id: newId }).eq('id', id)
```

---

## 必須事項（Must）

### 1) 予約/在庫/料金の更新は RPC（DB関数）で行う

- 人数変更: `update_reservation_participants` / `updateParticipantsWithLock`
- 日程変更: `change_reservation_schedule`
- 貸切承認: `approve_private_booking`（Phase 2で適用）
- 予約作成: `create_reservation_with_lock`（P0-02で“サーバー計算”に統一）

### 2) クライアント入力はサーバー側で検証・確定

- **料金**: DB側で再計算し、クライアント計算値は無視
- **日時**: schedule_events から確定し、クライアント指定は無視
- **URL（bookingUrl等）**: サーバー側で生成し、入力値は無視
- **organizationId**: 必須化し、必ず組織一致を検証

### 3) エラー時は fail-closed

- DB取得失敗・検証失敗・想定外エラー時は「許可」ではなく「拒否」に倒す
- 例: 予約制限チェック失敗時は予約処理を止め、再試行を促す

---

## レビュー観点（PRで必ず見る）

- **重要列の直接UPDATEがないか**（`reservations`/`schedule_events`/料金系）
- **複数DB操作がRPC化されているか**（トランザクション保証）
- **Edge Function の認可が適切か**（顧客に強い権限を与えていないか）
- **organization_id の設定/フィルタ漏れがないか**
- **エラー時に安全側（fail-closed）か**

---

## 既知の例外（Allowed / 要説明）

- 管理者用の“限定された”直接UPDATE（例: 管理画面でのメタ情報修正）  
  - **ただし**在庫/料金/状態遷移に影響する列は原則RPCへ寄せる  
  - 例外にする場合はPR本文に「なぜ安全か」を記載する

