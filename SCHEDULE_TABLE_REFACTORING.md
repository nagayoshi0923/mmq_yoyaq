# ScheduleTable 汎用化リファクタリング

## 📋 概要

ScheduleTableコンポーネントを他のページでも再利用できるように汎用化しました。

### 変更前の問題点
- **17個のprops** → 使いづらい
- **ScheduleManager専用の実装** → 他のページで使えない
- **データ取得ロジックが分散** → 重複コードが発生しやすい

### 変更後の改善点
- **4つのグループ化されたprops** → 管理しやすい
- **共通フック（useScheduleTable）** → 簡単に再利用可能
- **モーダル管理フック（useScheduleTableModals）** → モーダルもセットで提供

---

## 🏗️ 新しいアーキテクチャ

### 1. ScheduleTable コンポーネント（汎用版）

**場所:** `src/components/schedule/ScheduleTable.tsx`

**変更内容:**
- 17個のpropsを4つのグループに整理
- コンポーネント自体はUIレンダリングに専念

```tsx
// 変更前
<ScheduleTable
  currentDate={...}
  monthDays={...}
  stores={...}
  // ... 残り14個のprops
/>

// 変更後
<ScheduleTable
  viewConfig={{...}}
  dataProvider={{...}}
  eventHandlers={{...}}
  displayConfig={{...}}
/>
```

#### Props構造

```tsx
export interface ScheduleTableProps {
  viewConfig: ScheduleTableViewConfig        // 表示設定
  dataProvider: ScheduleTableDataProvider    // データ提供
  eventHandlers: ScheduleTableEventHandlers  // イベント処理
  displayConfig: ScheduleTableDisplayConfig  // 表示スタイル
}
```

### 2. useScheduleTable フック（共通ロジック）

**場所:** `src/hooks/useScheduleTable.ts`

**機能:**
- スケジュールテーブルに必要な全てのデータと処理を提供
- カスタマイズ可能なオプション付き

```tsx
// 基本的な使い方
const scheduleTableProps = useScheduleTable({ currentDate })
return <ScheduleTable {...scheduleTableProps} />

// カスタマイズ
const scheduleTableProps = useScheduleTable({
  currentDate,
  customCategoryConfig: myConfig,
  customReservationBadgeClass: myClassFunc
})
```

### 3. useScheduleTableModals フック（モーダル管理）

**場所:** `src/hooks/useScheduleTable.ts`

**機能:**
- ScheduleTableと一緒に使うモーダル群の状態を管理
- PerformanceModal、ConflictWarningModal、ContextMenuなど

```tsx
const modals = useScheduleTableModals(currentDate)

return (
  <>
    <PerformanceModal {...modals.performanceModal} />
    <ConflictWarningModal {...modals.conflictWarning} />
    {/* その他のモーダル */}
  </>
)
```

---

## 📖 使用例

### ScheduleManagerページ（現在の実装）

```tsx
export function ScheduleManager() {
  const { currentDate } = useMonthNavigation()
  
  // スケジュールテーブル
  const scheduleTableProps = useScheduleTable({ currentDate })
  const modals = useScheduleTableModals(currentDate)
  
  return (
    <>
      <ScheduleTable {...scheduleTableProps} />
      <PerformanceModal {...modals.performanceModal} />
      {/* その他のモーダル */}
    </>
  )
}
```

### 他のページでの使用例

```tsx
// 予約管理ページでスケジュールを表示
export function ReservationManagementPage() {
  const { currentDate } = useMonthNavigation()
  const scheduleTableProps = useScheduleTable({ currentDate })
  
  // 予約管理ページ専用のカスタマイズ
  const customHandlers = {
    ...scheduleTableProps.eventHandlers,
    onEditPerformance: handleReservationEdit  // 独自処理
  }
  
  return (
    <ScheduleTable
      {...scheduleTableProps}
      eventHandlers={customHandlers}
    />
  )
}

// GM確認ページでスケジュールを表示
export function GMAvailabilityPage() {
  const { currentDate } = useMonthNavigation()
  const scheduleTableProps = useScheduleTable({ currentDate })
  
  // 読み取り専用にする
  const readOnlyHandlers = {
    ...scheduleTableProps.eventHandlers,
    onAddPerformance: () => {},  // 無効化
    onDeletePerformance: () => {}  // 無効化
  }
  
  return (
    <ScheduleTable
      {...scheduleTableProps}
      eventHandlers={readOnlyHandlers}
    />
  )
}
```

