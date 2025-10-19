# StaffManagement リファクタリング計画

## 📊 現状分析

**現在の行数**: 1,224行
**目標行数**: 300行以下
**削減目標**: 75%削減（924行削減）

---

## 🎯 分割方針

### 1. Custom Hooks（hooks/）

#### `useStaffOperations.ts`（既存を拡張）
- `loadStaff()`
- `handleSaveStaff()`
- `handleDeleteStaff()`
- スタッフのCRUD操作を集約

#### `useStaffFilters.ts`（新規）
- `searchTerm`, `statusFilter`
- `filteredStaff` のロジック
- フィルタリング処理

#### `useStoresAndScenarios.ts`（新規）
- `loadStores()`
- `loadScenarios()`
- `getScenarioName()`
- 店舗とシナリオデータ管理

#### `useStaffInvitation.ts`（新規）
- `handleInviteStaff()`
- `handleLinkExistingUser()`
- `handleLinkWithInvite()`
- 招待・紐付けロジック

#### `useStaffModals.ts`（新規）
- モーダルの開閉状態管理
- `isEditModalOpen`, `isInviteModalOpen`, `isLinkModalOpen`, `deleteDialogOpen`
- `editingStaff`, `linkingStaff`, `staffToDelete`

---

### 2. Components（components/）

#### `StaffCard.tsx`（新規）
- 個別スタッフカードのUI
- アバター、名前、ロール、ステータス
- 編集・削除ボタン
- 約100行

#### `StaffList.tsx`（新規）
- スタッフカードのグリッド表示
- ローディング状態
- 約80行

#### `StaffFilters.tsx`（新規）
- 検索バー
- ステータスフィルタ
- 約60行

#### `StaffInviteModal.tsx`（新規）
- 招待モーダルのUI
- フォーム処理
- 約100行

#### `StaffLinkModal.tsx`（新規）
- 紐付けモーダルのUI
- 既存ユーザー or 新規招待の切り替え
- 約120行

#### `DeleteStaffDialog.tsx`（新規）
- 削除確認ダイアログ
- 約50行

---

### 3. Utils（utils/）

#### `staffFormatters.tsx`（既存）
- `formatStaffAvailability()`
- `getAvailabilityBadgeVariant()`
- `getStatusBadge()`
- `getRoleBadges()`
- `getStoreColors()`

---

## 📐 想定ファイル構成

```
StaffManagement/
├── index.tsx                      (250行) ← メインコンポーネント
├── hooks/
│   ├── useStaffData.ts           (既存)
│   ├── useStaffOperations.ts     (200行) ← CRUD操作
│   ├── useStaffFilters.ts        (80行)  ← フィルタリング
│   ├── useStoresAndScenarios.ts  (100行) ← 店舗・シナリオ
│   ├── useStaffInvitation.ts     (180行) ← 招待・紐付け
│   └── useStaffModals.ts         (60行)  ← モーダル状態
├── components/
│   ├── StaffCard.tsx             (100行) ← カード表示
│   ├── StaffList.tsx             (80行)  ← リスト表示
│   ├── StaffFilters.tsx          (60行)  ← フィルタUI
│   ├── StaffInviteModal.tsx      (100行) ← 招待モーダル
│   ├── StaffLinkModal.tsx        (120行) ← 紐付けモーダル
│   └── DeleteStaffDialog.tsx     (50行)  ← 削除確認
└── utils/
    └── staffFormatters.tsx       (既存)
```

**総ファイル数**: 13ファイル
**推定総行数**: 約1,380行（モジュール化により若干増加するが可読性向上）
**メインファイル**: 250行（79.6%削減）

---

## 🔄 リファクタリング手順

### Phase 1: フック分離（優先度: 高）
1. ✅ `useStaffData.ts`（既存）
2. ⬜ `useStaffOperations.ts` - CRUD操作
3. ⬜ `useStaffFilters.ts` - フィルタリング
4. ⬜ `useStoresAndScenarios.ts` - 店舗・シナリオ管理

### Phase 2: モーダル分離（優先度: 中）
5. ⬜ `useStaffModals.ts` - モーダル状態
6. ⬜ `useStaffInvitation.ts` - 招待ロジック

### Phase 3: コンポーネント分離（優先度: 中）
7. ⬜ `StaffCard.tsx` - カード表示
8. ⬜ `StaffList.tsx` - リスト表示
9. ⬜ `StaffFilters.tsx` - フィルタUI

### Phase 4: モーダルコンポーネント（優先度: 低）
10. ⬜ `StaffInviteModal.tsx` - 招待モーダル
11. ⬜ `StaffLinkModal.tsx` - 紐付けモーダル
12. ⬜ `DeleteStaffDialog.tsx` - 削除確認

### Phase 5: 統合とテスト
13. ⬜ `index.tsx` のクリーンアップ
14. ⬜ 動作確認とバグ修正
15. ⬜ リンターエラー解消

---

## 🎨 設計原則

1. **Single Responsibility**: 各ファイルは1つの責務のみ
2. **Separation of Concerns**: UIとロジックを完全分離
3. **DRY**: 重複コードをフックに集約
4. **React Best Practices**: React.memoでパフォーマンス最適化

---

## 📈 期待される効果

### 可読性
- メインファイルが250行に削減
- 各モジュールが独立して理解可能

### 保守性
- 変更が局所化される
- テストが容易になる

### 再利用性
- フックは他のページでも使用可能
- コンポーネントの汎用性向上

### パフォーマンス
- React.memoで不要な再レンダリング防止
- コード分割によるバンドルサイズ最適化

---

**作成日**: 2025-01-19
**担当**: AI Assistant
**ステータス**: 計画中

