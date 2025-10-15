# UIコンポーネントガイド

プロジェクトで使用する主要なUIコンポーネントの一覧と使い分け。

## セレクトボックス系

### Select（標準）
**用途**: シンプルな選択（10個未満のオプション）

```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

<Select value={value} onValueChange={setValue}>
  <SelectTrigger>
    <SelectValue placeholder="選択してください" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">オプション1</SelectItem>
    <SelectItem value="option2">オプション2</SelectItem>
  </SelectContent>
</Select>
```

### SearchableSelect（検索可能） ⭐ おすすめ
**用途**: 多くのオプションから検索して選択（10個以上）

```tsx
import { SearchableSelect } from '@/components/ui/searchable-select'

<SearchableSelect
  options={[
    { value: '1', label: 'オプション1', displayInfo: '追加情報' },
    { value: '2', label: 'オプション2' }
  ]}
  value={value}
  onValueChange={setValue}
  searchPlaceholder="検索..."
/>
```

詳細: [README_SEARCHABLE_SELECT.md](./README_SEARCHABLE_SELECT.md)

### MultiSelect（複数選択）
**用途**: 複数の項目を選択

```tsx
import { MultiSelect } from '@/components/ui/multi-select'

<MultiSelect
  options={['オプション1', 'オプション2', 'オプション3']}
  selectedValues={selectedValues}
  onSelectionChange={setSelectedValues}
  placeholder="選択してください"
/>
```

## ダイアログ系

### Dialog（標準）
**用途**: 汎用ダイアログ

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>タイトル</DialogTitle>
    </DialogHeader>
    {/* コンテンツ */}
  </DialogContent>
</Dialog>
```

### AlertDialog（確認ダイアログ）
**用途**: 削除確認など重要な操作の確認

```tsx
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent } from '@/components/ui/alert-dialog'

<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
  <AlertDialogContent>
    <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
    <AlertDialogDescription>
      この操作は取り消せません。
    </AlertDialogDescription>
    <AlertDialogFooter>
      <AlertDialogCancel>キャンセル</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>削除</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## ツールチップ

### Tooltip（ホバー表示）
**用途**: 追加情報やヘルプテキストの表示

```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <span>ここにマウスを置く</span>
    </TooltipTrigger>
    <TooltipContent>
      <p>追加情報がここに表示されます</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**重要**: `TooltipProvider`はページ全体を1つでラップすること。

## バッジ

### Badge
**用途**: ステータス、タグ、ラベル表示

```tsx
import { Badge } from '@/components/ui/badge'

<Badge variant="default">デフォルト</Badge>
<Badge variant="outline">アウトライン</Badge>
<Badge variant="secondary">セカンダリ</Badge>
```

## ボタン

### Button
**用途**: あらゆるアクション

```tsx
import { Button } from '@/components/ui/button'

<Button variant="default">プライマリ</Button>
<Button variant="outline">アウトライン</Button>
<Button variant="ghost">ゴースト</Button>
<Button variant="destructive">削除</Button>
```

## フォーム要素

### Input
```tsx
import { Input } from '@/components/ui/input'

<Input 
  type="text" 
  placeholder="入力してください"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

### Textarea
```tsx
import { Textarea } from '@/components/ui/textarea'

<Textarea 
  placeholder="複数行入力"
  value={value}
  onChange={(e) => setValue(e.target.value)}
  rows={4}
/>
```

## カード

### Card
**用途**: コンテンツのグループ化

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>タイトル</CardTitle>
  </CardHeader>
  <CardContent>
    <p>コンテンツ</p>
  </CardContent>
</Card>
```

## コンポーネントの使い分け

### セレクトボックス

| オプション数 | 検索必要 | 複数選択 | 推奨コンポーネント |
|------------|---------|---------|------------------|
| < 10個 | なし | なし | **Select** |
| ≥ 10個 | あり | なし | **SearchableSelect** ⭐ |
| 任意 | なし | あり | **MultiSelect** |

### ダイアログ

| 用途 | 推奨コンポーネント |
|------|------------------|
| 一般的な入力・編集 | **Dialog** |
| 削除・重要な確認 | **AlertDialog** |

## パフォーマンスのヒント

- **大量のオプション**（100個以上）: 仮想スクロールを検討
- **複雑なrenderContent**: `React.memo`で最適化
- **頻繁な更新**: `useMemo`でオプションをメモ化

## スタイリングのヒント

- `className`で追加のスタイルを適用可能
- `style`属性でインラインスタイルも使用可能
- Tailwind CSSのユーティリティクラスを活用

## トラブルシューティング

### Tooltipが表示されない
→ `TooltipProvider`でページ全体をラップしているか確認

### SearchableSelectでスクロールできない
→ `scrollable-list`クラスが`index.css`に定義されているか確認

### MultiSelectでクリックできない
→ `overflow-y: scroll`が明示的に設定されているか確認

## 関連ファイル

- `/src/components/ui/select.tsx` - 標準Select
- `/src/components/ui/searchable-select.tsx` - 検索可能Select ⭐
- `/src/components/ui/multi-select.tsx` - 複数選択
- `/src/components/ui/dialog.tsx` - ダイアログ
- `/src/components/ui/alert-dialog.tsx` - 確認ダイアログ
- `/src/components/ui/tooltip.tsx` - ツールチップ

