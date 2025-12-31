# PrivateBookingRequest リファクタリング計画

## 📊 現状
- **現在**: 538行（単一ファイル）
- **目標**: 250行以下
- **削減目標**: 54%（288行削減）

## 📐 分割計画

```
PrivateBookingRequest/
├── index.tsx (220行) ← メインコンポーネント
├── hooks/
│   ├── useCustomerData.ts (60行) ← 顧客情報取得（BookingConfirmationと共通化可能）
│   ├── usePrivateBookingForm.ts (80行) ← フォーム状態管理
│   └── usePrivateBookingSubmit.ts (120行) ← 貸切予約送信処理
└── utils/
    └── privateBookingFormatters.ts (30行) ← フォーマット関数
```

## 🔄 実装手順

### Phase 1: フック分離
1. [進行中] `useCustomerData.ts` - 顧客情報取得（既存を再利用）
2. [ ] `usePrivateBookingForm.ts` - フォーム状態管理
3. [ ] `usePrivateBookingSubmit.ts` - 貸切予約送信処理

### Phase 2: ユーティリティ
1. [ ] `privateBookingFormatters.ts` - 日付・時刻フォーマット

### Phase 3: 統合とテスト
1. [ ] `index.tsx` のクリーンアップ
2. [ ] 動作確認とバグ修正
3. [ ] リンターエラー解消とコミット

## 📝 抽出する主要機能

### 顧客データ（useCustomerData）
- BookingConfirmation/hooks/useCustomerData.ts を再利用

### フォーム管理（usePrivateBookingForm）
- `customerName`, `customerEmail`, `customerPhone`, `notes`
- フォームバリデーション

### 貸切予約送信（usePrivateBookingSubmit）
- `isSubmitting` - 送信中状態
- `error` - エラー状態
- `success` - 成功状態
- `handleSubmit()` - 貸切予約リクエスト送信
- 候補日時・店舗の処理
- GM通知処理

### ユーティリティ（utils）
- `formatDate()` - 日付フォーマット
- `formatTime()` - 時刻フォーマット
- `formatTimeSlot()` - 時間帯フォーマット

## 🎯 期待される効果

1. **可読性向上**: 各ファイルが明確な責務を持つ
2. **保守性向上**: 変更箇所を特定しやすくなる
3. **再利用性向上**: BookingConfirmationとコード共有
4. **テスト容易性**: 各機能を独立してテスト可能

## ⚠️ 注意事項

- BookingConfirmationとの共通部分を最大限再利用
- 候補日時の配列処理を正確に
- GM通知ロジックを保持
- エラーハンドリングを丁寧に

