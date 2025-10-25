# UnifiedSidebar 統一作業

## 完了したページ

- [x] StaffManagement
- [x] ScenarioManagement  
- [x] ScenarioEdit

## 残りのページ (7ページ)

各ページのサイドバーを`UnifiedSidebar`に置き換える手順:

1. import文を変更
2. メニュー項目を定義  
3. sidebar propsを更新

### 1. ScheduleManager
- `ScheduleSidebar` → `UnifiedSidebar`
- カレンダー表示、フィルタ、設定など

### 2. SalesManagement
- `SalesSidebar` → `UnifiedSidebar`  
- 売上一覧、統計、レポートなど

### 3. ReservationManagement
- `ReservationSidebar` → `UnifiedSidebar`
- 予約一覧、検索、ステータス管理など

### 4. GMAvailabilityCheck
- `GMSidebar` → `UnifiedSidebar`
- GM確認、承認、スケジュール

### 5. PrivateBookingManagement
- `PrivateBookingSidebar` → `UnifiedSidebar`
- 貸切確認、リクエスト管理

### 6. UserManagement
- `UserSidebar` → `UnifiedSidebar`
- ユーザー一覧、権限管理

### 7. CustomerManagement
- `CustomerSidebar` → `UnifiedSidebar`
- 顧客一覧、検索、履歴

### 8. ShiftSubmission
- `ShiftSidebar` → `UnifiedSidebar`
- シフト提出、履歴

### 9. Settings
- `SettingsSidebar` → `UnifiedSidebar`
- 一般設定、通知、データ管理

## 削除予定の古いサイドバーコンポーネント

- StaffSidebar.tsx
- ScenarioSidebar.tsx
- ScheduleSidebar.tsx
- SalesSidebar.tsx
- ReservationSidebar.tsx
- GMSidebar.tsx
- PrivateBookingSidebar.tsx
- UserSidebar.tsx
- CustomerSidebar.tsx
- ShiftSidebar.tsx
- SettingsSidebar.tsx

