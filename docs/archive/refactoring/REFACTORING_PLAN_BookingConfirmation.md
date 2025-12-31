# BookingConfirmation リファクタリング計画

## 📊 現状
- **現在**: 546行（単一ファイル）
- **目標**: 250行以下
- **削減目標**: 54%（296行削減）

## 📐 分割計画

```
BookingConfirmation/
├── index.tsx (200行) ← メインコンポーネント
├── hooks/
│   ├── useBookingForm.ts (100行) ← フォーム状態管理
│   ├── useBookingSubmit.ts (80行) ← 予約送信処理
│   └── useUserData.ts (50行) ← ユーザー情報取得
├── components/
│   ├── EventSummary.tsx (80行) ← イベント概要表示
│   ├── BookingForm.tsx (100行) ← 予約フォーム
│   └── SuccessMessage.tsx (40行) ← 成功メッセージ
└── utils/
    └── bookingFormatters.ts (30行) ← フォーマット関数
```

## 🔄 実装手順

### Phase 1: フック分離
1. [進行中] `useUserData.ts` - ユーザー情報取得
2. [ ] `useBookingForm.ts` - フォーム状態管理
3. [ ] `useBookingSubmit.ts` - 予約送信処理

### Phase 2: コンポーネント分離
1. [ ] `EventSummary.tsx` - イベント概要
2. [ ] `BookingForm.tsx` - 予約フォーム
3. [ ] `SuccessMessage.tsx` - 成功メッセージ

### Phase 3: ユーティリティ
1. [ ] `bookingFormatters.ts` - 日付・金額フォーマット

### Phase 4: 統合とテスト
1. [ ] `index.tsx` のクリーンアップ
2. [ ] 動作確認とバグ修正
3. [ ] リンターエラー解消とコミット

## 📝 抽出する主要機能

### ユーザーデータ（useUserData）
- `user` - 認証ユーザー
- `loadUserData()` - ユーザー情報の初期設定

### フォーム管理（useBookingForm）
- `participantCount` - 参加人数
- `customerName` - 氏名
- `customerEmail` - メールアドレス
- `customerPhone` - 電話番号
- `notes` - 備考
- フォームバリデーション

### 予約送信（useBookingSubmit）
- `isSubmitting` - 送信中状態
- `error` - エラー状態
- `success` - 成功状態
- `handleSubmit()` - 予約送信処理

### コンポーネント（components）
- `EventSummary` - イベント情報、料金表示
- `BookingForm` - 入力フォーム
- `SuccessMessage` - 予約完了画面

### ユーティリティ（utils）
- `formatDate()` - 日付フォーマット
- `formatPrice()` - 金額フォーマット
- `formatTime()` - 時刻フォーマット

## 🎯 期待される効果

1. **可読性向上**: 各ファイルが明確な責務を持つ
2. **保守性向上**: 変更箇所を特定しやすくなる
3. **再利用性向上**: フォームロジックが他で使える
4. **テスト容易性**: 各機能を独立してテスト可能

## ⚠️ 注意事項

- フォームバリデーションを保持
- エラーハンドリングを丁寧に
- 成功・失敗時の状態管理を正確に
- Propsの型定義を明確に

