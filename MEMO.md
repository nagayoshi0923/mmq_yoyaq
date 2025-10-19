# 🚀 Queens Waltz プロジェクト - リファクタリング進行状況

**最終更新**: 2025-01-19
**現在のフェーズ**: Phase 1 - 大規模ファイルのリファクタリング

---

## 📊 リファクタリング完了状況

### ✅ 完了済み（2025-01-19）

| ページ名 | Before | After | 削減率 | ファイル数 |
|---------|--------|-------|--------|-----------|
| **ScenarioDetailPage** | 1,092行 | 311行 | **71.5%↓** | 15ファイル |
| **PrivateBookingManagement** | 1,479行 | 455行 | **69.2%↓** | 13ファイル |
| **ReservationManagement** | 545行 | 296行 | **45.7%↓** | 1フック追加 |

**合計削減**: 2,089行削減（67.0%削減）

---

## 🎯 現在のターゲット: StaffManagement

### 📈 目標と結果
- **Before**: 1,224行
- **After**: 462行
- **削減率**: **62.3%削減** (762行削減)
- **ステータス**: ✅ リファクタリング完了

### 📐 分割計画

```
StaffManagement/
├── index.tsx (250行) ← メインコンポーネント
├── hooks/
│   ├── useStaffData.ts (既存)
│   ├── useStaffOperations.ts (200行) ← CRUD操作
│   ├── useStaffFilters.ts (80行) ← フィルタリング
│   ├── useStoresAndScenarios.ts (100行) ← 店舗・シナリオ
│   ├── useStaffInvitation.ts (180行) ← 招待・紐付け
│   └── useStaffModals.ts (60行) ← モーダル状態
├── components/
│   ├── StaffCard.tsx (100行) ← カード表示
│   ├── StaffList.tsx (80行) ← リスト表示
│   ├── StaffFilters.tsx (60行) ← フィルタUI
│   ├── StaffInviteModal.tsx (100行) ← 招待モーダル
│   ├── StaffLinkModal.tsx (120行) ← 紐付けモーダル
│   └── DeleteStaffDialog.tsx (50行) ← 削除確認
└── utils/
    └── staffFormatters.tsx (既存)
```

### 🔄 実装手順（Phase順）

#### Phase 1: フック分離（優先度: 高）✅ **完了！**
- [x] `useStaffData.ts`（既存確認）
- [x] `useStaffOperations.ts` - CRUD操作 ✅ **完了 (161行)**
- [x] `useStaffFilters.ts` - フィルタリング ✅ **完了 (61行)**
- [x] `useStoresAndScenarios.ts` - 店舗・シナリオ管理 ✅ **完了 (97行)**

#### Phase 2: モーダル分離（優先度: 中）✅ **完了！**
- [x] `useStaffModals.ts` - モーダル状態 ✅ **完了 (126行)**
- [x] `useStaffInvitation.ts` - 招待ロジック ✅ **完了 (157行)**

#### Phase 3: コンポーネント分離（優先度: 中）✅ **完了！**
- [x] `StaffCard.tsx` - カード表示 ✅ **完了 (264行)**
- [x] `StaffList.tsx` - リスト表示 ✅ **完了 (71行)**
- [x] `StaffFilters.tsx` - フィルタUI ✅ **完了 (78行)**

#### Phase 4: モーダルコンポーネント（優先度: 低）⏭️ **スキップ**
- [~] `StaffInviteModal.tsx` - 既存コードをそのまま使用（動作中のため）
- [~] `StaffLinkModal.tsx` - 既存コードをそのまま使用（動作中のため）
- [~] `DeleteStaffDialog.tsx` - 既存コードをそのまま使用（動作中のため）

#### Phase 5: 統合とテスト✅ **完了！**
- [x] `index.tsx` のクリーンアップ ✅ **完了 (462行)**
- [x] 動作確認とバグ修正 ✅ **完了**
- [x] 最終コミット ✅ **完了**

---

## 🎊 StaffManagement リファクタリング完了！

### 📊 最終成果
| 項目 | Before | After | 削減率 |
|------|--------|-------|--------|
| **メインファイル** | 1,224行 | 462行 | **62.3%↓** |
| **フック** | - | 728行 (5個) | 新規 |
| **コンポーネント** | - | 413行 (3個) | 新規 |
| **合計** | 1,224行 | 1,603行 | - |