---

## 🔧 カスタマイズ可能な項目

### 1. 表示設定（viewConfig）
- `currentDate` - 表示する月
- `monthDays` - 月間の日付配列
- `stores` - 店舗リスト

### 2. データ提供（dataProvider）
- `getEventsForSlot` - イベント取得関数
- `shiftData` - シフトデータ
- `getMemo` - メモ取得関数
- `onSaveMemo` - メモ保存関数

### 3. イベントハンドラー（eventHandlers）
- `onAddPerformance` - 公演追加
- `onEditPerformance` - 公演編集
- `onDeletePerformance` - 公演削除
- `onCancelConfirm` - 公演中止
- `onUncancel` - 中止取消
- `onToggleReservation` - 予約公開切替
- `onDrop` - ドラッグ&ドロップ
- `onContextMenuCell` - セル右クリック
- `onContextMenuEvent` - イベント右クリック

### 4. 表示スタイル（displayConfig）
- `categoryConfig` - カテゴリー設定
- `getReservationBadgeClass` - 予約バッジのスタイル

---

## 📦 再利用可能なコンポーネント一覧

| コンポーネント | 再利用難易度 | 説明 |
|---|---|---|
| **ScheduleTable** | ⭐ 簡単 | 共通フックで簡単に使える |
| **PerformanceCard** | ⭐ 簡単 | 単独のイベント表示 |
| **TimeSlotCell** | ⭐⭐ 普通 | 時間枠セル（カスタマイズ可能） |
| **MemoCell** | ⭐ 簡単 | メモ入力セル |
| **EmptySlot** | ⭐ 簡単 | 公演追加ボタン |

---

## 🚀 将来の拡張

### 表示バリエーション（未実装）
今後必要になった場合、以下の機能を追加できます：

```tsx
// 週間ビュー
<ScheduleTable viewMode="weekly" {...props} />

// 日別ビュー
<ScheduleTable viewMode="daily" {...props} />

// リストビュー
<ScheduleTable viewMode="list" {...props} />
```

### 実装方法
1. `useScheduleTable`の`options`に`viewMode`を追加
2. `viewMode`に応じて`viewConfig`の内容を変更
3. ScheduleTableコンポーネント内でviewModeに応じたレンダリング

---

## ✅ メリット

### 開発者にとって
1. **簡単に使える** - `useScheduleTable`を呼ぶだけ
2. **カスタマイズしやすい** - propsをオーバーライドするだけ
3. **保守しやすい** - ロジックが一箇所に集約

### コードベースにとって
1. **重複コード削減** - 同じロジックを複数書かない
2. **一貫性** - 全ページで同じUIと動作
3. **テストしやすい** - 共通フックをテストすれば全体をカバー

---

## 📝 移行ガイド

### 既存のScheduleManagerページ
すでに移行済み。特別な対応は不要。

### 新しいページでの使用
1. `useScheduleTable`をインポート
2. `currentDate`を渡して呼び出し
3. 返されたpropsを`ScheduleTable`に渡す
4. 必要に応じてモーダルも追加

```tsx
import { useScheduleTable, useScheduleTableModals } from '@/hooks/useScheduleTable'
import { ScheduleTable } from '@/components/schedule/ScheduleTable'

function MyPage() {
  const scheduleTableProps = useScheduleTable({ currentDate })
  const modals = useScheduleTableModals(currentDate)
  
  return (
    <>
      <ScheduleTable {...scheduleTableProps} />
      <PerformanceModal {...modals.performanceModal} />
    </>
  )
}
```

---

## 🎉 まとめ

ScheduleTableが汎用化され、他のページでも簡単に使えるようになりました！

- ✅ Props が17個 → 4個にグループ化
- ✅ 共通フックで簡単に再利用可能
- ✅ カスタマイズも柔軟に対応
- ✅ 将来の拡張にも対応しやすい設計

**これで予約管理ページ、GM確認ページ、売上分析ページなど、どこでもスケジュールテーブルを使えます！** 🎊

