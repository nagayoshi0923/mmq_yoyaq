# モバイル最適化 TODO

## 概要
MMQプロジェクトの全ページをモバイル対応（375px幅基準）にするためのタスクリストです。

## 進捗状況

### ✅ 完了
- [x] **PublicBookingTop**（予約サイトトップ）
- [x] **ScenarioDetailPage**（シナリオ詳細）
- [x] **BookingConfirmation**（予約確認）
- [x] **MyPage**（マイページ）
  - [x] ProfilePage（プロフィール）
  - [x] ReservationsPage（予約履歴）
  - [x] AlbumPage（アルバム）
  - [x] LikedScenariosPage（遊びたいシナリオ）

### 🚧 進行中
- [ ] **MyPage**（マイページ）
  - [ ] その他サブページの最終調整

### ✅ 完了
- [x] **PrivateBookingManagement**（貸切管理）
- [x] **ScenarioManagement**（シナリオ管理）
- [x] **StaffManagement**（スタッフ管理）
- [x] **SalesManagement**（売上管理）
- [x] **ScenarioEdit**（シナリオ編集）
- [x] **ScheduleManager**（スケジュール管理）
- [x] **AdminDashboard**（管理画面トップ）
- [x] **PerformanceModal**（公演編集ダイアログ）

### ⏳ 未着手（優先度順）

#### 🔥 優先度：高（よく使用される）
- [ ] **PrivateBookingRequest**（貸切リクエスト）- 顧客向け
  - 顧客が貸切予約をリクエストするページ
  - フォーム入力、候補日選択
  
- [ ] **GMAvailabilityCheck**（GM出勤確認）- GM向け
  - GMが出勤可否を回答するページ
  - リクエスト一覧、候補日選択、回答送信
  
- [ ] **ShiftSubmission**（シフト提出）- スタッフ向け
  - スタッフがシフトを提出するページ
  - 月間カレンダー形式のテーブル
  
- [ ] **ReservationManagement**（予約管理）- 管理者向け
  - 予約の一覧・編集・キャンセル
  - テーブル形式

#### 🔶 優先度：中（定期的に使用）
- [ ] **CustomerManagement**（顧客管理）- 管理者向け
  - 顧客情報の一覧・編集
  - 検索機能、予約履歴表示
  
- [ ] **AuthorReport**（作家レポート）- 管理者向け
  - 作家別の公演実績・ライセンス料レポート
  - テーブル形式、メール送信機能
  
- [ ] **StoreManagement**（店舗管理）- 管理者向け
  - 店舗情報の管理
  
- [ ] **UserManagement**（ユーザー管理）- 管理者向け
  - スタッフ・ユーザーアカウント管理

#### 🔵 優先度：低（たまに使用）
- [ ] **Settings**（設定）- 各種設定ページ
  - アプリケーション設定
  
- [ ] **ResetPassword/SetPassword**（パスワード設定）
  - パスワードリセット・初期設定
  
- [ ] **MyPage サブページ**（マイページ追加機能）
  - GmHistoryPage（GM履歴）
  - PlayedScenariosPage（プレイ済みシナリオ）
  - SettingsPage（個人設定）

## 実装方針

### グローバル設定
- **ブレークポイント**: `xs` (375px), `md` (768px), `xl` (1280px)
- **フォントサイズ**: `xs`, `sm`, `base`, `lg` の4種類
- **ページパディング**: 左右10px統一
- **基本フォントサイズ**: モバイル `base` (11px), PC `base` (18px)

### デザイン原則
- モバイルファーストで設計
- 375px幅で成り立つ設計
- 統一感のあるUI（文字サイズ、余白、ボタンサイズ）
- グローバル設定を優先的に使用

## 各ページの詳細

### PublicBookingTop（予約サイトトップ）
**状態**: ✅ 完了
**主な変更**:
- タブコンポーネントのモバイル対応
- シナリオカードのレスポンシブ対応
- グローバルフォントサイズ適用

### ScenarioDetailPage（シナリオ詳細）
**状態**: ✅ 完了
**主な変更**:
- タブコンポーネントのモバイル対応
- イベントリストのレイアウト調整
- 予約パネルのモバイル対応
- グローバルフォントサイズ適用

### BookingConfirmation（予約確認）
**状態**: ✅ 完了
**主な変更**:
- パディング統一（10px）
- フォントサイズ調整
- ボタンサイズ調整

