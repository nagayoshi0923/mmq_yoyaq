# ScheduleManager リファクタリング計画

## 📊 現状
- **現在**: 463行（単一ファイル）
- **既に使用中のフック**: 6個（useScheduleData, useShiftData, useMemoManager, useScrollRestoration, useEventOperations, useContextMenuActions）
- **既に使用中のコンポーネント**: 9個
- **目標**: 200行以下
- **削減目標**: 57%（263行削減）

## 📐 現状分析

ScheduleManagerは既に適度にリファクタリングされていますが、さらに改善の余地があります：

### 既存の良い構造
✅ カスタムフック6個を使用
✅ コンポーネント9個に分離
✅ ユーティリティ関数を使用

### 改善ポイント
- まだindex.tsx内にロジックが残っている（463行）
- 状態管理が複雑（多数のuseState）
- カテゴリー関連の処理を抽出可能

## 🔄 実装手順

### Phase 1: 残存ロジックの抽出
1. [進行中] 分析と計画立案
2. [ ] `useCategoryFilter.ts` - カテゴリーフィルター管理
3. [ ] `useScheduleState.ts` - スケジュール状態統合管理

### Phase 2: クリーンアップ
1. [ ] 重複コードの削除
2. [ ] import文の整理
3. [ ] index.tsx の簡潔化

### Phase 3: 統合とテスト
1. [ ] 動作確認とバグ修正
2. [ ] リンターエラー解消とコミット

## 📝 抽出する主要機能

### カテゴリーフィルター（useCategoryFilter）
- `selectedCategory` - 選択中のカテゴリー
- `categoryFilter` - カテゴリーフィルターロジック

### スケジュール状態統合（useScheduleState）
- `currentDate` - 現在の日付
- `selectedStores` - 選択中の店舗
- `hiddenStores` - 非表示店舗
- localStorageとの連携

## 🎯 期待される効果

1. **可読性向上**: さらに明確な責務分離
2. **保守性向上**: 状態管理の一元化
3. **再利用性向上**: フックの汎用化
4. **テスト容易性**: 各機能を独立してテスト可能

## ⚠️ 注意事項

- 既存の6個のカスタムフックとの連携を維持
- CRITICAL機能（競合チェック）を保持
- 既存のコンポーネントとの互換性を保つ
- localStorageとの連携を維持