### ✅ 達成項目
- ✅ UIとロジックの完全分離
- ✅ 再利用可能なフック作成
- ✅ コンポーネントの適切な分割
- ✅ React.memoで最適化
- ✅ リンターエラー: 0件
- ✅ 可読性・保守性の大幅向上

---

## 📋 次期リファクタリング候補

### 🔥 最優先（1,000行超）
1. **StaffManagement** (1,224行) ← **進行中**
2. **PublicBookingTop** (1,079行)
3. **GMAvailabilityCheck** (1,044行)

### ⚠️ 高優先（500〜999行）
4. **ShiftSubmission** (561行)
5. **BookingConfirmation** (546行)
6. **PrivateBookingRequest** (538行)

### 📊 中優先（400〜499行）
7. **AuthorReport** (492行)
8. **ScheduleManager** (463行)

---

## 🎨 リファクタリング方針

### 基本原則
1. **Single Responsibility**: 各ファイルは1つの責務のみ
2. **Separation of Concerns**: UIとロジックを完全分離
3. **DRY**: 重複コードをフックに集約
4. **React.memo**: 不要な再レンダリングを防止
5. **300行ルール**: メインファイルは300行以下を厳守

### フック分離の基準
- データ取得: `useXxxData`
- CRUD操作: `useXxxOperations`
- フィルタリング: `useXxxFilters`
- モーダル状態: `useXxxModals`
- 特定機能: `useXxxFeature`

### コンポーネント分離の基準
- カード表示: `XxxCard.tsx`
- リスト表示: `XxxList.tsx`
- フィルタUI: `XxxFilters.tsx`
- モーダル: `XxxModal.tsx`
- ダイアログ: `XxxDialog.tsx`

---

## 🐛 リファクタリング中の注意事項

### よくあるバグパターン
1. **Props名の不一致**: コンポーネントと呼び出し側で名前を統一
2. **配列型のフィルタ**: `.eq()` ではなく `.contains()` を使用
3. **カラム名の確認**: データベーススキーマを必ず確認
4. **モーダル表示**: z-indexの重なり順に注意
5. **依存配列**: useEffectの依存配列を正確に

### 確認手順
1. リンターエラーがないこと
2. 開発サーバーが起動すること
3. ブラウザでページが正常に表示されること
4. 全ての機能が動作すること
5. コンソールにエラーがないこと

---

## 📦 プロジェクト統計

### 全体
- **総ファイル数**: 153ファイル (.tsx/.ts)
- **総行数**: 30,788行
- **平均ファイルサイズ**: 約201行/ファイル

### ディレクトリ別ファイル数（Top 10）
1. `components/ui/` - 26ファイル
2. `pages/` - 14ファイル
3. `components/schedule/` - 13ファイル
4. `hooks/` - 11ファイル
5. `pages/ScenarioDetailPage/components/` - 10ファイル
6. `lib/` - 9ファイル
7. `pages/SalesManagement/components/` - 9ファイル
8. `pages/PrivateBookingManagement/components/` - 7ファイル
9. `pages/PrivateBookingManagement/hooks/` - 6ファイル

---

## 🎯 長期目標（3ヶ月）

### コード品質
- [ ] 全ページ500行以下に削減
- [ ] 全ページをモジュール化
- [ ] テストカバレッジ80%以上

### 開発環境
- [ ] Jest + React Testing Library導入
- [ ] E2Eテスト（Playwright）導入
- [ ] CI/CD整備

### ドキュメント
- [ ] API仕様書作成
- [ ] コンポーネントカタログ作成
- [ ] 型リファレンス整備

---

## 💡 Tips

### コミットメッセージ規則
```
feat: 新機能追加
fix: バグ修正
refactor: リファクタリング
docs: ドキュメント更新
style: コードフォーマット
test: テスト追加・修正
chore: ビルド・補助ツール変更
```

### リファクタリング時のコミット粒度
- フック1つ作成 = 1コミット
- コンポーネント1つ作成 = 1コミット
- index.tsx統合 = 1コミット
- バグ修正 = 1コミット

---

**🎉 リファクタリングで、コードベースの品質を向上させましょう！**
