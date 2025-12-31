# GMAvailabilityCheck リファクタリング計画

## 📊 現状
- **現在**: 1,044行
- **目標**: 300行以下
- **削減目標**: 71%（744行削減）

## 📐 分割計画

```
GMAvailabilityCheck/
├── index.tsx (250行) ← メインコンポーネント
├── hooks/
│   ├── useGMRequests.ts (150行) ← リクエスト取得・管理
│   ├── useAvailabilityCheck.ts (100行) ← スケジュール競合チェック
│   └── useResponseSubmit.ts (80行) ← 回答送信処理
├── components/
│   ├── RequestCard.tsx (120行) ← リクエストカード
│   ├── CandidateSelector.tsx (80行) ← 候補日時選択
│   ├── NotesInput.tsx (40行) ← メモ入力
│   └── CalendarView.tsx (100行) ← カレンダー表示
└── utils/
    └── gmFormatters.ts (50行) ← フォーマット関数
```

## 🔄 実装手順

### Phase 1: フック分離
1. [進行中] `useGMRequests.ts` - リクエスト取得・状態管理
2. [ ] `useAvailabilityCheck.ts` - スケジュール競合チェック
3. [ ] `useResponseSubmit.ts` - 回答送信処理

### Phase 2: コンポーネント分離
1. [ ] `RequestCard.tsx` - リクエストカード表示
2. [ ] `CandidateSelector.tsx` - 候補日時選択UI
3. [ ] `NotesInput.tsx` - メモ入力
4. [ ] `CalendarView.tsx` - カレンダー表示（オプション）

### Phase 3: 統合とテスト
1. [ ] `index.tsx` のクリーンアップ
2. [ ] 動作確認とバグ修正
3. [ ] リンターエラー解消とコミット

## 📝 抽出する主要機能

### データ取得（useGMRequests）
- `loadGMRequests()` - GM向けリクエスト取得
- `loadStores()` - 店舗データ取得
- `requests` - リクエスト一覧
- `stores` - 店舗データ
- `activeTab` - タブ状態（pending/all）

### スケジュールチェック（useAvailabilityCheck）
- `checkCandidateAvailability()` - 候補日時の競合チェック
- `getTimeSlotFromCandidate()` - 時間帯変換
- `candidateAvailability` - 候補日時の可否状態

### 回答送信（useResponseSubmit）
- `handleSubmitResponse()` - 回答送信処理
- `submitting` - 送信中状態
- エラーハンドリング

### コンポーネント（components）
- `RequestCard` - リクエスト情報表示
- `CandidateSelector` - チェックボックスで候補選択
- `NotesInput` - テキストエリアでメモ入力
- `CalendarView` - カレンダー形式でリクエスト表示

## 🎯 期待される効果

1. **可読性向上**: 各ファイルが明確な責務を持つ
2. **保守性向上**: 変更箇所を特定しやすくなる
3. **再利用性向上**: フック・コンポーネントが他で使える
4. **テスト容易性**: 各機能を独立してテスト可能

## ⚠️ 注意事項

- GMの認証情報とユーザー情報の紐付けを慎重に
- スケジュール競合チェックのロジックを正確に
- 既存の機能を完全に保持
- エラーハンドリングを丁寧に

