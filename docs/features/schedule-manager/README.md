# スケジュール管理機能 詳細

**最終更新**: 2025-12-30

公演スケジュールを月間カレンダー形式で管理する中核機能。

---

## 1. 概要

### この機能が解決する課題

- 複数店舗・複数シナリオの公演を一元管理したい
- ドラッグ&ドロップで直感的に公演を配置したい
- 重複登録を防ぎたい
- 公演の中止・復活を管理したい

### 主な機能

| 機能 | 説明 |
|------|------|
| 公演登録 | 新規公演をスケジュールに追加 |
| 公演編集 | 日時・店舗・GM等を変更 |
| 公演移動/複製 | ドラッグ&ドロップで移動・複製 |
| 公演中止/復活 | 公演を中止状態にして非表示化、または復活 |
| コピー&ペースト | 公演を別日時にペースト |
| 🚨 重複チェック | 同一枠への重複登録を警告 |

---

## 2. 画面構成

```
┌─────────────────────────────────────────────────────────────────────┐
│ スケジュール管理                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ ◀ 2025年1月 ▶                        [店舗フィルター] [表示]  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐ │
│  │     │高田馬場 │ 別館①  │ 別館②  │ 神楽坂  │ 中野    │ 門前仲町│ │
│  ├─────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤ │
│  │ 1   │ ┌─────┐ │         │         │ ┌─────┐ │         │         │ │
│  │ 水  │ │公演A │ │         │         │ │公演B │ │         │         │ │
│  │     │ └─────┘ │         │         │ └─────┘ │         │         │ │
│  │     │ ┌─────┐ │         │         │         │         │         │ │
│  │ 朝  │ │公演C │ │ [空枠]  │ [空枠]  │ [空枠]  │ [空枠]  │ [空枠]  │ │
│  │ 昼  │ └─────┘ │         │         │         │         │         │ │
│  │ 夜  │         │         │         │         │         │         │ │
│  ├─────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤ │
│  │ 2   │         │         │         │         │         │         │ │
│  │ 木  │ ...     │ ...     │ ...     │ ...     │ ...     │ ...     │ │
│  └─────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 表示形式

- **横軸**: 店舗（最大6店舗）
- **縦軸**: 日付
- **各セル**: 朝/昼/夜の3時間帯
- **公演カード**: シナリオ名、GM名、時間を表示

---

## 3. データ構造

### 3.1 schedule_events テーブル

```typescript
interface ScheduleEvent {
  id: string
  organization_id: string         // マルチテナント識別
  
  // 日時
  date: string                    // 'YYYY-MM-DD'
  start_time: string              // 'HH:MM'
  end_time: string                // 'HH:MM'
  time_slot?: string              // '朝' | '昼' | '夜'（保存された場合）
  
  // 店舗
  store_id: string
  venue: string                   // 店舗名（表示用）
  
  // シナリオ
  scenario_id?: string
  scenario: string                // シナリオ名
  category: string                // カテゴリ
  
  // GM
  gms: string[]                   // GM名の配列
  gm_roles?: Record<string, string>  // { "GM名": "役割" }
  
  // 参加者
  capacity: number
  max_participants?: number
  current_participants?: number
  
  // 状態
  is_cancelled: boolean           // 中止フラグ
  is_reservation_enabled: boolean // 予約受付可否
  is_private_request?: boolean    // 貸切リクエスト由来
  reservation_id?: string         // 紐づく予約ID
  
  notes?: string
  
  created_at: string
  updated_at: string
}
```

### 3.2 時間帯の定義

```typescript
const TIME_SLOT_DEFAULTS = {
  morning: { start_time: '10:00', end_time: '13:00' },
  afternoon: { start_time: '14:00', end_time: '17:00' },
  evening: { start_time: '18:00', end_time: '21:00' }
}

