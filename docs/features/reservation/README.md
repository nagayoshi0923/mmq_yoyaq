# 予約機能 詳細

**最終更新**: 2025-12-30

顧客が公開されている公演に予約を入れる機能。

---

## 1. 概要

### この機能が解決する課題

- 顧客がオンラインで公演を検索・予約したい
- 空き状況をリアルタイムで確認したい
- 予約確認メールを自動送信したい
- 会員登録なしでも予約できるようにしたい

### 予約の種類

| 種類 | 説明 | ページ |
|------|------|--------|
| **通常予約** | 公開公演への予約 | 本機能 |
| **貸切予約** | プライベート公演のリクエスト | [private-booking](../private-booking/) |

---

## 2. 画面構成

### 2.1 予約トップ（PublicBookingTop）

3つのビューを切り替え可能:

```
┌─────────────────────────────────────────────────────────────────────┐
│  予約サイト                                         [検索...]        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [ラインナップ] [カレンダー] [リスト]     店舗: [▼ 高田馬場店]      │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │   ■ ラインナップビュー                                          │ │
│  │     シナリオカード一覧（グリッド表示）                          │ │
│  │     - サムネイル                                                │ │
│  │     - タイトル                                                  │ │
│  │     - 参加人数                                                  │ │
│  │     - 料金                                                      │ │
│  │                                                                 │ │
│  │   ■ カレンダービュー                                            │ │
│  │     月間カレンダー + 各日の公演リスト                           │ │
│  │                                                                 │ │
│  │   ■ リストビュー                                                │ │
│  │     日付別・店舗別の公演一覧                                    │ │
│  │                                                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 シナリオ詳細（ScenarioDetailPage）

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  ┌─────────────────────┐  シナリオタイトル                          │
│  │                     │  ★★★★☆ (4.2)                             │
│  │    キービジュアル    │                                            │
│  │                     │  参加人数: 4〜6名                          │
│  └─────────────────────┘  所要時間: 約180分                         │
│                           参加費: ¥4,500〜                           │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  あらすじ                                                            │
│  Lorem ipsum dolor sit amet...                                       │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  開催スケジュール                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 1/15(水) 18:00〜 高田馬場店  残り3枠  [予約する]            │   │
│  │ 1/16(木) 14:00〜 別館①      残り5枠  [予約する]            │   │
│  │ 1/20(月) 18:00〜 神楽坂店    満席      [× 満席]            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [貸切予約はこちら]                                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 予約確認（BookingConfirmation）

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  予約確認                                                            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ シナリオ: 〇〇〇〇                                           │   │
│  │ 日時: 2025/01/15(水) 18:00〜21:00                           │   │
│  │ 店舗: 高田馬場店                                             │   │
│  │ 住所: 東京都新宿区...                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  参加人数: [−] 2 [+]                                                 │
│                                                                      │
│  お名前*: [________________]                                         │
│  メール*: [________________]                                         │
│  電話番号*: [________________]                                       │
│  備考: [________________]                                            │
│                                                                      │
│  参加費合計: ¥9,000                                                  │
│                                                                      │
│  [戻る]  [予約を確定する]                                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 処理フロー

```
┌─────────────────────────────────────────────────────────────────────┐
│                        予約フロー                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  【顧客】                                                            │
│    │                                                                 │
│    ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 1. 予約トップで公演を探す                                 │        │
│  │    - ラインナップ/カレンダー/リストで検索                 │        │
│  │    - 店舗フィルターで絞り込み                             │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 2. シナリオ詳細で公演を選択                               │        │
│  │    - 空き状況確認                                         │        │
│  │    - 「予約する」クリック                                 │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 3. 予約確認画面で情報入力                                 │        │
│  │    - 参加人数                                             │        │
│  │    - 連絡先情報                                           │        │
│  │    - 備考（任意）                                         │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 4. 予約確定                                               │        │
│  │    - reservationsテーブルに登録                           │        │
│  │    - customersテーブルに顧客情報登録/更新                 │        │
│  │    - schedule_events.current_participants更新             │        │
│  │    - 確認メール送信                                       │        │
│  └──────────────────────────┬──────────────────────────────┘        │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │ 5. 予約完了画面                                           │        │
│  │    - 予約番号表示                                         │        │
│  │    - 確認メール送信済み表示                               │        │
│  └─────────────────────────────────────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. データ構造

### 4.1 reservations テーブル

```typescript
interface Reservation {
  id: string
  organization_id: string           // マルチテナント識別
  reservation_number: string        // 予約番号（自動生成）
  reservation_source: 'web' | 'phone' | 'private_booking_request'
  
  // 公演情報
  schedule_event_id: string         // 対象公演
  scenario_id?: string
  scenario_title: string
  store_id: string
  store_name: string
  
  // 日時
  event_date: string                // 'YYYY-MM-DD'
  start_time: string                // 'HH:MM'
  end_time: string                  // 'HH:MM'
  
  // 顧客情報
  customer_id?: string              // customersテーブル参照
  customer_name: string
  customer_email: string
  customer_phone: string
  
  // 参加者
  participant_count: number
  
  // 料金
  participation_fee: number
  total_amount: number
  
  // 状態
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  
  notes?: string
  
  created_at: string
  updated_at: string
}
```