### MyPage（マイページ）
**状態**: ✅ 完了
**主な変更**:
- ProfilePage: 顧客情報管理、パスワード変更機能追加
- ReservationsPage: 会場・住所表示、タイトル整形
- AlbumPage: プレイ履歴表示、いいねしたシナリオ表示
- LikedScenariosPage: 遊びたいシナリオ一覧

### PrivateBookingManagement（貸切管理）
**状態**: ⏳ 未着手
**優先度**: 中
**予想作業時間**: 2-3時間

### ScheduleManager（スケジュール管理）
**状態**: ⏳ 未着手
**優先度**: 低（PC準拠で置き換え）
**注意**: PCの見た目を基準にモバイル化

### ScenarioManagement（シナリオ管理）
**状態**: ⏳ 未着手
**優先度**: 中
**予想作業時間**: 2-3時間

### StaffManagement（スタッフ管理）
**状態**: ⏳ 未着手
**優先度**: 中
**予想作業時間**: 2-3時間

### SalesManagement（売上管理）
**状態**: ⏳ 未着手
**優先度**: 中
**予想作業時間**: 3-4時間

### ScenarioEdit（シナリオ編集）
**状態**: ⏳ 未着手
**優先度**: 中
**予想作業時間**: 2-3時間

### AdminDashboard（管理画面トップ）
**状態**: ⏳ 未着手
**優先度**: 低
**予想作業時間**: 1-2時間

## 実装時の注意事項

1. **グローバル設定の優先使用**
   - `tailwind.config.js`で定義されたグローバル設定を優先的に使用
   - 個別指定は最小限に

2. **統一感の維持**
   - 文字サイズ、余白、ボタンサイズの統一
   - 他のページとの整合性を保つ

3. **見た目の適正さ**
   - 文字サイズ同士のバランスを美しく
   - モバイルでも読みやすさを重視

4. **レスポンシブ対応**
   - 375px（xs）での表示を基準
   - 390px（sm）での調整も考慮
   - PC（xl以上）での見やすさも確保

## 次のステップ

優先度高のページから順に対応していきます：
1. PrivateBookingRequest（貸切リクエスト）
2. GMAvailabilityCheck（GM出勤確認）
3. ShiftSubmission（シフト提出）
4. ReservationManagement（予約管理）

## 更新履歴

- 2025-11-21: ドキュメント作成
- 2025-11-21: MyPage完了、AlbumPage改善
- 2025-11-21: PrivateBookingManagement完了（BookingRequestCard、CustomerInfo、CandidateDateSelector、ActionButtonsのモバイル対応）
- 2025-11-21: ScenarioManagement完了（テーブル列定義のレスポンシブ対応、フォントサイズ・アイコンサイズ調整、アクションボタン簡素化）
- 2025-11-21: StaffManagement完了（テーブル列定義のレスポンシブ対応、フォントサイズ・アイコンサイズ・ボタンサイズ調整）
- 2025-11-21: SalesManagement完了（既にモバイル対応済みを確認）
- 2025-11-21: ScenarioEdit完了（メインページ、BasicInfoSection、GameInfoSectionのモバイル対応）
- 2025-11-21: ScheduleManager完了（文字サイズ調整、アラートマーク表示改善、CategoryTabsモバイル対応）
- 2025-11-21: AdminDashboard完了（既にモバイル対応済みを確認）
- 2025-11-21: TanStackDataTable改善（テーブル最小幅設定、横スクロール対応）
- 2025-11-21: 未対応ページをリストアップ、優先度設定
- 2025-11-21: **PerformanceModal完全リファクタリング完了**
  - コード量: 1972行 → 470行（76%削減）
  - 型定義分離（types.ts）: ScheduleEvent, EventFormData, EmailContent, NewParticipant, ModalMode
  - ユーティリティ分離: timeOptions.ts, categoryColors.ts
  - コンポーネント分離: EmailPreview, PerformanceFormTab, ReservationsTab
  - カスタムフック作成: usePerformanceForm, useReservations
  - モバイル対応実装: すべてのコンポーネントでtext-xs/md:text-sm/xl:text-base等のレスポンシブクラス適用
  - ダイアログサイズ: max-w-[95vw] md:max-w-[90vw] xl:max-w-[1200px]
  - フォーム要素: すべてモバイル向けフォントサイズとスペーシング調整
  - 予約テーブル: モバイルでカード形式、PCでテーブル形式の2段階レイアウト

