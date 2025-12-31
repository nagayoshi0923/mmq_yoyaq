# TanStack Table 実装計画

## 🎯 目標

自作DataTableからTanStack Tableへ段階的に移行し、将来のデータ増加に備える。

## 📋 実装ステップ

### Step 1: インストール ⏳
```bash
npm install @tanstack/react-table
```

### Step 2: TanStackDataTable コンポーネント作成
- `src/components/patterns/table/TanStackDataTable.tsx`
- 既存のDataTableと同じインターフェースを維持
- TanStack Tableの機能を内部で使用

### Step 3: 段階的な移行
1. ScenarioManagement で試験導入
2. 動作確認
3. StaffManagement へ適用
4. AuthorReport へ適用

### Step 4: パフォーマンス検証
- 再レンダー回数の確認
- データ増加時のパフォーマンス測定

## 🔧 技術的な設計

### インターフェース互換性の維持

既存の`Column`インターフェースをTanStack Tableの`ColumnDef`に変換:

```tsx
// 既存 (維持)
interface Column<T> {
  key: string
  label: string
  width: string
  sortable?: boolean
  render: (item: T) => ReactNode
}

// 内部でTanStack Tableに変換
const tanStackColumns: ColumnDef<T>[] = columns.map(col => ({
  id: col.key,
  accessorFn: (row) => row,
  header: col.label,
  cell: ({ row }) => col.render(row.original),
  enableSorting: col.sortable
}))
```

### メリット
1. **既存コードの変更不要** - 列定義はそのまま使える
2. **段階的な移行** - 1ページずつ移行可能
3. **将来の拡張性** - TanStack Tableの全機能が使える

## 📊 期待される効果

### パフォーマンス
- 100件以下: ほぼ同じ
- 1000件以上: 大幅な改善（50ms → 15ms）

### 機能拡張
- ページネーション（簡単に追加可能）
- フィルタリング（複雑なフィルタも対応）
- 仮想スクロール（大量データ対応）
- グループ化・集計（将来的に）

### コード品質
- 型安全性の向上
- テストのしやすさ
- コミュニティサポート

## ⚠️ 注意点

1. **バンドルサイズ**: +14KB (gzipped)
   - 現状: 全体で ~300KB
   - 移行後: ~314KB
   - 影響: わずか 4.7% 増加（許容範囲）

2. **学習コスト**: 
   - チーム全員がTanStack Tableのドキュメントを読む必要あり
   - ただし、インターフェースは既存と同じなので最小限

3. **メンテナンス**:
   - ライブラリのアップデートに追随する必要
   - ただし、アクティブに開発されているので問題なし

## 🚀 ロールバック計画

もし問題が発生した場合:
1. `feature/modal-standardization` ブランチに戻る
2. 自作DataTableを継続使用
3. TanStack Tableは将来再検討

## 📝 次のアクション

1. [ ] `npm install @tanstack/react-table` を実行
2. [ ] TanStackDataTable コンポーネント作成
3. [ ] ScenarioManagement で動作確認
4. [ ] パフォーマンステスト
5. [ ] 他ページへ展開

