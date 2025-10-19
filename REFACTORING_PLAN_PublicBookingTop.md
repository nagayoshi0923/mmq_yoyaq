# PublicBookingTop リファクタリング計画

## 📊 現状
- **現在**: 1,079行
- **目標**: 300行以下
- **削減目標**: 72%（779行削減）

## 📐 分割計画

```
PublicBookingTop/
├── index.tsx (250行) ← メインコンポーネント
├── hooks/
│   ├── useBookingData.ts (150行) ← データ取得・状態管理
│   ├── useCalendarData.ts (100行) ← カレンダーロジック
│   └── useBookingFilters.ts (60行) ← フィルタリング
├── components/
│   ├── ScenarioCard.tsx (100行) ← シナリオカード
│   ├── CalendarView.tsx (150行) ← カレンダー表示
│   ├── ListView.tsx (120行) ← リスト表示
│   └── SearchBar.tsx (50行) ← 検索バー
└── utils/
    └── bookingFormatters.ts (50行) ← フォーマット関数
```

## 🔄 実装手順

### Phase 1: フック分離
1. [進行中] `useBookingData.ts` - データ取得・状態管理
2. [ ] `useCalendarData.ts` - カレンダーロジック
3. [ ] `useBookingFilters.ts` - フィルタリング

### Phase 2: コンポーネント分離
1. [ ] `ScenarioCard.tsx` - シナリオカード表示
2. [ ] `CalendarView.tsx` - カレンダー表示
3. [ ] `ListView.tsx` - リスト表示
4. [ ] `SearchBar.tsx` - 検索バー

### Phase 3: 統合とテスト
1. [ ] `index.tsx` のクリーンアップ
2. [ ] 動作確認とバグ修正
3. [ ] リンターエラー解消とコミット

## 📝 抽出する主要機能

### データ取得（useBookingData）
- `loadScenarios()` - シナリオ・公演・店舗データ取得
- `allEvents` - 全公演データ
- `scenarios` - シナリオカードデータ
- `stores` - 店舗データ

### カレンダーロジック（useCalendarData）
- `generateCalendarDays()` - カレンダーの日付生成
- `getEventsForDate()` - 特定日の公演取得
- `changeMonth()` - 月変更
- `currentMonth` - 現在の月

### フィルタリング（useBookingFilters）
- `getFilteredScenarios()` - 検索フィルタ
- `getNewScenarios()` - 新作フィルタ
- `getUpcomingScenarios()` - 直近公演フィルタ
- `getAllScenarios()` - 全シナリオ

### コンポーネント（components）
- `ScenarioCard` - シナリオカード表示（現在429-507行）
- `CalendarView` - カレンダー表示（現在567-772行）
- `ListView` - リスト表示（現在773-1048行）
- `SearchBar` - 検索バー（現在540-565行）

## 🎯 期待される効果

1. **可読性向上**: 各ファイルが明確な責務を持つ
2. **保守性向上**: 変更箇所を特定しやすくなる
3. **再利用性向上**: フック・コンポーネントが他で使える
4. **テスト容易性**: 各機能を独立してテスト可能
5. **パフォーマンス**: React.memoで最適化

## ⚠️ 注意事項

- 3つのタブ（lineup, calendar, list）の状態管理を慎重に
- URLハッシュとの連携を維持
- 既存の機能を完全に保持
- データ取得のタイミングを最適化

