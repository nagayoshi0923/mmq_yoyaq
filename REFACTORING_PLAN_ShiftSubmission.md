# ShiftSubmission リファクタリング計画

## 📊 現状
- **現在**: 561行（単一ファイル）
- **目標**: 250行以下
- **削減目標**: 55%（311行削減）

## 📐 分割計画

```
ShiftSubmission/
├── index.tsx (200行) ← メインコンポーネント
├── hooks/
│   ├── useShiftData.ts (120行) ← シフトデータ取得・管理
│   ├── useMonthNavigation.ts (50行) ← 月ナビゲーション
│   └── useShiftSubmit.ts (80行) ← シフト送信処理
├── components/
│   ├── MonthSelector.tsx (40行) ← 月選択UI
│   ├── ShiftTable.tsx (150行) ← シフト表
│   └── ShiftTableRow.tsx (60行) ← テーブル行
└── utils/
    └── shiftFormatters.ts (40行) ← フォーマット関数
```

## 🔄 実装手順

### Phase 1: フック分離
1. [ ] `useMonthNavigation.ts` - 月ナビゲーション
2. [ ] `useShiftData.ts` - シフトデータ取得・管理
3. [ ] `useShiftSubmit.ts` - シフト送信処理

### Phase 2: コンポーネント分離
1. [ ] `MonthSelector.tsx` - 月選択UI
2. [ ] `ShiftTableRow.tsx` - テーブル行
3. [ ] `ShiftTable.tsx` - シフト表（大規模）

### Phase 3: ユーティリティ
1. [ ] `shiftFormatters.ts` - 日付・曜日フォーマット

### Phase 4: 統合とテスト
1. [ ] `index.tsx` のクリーンアップ
2. [ ] 動作確認とバグ修正
3. [ ] リンターエラー解消とコミット

## 📝 抽出する主要機能

### 月ナビゲーション（useMonthNavigation）
- `currentDate` - 現在表示中の月
- `changeMonth()` - 月の前後移動
- `generateMonthDays()` - 月間の日付リスト生成

### シフトデータ管理（useShiftData）
- `shiftData` - シフトデータ
- `currentStaffId` - 現在のスタッフID
- `loadShiftData()` - シフトデータ読み込み
- `handleShiftChange()` - シフト変更
- `handleSelectAll()` - 全選択
- `handleDeselectAll()` - 全解除

### シフト送信（useShiftSubmit）
- `loading` - 送信中状態
- `handleSubmitShift()` - シフト送信処理

### コンポーネント（components）
- `MonthSelector` - 月選択ボタン
- `ShiftTable` - シフトテーブル全体
- `ShiftTableRow` - 各日付の行

### ユーティリティ（utils）
- `formatMonthYear()` - 月年フォーマット
- `getDayOfWeekColor()` - 曜日色
- `formatDate()` - 日付フォーマット

## 🎯 期待される効果

1. **可読性向上**: 各ファイルが明確な責務を持つ
2. **保守性向上**: 変更箇所を特定しやすくなる
3. **再利用性向上**: フック・コンポーネントが他で使える
4. **テスト容易性**: 各機能を独立してテスト可能

## ⚠️ 注意事項

- シフトデータの状態管理を慎重に
- チェックボックスの状態同期を正確に
- 全選択・全解除のロジックを保持
- 送信処理のエラーハンドリングを丁寧に