### 4.2 customers テーブル

```typescript
interface Customer {
  id: string
  organization_id: string
  
  name: string
  email: string
  phone?: string
  
  // 会員情報（ログインユーザーの場合）
  user_id?: string
  
  // 統計
  total_reservations?: number
  total_participations?: number
  
  created_at: string
  updated_at: string
}
```

### 4.3 schedule_events.current_participants

予約時に参加者数を加算:

```typescript
// 予約確定時
await supabase
  .from('schedule_events')
  .update({ 
    current_participants: currentParticipants + participantCount 
  })
  .eq('id', eventId)
```

---

## 5. 空き状況の計算

```typescript
const availableSeats = event.max_participants - event.current_participants

// 表示
if (availableSeats <= 0) {
  return <Badge variant="destructive">満席</Badge>
} else if (availableSeats <= 2) {
  return <Badge variant="warning">残り{availableSeats}枠</Badge>
} else {
  return <Badge>空きあり</Badge>
}
```

---

## 6. 関連ファイル

### ページ

| ファイル | 役割 |
|---------|------|
| `src/pages/PublicBookingTop/` | 予約トップ（3ビュー） |
| `src/pages/ScenarioDetailPage/` | シナリオ詳細 |
| `src/pages/BookingConfirmation/` | 予約確認・確定 |
| `src/pages/CustomerBookingPage.tsx` | ルーティング |

### PublicBookingTop のコンポーネント

| ファイル | 役割 |
|---------|------|
| `components/LineupView.tsx` | ラインナップビュー |
| `components/CalendarView.tsx` | カレンダービュー |
| `components/ListView.tsx` | リストビュー |
| `components/SearchBar.tsx` | 検索バー |

### フック

| ファイル | 役割 |
|---------|------|
| `hooks/useBookingData.ts` | 予約データ取得 |
| `hooks/useCalendarData.ts` | カレンダー用データ |
| `hooks/useListViewData.ts` | リスト用データ |
| `hooks/useBookingFilters.ts` | フィルター管理 |

### BookingConfirmation のフック

| ファイル | 役割 |
|---------|------|
| `hooks/useCustomerData.ts` | 顧客情報取得・保存 |
| `hooks/useBookingForm.ts` | フォーム状態管理 |
| `hooks/useBookingSubmit.ts` | 予約送信処理 |

### Edge Functions

| 関数 | 役割 |
|------|------|
| `send-booking-confirmation` | 予約確認メール |
| `send-booking-change-confirmation` | 予約変更メール |
| `send-cancellation-confirmation` | キャンセルメール |
| `send-reminder-emails` | リマインダーメール |

---

## 7. マルチテナント対応

### URLパス構造

```
/booking/{organization_slug}/           # 予約トップ
/booking/{organization_slug}/scenario/{id}  # シナリオ詳細
```

### データ分離

全てのクエリに `organization_id` を含める:

```typescript
const { data: scenarios } = await supabase
  .from('scenarios')
  .select('*')
  .eq('organization_id', organizationId)
  .eq('is_active', true)
```

---

## 8. 注意点

### 8.1 満席時の挙動

- 予約ボタンを無効化（disabled）
- 「満席」バッジを表示
- 予約確認画面でもサーバー側で再チェック

### 8.2 同時予約対策

サーバー側で楽観的ロックを使用:

```typescript
// 予約直前に再度空き確認
const { data: event } = await supabase
  .from('schedule_events')
  .select('current_participants, max_participants')
  .eq('id', eventId)
  .single()

if (event.current_participants + participantCount > event.max_participants) {
  throw new Error('申し訳ございません。満席になりました。')
}
```

### 8.3 顧客情報の再利用

ログインユーザーの場合:
1. `customers` テーブルから既存情報を取得
2. フォームに自動入力
3. 変更があれば更新

---

## 9. トラブルシューティング

### 予約完了メールが届かない

1. 顧客のメールアドレス確認
2. 迷惑メールフォルダ確認
3. Resend APIログ確認
4. Edge Functionログ確認

### 参加者数が反映されない

1. `schedule_events.current_participants` の値確認
2. RLSポリシー確認
3. リアルタイム更新が有効か確認

### 予約できない

1. 満席になっていないか確認
2. 公演が中止になっていないか確認
3. 予約受付が有効か確認（`is_reservation_enabled`）
4. コンソールエラー確認

---

## 10. 関連ドキュメント

- [private-booking/](../private-booking/) - 貸切予約機能
- [notifications/](../notifications/) - 通知機能
- [features/README.md](../README.md) - 機能概要一覧