// start_time から時間帯を判定（time_slotが未保存の場合）
function getTimeSlot(startTime: string): 'morning' | 'afternoon' | 'evening' {
  const hour = parseInt(startTime.split(':')[0])
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
```

---

## 4. 🚨 重複チェック機能（CRITICAL）

### 4.1 概要

同じ「日付 + 店舗 + 時間帯」に複数の公演が登録されることを防ぐ。

### 4.2 チェックが行われるタイミング

| 操作 | チェック対象 |
|------|-------------|
| 新規公演登録 | 登録先の枠 |
| 公演編集 | 変更後の枠（自分自身は除外） |
| 公演移動 | 移動先の枠（自分自身は除外） |
| 公演複製 | 複製先の枠 |
| ペースト | ペースト先の枠 |

### 4.3 実装場所

**ファイル**: `src/hooks/useEventOperations.ts`

```typescript
// 🚨 CRITICAL: 重複チェック関数
const checkConflict = useCallback((
  date: string, 
  venue: string, 
  timeSlot: 'morning' | 'afternoon' | 'evening', 
  excludeEventId?: string
): ScheduleEvent | null => {
  const conflictingEvents = events.filter(event => {
    if (excludeEventId && event.id === excludeEventId) {
      return false
    }
    
    const eventTimeSlot = getEventTimeSlot(event)
    return event.date === date &&
           event.venue === venue &&
           eventTimeSlot === timeSlot &&
           !event.is_cancelled  // 中止公演は除外
  })
  
  return conflictingEvents.length > 0 ? conflictingEvents[0] : null
}, [events])
```

### 4.4 重複検出時の動作

1. **ConflictWarningModal** を表示
2. ユーザーに選択肢を提示:
   - 既存公演を削除して上書き
   - 操作をキャンセル

### 4.5 関連コンポーネント

```
src/components/schedule/modals/ConflictWarningModal.tsx
```

---

## 5. ドラッグ&ドロップ

### 5.1 操作フロー

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  1. 公演カードをドラッグ開始                                         │
│     │                                                                │
│     ▼                                                                │
│  2. 別の枠にドロップ                                                 │
│     │                                                                │
│     ▼                                                                │
│  3. ダイアログ表示: 「移動」or「複製」                              │
│     │                                                                │
│     ├─ 移動 ──→ 元の公演を削除 → 新位置に作成                       │
│     │            🚨 重複チェック                                     │
│     │                                                                │
│     └─ 複製 ──→ 元の公演を残す → 新位置に作成                       │
│                  🚨 重複チェック                                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 実装

```typescript
// ドラッグ開始
const handleDragStart = useCallback((event: ScheduleEvent) => {
  setDraggedEvent(event)
}, [])

// ドロップ
const handleDrop = useCallback((
  targetDate: string, 
  targetVenue: string, 
  targetTimeSlot: 'morning' | 'afternoon' | 'evening'
) => {
  setDropTarget({ date: targetDate, venue: targetVenue, timeSlot: targetTimeSlot })
  setIsMoveOrCopyDialogOpen(true)  // ダイアログ表示
}, [])
```

---

## 6. 公演の中止・復活

### 6.1 中止

- `is_cancelled = true` に設定
- カレンダー上で非表示（または取り消し線表示）
- 予約受付も自動で停止

### 6.2 復活

- `is_cancelled = false` に戻す
- カレンダー上に再表示
- 予約受付は手動で再開設定が必要

### 6.3 UI

```
公演カード右クリック → コンテキストメニュー
  - 編集
  - コピー
  - 中止 / 復活（状態に応じて）
  - 削除
```

---

## 7. 関連ファイル

### ページ・コンポーネント

| ファイル | 役割 |
|---------|------|
| `src/pages/ScheduleManager/index.tsx` | メインページ |
| `src/components/schedule/ScheduleTable.tsx` | カレンダーテーブル |
| `src/components/schedule/EventCard.tsx` | 公演カード |
| `src/components/schedule/SlotCell.tsx` | 枠セル |
| `src/components/schedule/modals/` | 各種モーダル |

### フック

| ファイル | 役割 |
|---------|------|
| `src/hooks/useEventOperations.ts` | 🚨 公演操作・重複チェック |
| `src/hooks/useScheduleTable.ts` | テーブル状態管理 |
| `src/pages/ScheduleManager/hooks/useScheduleEvents.ts` | イベント取得 |
| `src/pages/ScheduleManager/hooks/useMonthNavigation.ts` | 月移動 |
| `src/pages/ScheduleManager/hooks/useCategoryFilter.ts` | フィルター |

### API

| ファイル | 役割 |
|---------|------|
| `src/lib/api.ts` | scheduleApi（CRUD操作） |

---

## 8. 注意点

### 8.1 time_slot の二重判定

時間帯は以下の優先順位で判定:

1. **保存された `time_slot`** （朝/昼/夜）
2. **`start_time` から計算**

これにより、ユーザーが時間を変更しても枠の位置が変わらない。

### 8.2 マルチテナント対応

全てのクエリに `organization_id` を含める。RLSでも制御されているが、アプリ側でも明示的に指定。

### 8.3 中止公演の扱い

- 重複チェックでは中止公演を除外（中止枠に新規登録可能）
- 表示設定で中止公演の表示/非表示を切替可能

---

## 9. トラブルシューティング

### 公演が保存できない

1. 必須項目（日付、店舗、シナリオ、時間）が入力されているか確認
2. `organization_id` が取得できているか確認（ログインし直し）
3. RLSエラーでないか確認（Supabaseログ）

### 重複警告が出るのに重複が見えない

- 中止公演が存在している可能性
- フィルターで非表示になっている可能性
- ブラウザキャッシュをクリア

### ドラッグ&ドロップが動作しない

- ブラウザのドラッグ&ドロップAPIサポート確認
- コンソールエラー確認

---

## 10. 関連ドキュメント

- [critical-features.md](../../development/critical-features.md) - 重複チェックの詳細
- [features/README.md](../README.md) - 機能概要一覧


