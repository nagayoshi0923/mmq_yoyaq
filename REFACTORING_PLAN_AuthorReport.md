# AuthorReport リファクタリング計画

## 📊 現状
- **現在**: 492行（単一ファイル）
- **目標**: 250行以下
- **削減目標**: 49%（242行削減）

## 📐 分割計画

```
AuthorReport/
├── index.tsx (180行) ← メインコンポーネント
├── hooks/
│   ├── useAuthorReportData.ts (120行) ← データ取得・集計処理
│   └── useReportFilters.ts (40行) ← フィルタリング
├── components/
│   ├── ReportFilters.tsx (50行) ← 年月店舗フィルター
│   └── AuthorTable.tsx (80行) ← 作者別テーブル表示
└── utils/
    └── reportFormatters.ts (40行) ← レポートテキスト生成
```

## 🔄 実装手順

### Phase 1: ユーティリティ・フック分離
1. [進行中] `reportFormatters.ts` - レポートテキスト生成
2. [ ] `useAuthorReportData.ts` - データ取得・集計
3. [ ] `useReportFilters.ts` - フィルタリング

### Phase 2: コンポーネント分離
1. [ ] `ReportFilters.tsx` - フィルター UI
2. [ ] `AuthorTable.tsx` - テーブル表示

### Phase 3: 統合とテスト
1. [ ] `index.tsx` のクリーンアップ
2. [ ] 動作確認とバグ修正
3. [ ] リンターエラー解消とコミット

## 📝 抽出する主要機能

### データ取得・集計（useAuthorReportData）
- `loadAuthorReport()` - 売上データ取得と集計
- `monthlyData` - 月別作者データ
- `loading` - ローディング状態

### フィルタリング（useReportFilters）
- `filteredAuthors()` - 作者名検索フィルター
- `selectedYear`, `selectedMonth`, `selectedStore` - フィルター状態
- sessionStorageとの連携

### レポート生成（utils）
- `generateAuthorReportText()` - レポートテキスト生成
- `copyToClipboard()` - クリップボードコピー

### コンポーネント（components）
- `ReportFilters` - 年月店舗フィルター UI
- `AuthorTable` - 作者別集計テーブル

## 🎯 期待される効果

1. **可読性向上**: 各ファイルが明確な責務を持つ
2. **保守性向上**: 変更箇所を特定しやすくなる
3. **再利用性向上**: レポート生成ロジックを他で使える
4. **テスト容易性**: 各機能を独立してテスト可能

## ⚠️ 注意事項

- sessionStorageとの連携を維持
- レポートテキスト生成の正確性を保持
- 集計ロジックを正確に移行
- コピー機能を保持


