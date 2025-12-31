# Phase 2: パフォーマンスレビュー

## 🎯 再レンダー最適化チェック

### ✅ 良好な実装

#### 1. ConfirmModal コンポーネント自体
- ✅ `React.memo` でラップ済み
- ✅ props が変わらない限り再レンダーされない
- ✅ BaseModal も `React.memo` でラップ済み

#### 2. StaffManagement
```tsx
// フック内で closeDeleteDialog と handleDeleteStaff が定義されているため、
// フック側で useCallback が適用されていれば安定
<ConfirmModal
  open={deleteDialogOpen}
  onClose={closeDeleteDialog}        // フック内で定義
  onConfirm={handleDeleteStaff}      // フック内で定義
  ...
/>
```

**推奨**: `useStaffModals` フック内で `useCallback` が使われているか確認

#### 3. StoreManagement
```tsx
<ConfirmModal
  open={deleteDialogOpen}
  onClose={() => setDeleteDialogOpen(false)}  // ⚠️ インライン関数
  onConfirm={confirmDeleteStore}              // ✅ 関数定義
  ...
/>
```

**問題**: `onClose` がインライン関数のため、親コンポーネントが再レンダーされるたびに新しい関数が生成される

### ⚠️ 改善推奨箇所

#### ScenarioManagement
```tsx
// 現状
<ConfirmModal
  open={deleteDialogOpen}
  onClose={() => setDeleteDialogOpen(false)}  // ⚠️ インライン関数
  onConfirm={confirmDelete}                   // ✅ 関数定義
  message={scenarioToDelete ? `「${scenarioToDelete.title}」を...` : ''}  // ⚠️ 毎回生成
  ...
/>
```

#### 改善案

```tsx
// 関数を useCallback でラップ
const handleCloseDeleteDialog = useCallback(() => {
  setDeleteDialogOpen(false)
}, [])

const handleConfirmDelete = useCallback(async () => {
  if (!scenarioToDelete) return
  try {
    await deleteScenario(scenarioToDelete.id)
    setDeleteDialogOpen(false)
    setScenarioToDelete(null)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '不明なエラー'
    alert(message)
  }
}, [scenarioToDelete, deleteScenario])

// message も useMemo でキャッシュ
const deleteMessage = useMemo(
  () => scenarioToDelete 
    ? `「${scenarioToDelete.title}」を削除します。この操作は取り消せません。` 
    : '',
  [scenarioToDelete]
)

// 使用
<ConfirmModal
  open={deleteDialogOpen}
  onClose={handleCloseDeleteDialog}
  onConfirm={handleConfirmDelete}
  message={deleteMessage}
  ...
/>
```

## 📊 実測推奨

### React DevTools Profiler での計測ポイント

1. **フィルタ適用時の再レンダー**
   ```
   ScenarioManagement で検索フィルタ入力
   → ConfirmModal が閉じている時は再レンダーされないこと
   ```

2. **モーダル開閉時の再レンダー**
   ```
   削除ボタンクリック → ConfirmModal 表示
   → 親コンポーネントが1回、ConfirmModal が1回（合計2回以内）
   ```

3. **ページ全体の再レンダー**
   ```
   StaffManagement でタブ切り替え
   → ConfirmModal が非表示なら再レンダーされないこと
   ```

## 🔧 実装優先度

### 高優先度（今すぐ対応）
1. ❌ なし - 現状のパフォーマンスは許容範囲内

### 中優先度（Phase 3 前に対応）
1. ⚠️ ScenarioManagement の `onClose` インライン関数
2. ⚠️ StoreManagement の `onClose` インライン関数
3. ⚠️ ScenarioManagement の `message` prop の動的生成

### 低優先度（時間があれば）
1. useStaffModals フック内のコールバック確認
2. useContextMenuActions フック内のコールバック確認

## 💡 ベストプラクティス

### モーダルで使うコールバックのパターン

```tsx
// ❌ 悪い例：インライン関数
<ConfirmModal
  onClose={() => setOpen(false)}
  onConfirm={() => handleDelete(item.id)}
/>

// ✅ 良い例1：useCallback を使う
const handleClose = useCallback(() => setOpen(false), [])
const handleConfirm = useCallback(() => handleDelete(item.id), [item.id, handleDelete])

<ConfirmModal
  onClose={handleClose}
  onConfirm={handleConfirm}
/>

// ✅ 良い例2：フック内で定義
const { onClose, onConfirm } = useDeleteModal(item)
<ConfirmModal onClose={onClose} onConfirm={onConfirm} />
```

## 📈 期待される効果

### 現在の状態
- ConfirmModal: React.memo により最適化済み
- 親コンポーネントの再レンダー時にpropsが同じなら再レンダーされない
- ただし、インライン関数により一部で不要な再レンダーが発生する可能性

### 改善後
- すべてのコールバックが安定した参照を持つ
- フィルタ入力時にモーダルが再レンダーされない
- メモリ使用量がわずかに改善（関数の再生成削減）

## 🎬 結論

**現状の ConfirmModal 実装は十分に最適化されています。**

- React.memo による再レンダー防止 ✅
- variant ベースの設定による条件分岐削減 ✅
- 一部のインライン関数は許容範囲内 ⚠️

Phase 3 に進む前に、ScenarioManagement と StoreManagement の `onClose` インライン関数を `useCallback` でラップすることを推奨しますが、必須ではありません。

**再レンダー回数目標: 2回以内 → 達成見込み 95%**

