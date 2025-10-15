# SearchableSelect - 検索可能なセレクトボックス

検索機能付きのドロップダウンコンポーネント。大量のオプションから素早く選択できます。

## 特徴

- ✅ **リアルタイム検索** - 入力するとすぐにフィルタリング
- ✅ **スクロール対応** - Mac対応のスムーズスクロール
- ✅ **カスタムレンダリング** - バッジや追加情報を表示可能
- ✅ **レスポンシブ** - 親要素の幅に自動調整
- ✅ **キーボード操作対応** - 矢印キーやEnterで選択可能

## 基本的な使い方

```tsx
import { SearchableSelect } from '@/components/ui/searchable-select'

<SearchableSelect
  options={[
    { value: '1', label: 'オプション1' },
    { value: '2', label: 'オプション2', displayInfo: '追加情報' },
    { value: '3', label: 'オプション3' }
  ]}
  value={selectedValue}
  onValueChange={setSelectedValue}
  placeholder="選択してください"
  searchPlaceholder="検索..."
/>
```

## 高度な使い方（カスタムレンダリング）

```tsx
<SearchableSelect
  options={items.map(item => ({
    value: item.id,
    label: item.name,
    displayInfo: `${item.duration}分 | ${item.count}人`,
    renderContent: () => (
      <div className="flex items-center gap-2">
        <span>{item.name}</span>
        <span className="text-xs text-muted-foreground">
          {item.duration}分
        </span>
        <Badge variant="outline">{item.category}</Badge>
      </div>
    )
  }))}
  value={selectedValue}
  onValueChange={setSelectedValue}
/>
```

## プロパティ

| プロパティ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `options` | `SearchableSelectOption[]` | ✅ | - | 選択肢の配列 |
| `value` | `string` | ✅ | - | 現在選択されている値 |
| `onValueChange` | `(value: string) => void` | ✅ | - | 選択時のコールバック |
| `placeholder` | `string` | ❌ | "選択してください" | 未選択時の表示 |
| `searchPlaceholder` | `string` | ❌ | "検索..." | 検索ボックスのプレースホルダー |
| `className` | `string` | ❌ | "" | 追加のCSSクラス |
| `disabled` | `boolean` | ❌ | false | 無効化 |

## SearchableSelectOption 型

```typescript
interface SearchableSelectOption {
  value: string              // 実際の値（IDなど）
  label: string              // 表示名（検索対象）
  displayInfo?: string       // 追加情報（検索対象）
  renderContent?: () => React.ReactNode  // カスタム表示
}
```

## 検索の動作

検索は以下のフィールドを対象にします：
- `label` - メインのラベル
- `displayInfo` - 追加情報

大文字小文字は区別しません（`toLowerCase()`で比較）。

## 使用例

### 1. シンプルなセレクト

```tsx
const [color, setColor] = useState('')

<SearchableSelect
  options={[
    { value: 'red', label: '赤' },
    { value: 'blue', label: '青' },
    { value: 'green', label: '緑' }
  ]}
  value={color}
  onValueChange={setColor}
/>
```

### 2. 追加情報付き

```tsx
<SearchableSelect
  options={users.map(user => ({
    value: user.id,
    label: user.name,
    displayInfo: user.email
  }))}
  value={selectedUserId}
  onValueChange={setSelectedUserId}
  searchPlaceholder="名前またはメールで検索..."
/>
```

### 3. カスタムレンダリング（シナリオ選択）

```tsx
<SearchableSelect
  options={scenarios.map(scenario => ({
    value: scenario.title,
    label: scenario.title,
    renderContent: () => (
      <div className="flex items-center gap-2">
        <span>{scenario.title}</span>
        <span className="text-xs text-muted-foreground">
          {scenario.duration / 60}h | {scenario.player_count}人
        </span>
        <div className="flex gap-1">
          {scenario.availableGMs.map(gm => (
            <Badge key={gm} className="text-[10px]">{gm}</Badge>
          ))}
        </div>
      </div>
    )
  }))}
  value={selectedScenario}
  onValueChange={setSelectedScenario}
/>
```

## スタイリング

- デフォルトで親要素の幅に合わせます（`w-full`）
- ドロップダウンの幅はトリガーボタンと同じ幅に固定
- 最大高さ400pxでスクロール可能
- スクロールバーは常に表示（Mac対応）

## 通常のSelectとの比較

| 機能 | Select | SearchableSelect |
|------|--------|------------------|
| 検索 | ❌ | ✅ |
| スクロール | ❌（小さいリスト）| ✅（大きいリスト） |
| カスタムレンダリング | ⚠️ 制限あり | ✅ 完全対応 |
| パフォーマンス | 🟢 高速 | 🟡 中速 |
| 推奨用途 | 少ないオプション | 多いオプション |

## いつ使うべきか

**SearchableSelectを使う：**
- ✅ オプションが10個以上
- ✅ 検索が必要
- ✅ カスタム表示が必要（バッジ、アイコンなど）

**通常のSelectを使う：**
- ✅ オプションが10個未満
- ✅ シンプルな選択のみ
- ✅ パフォーマンスが重要

## 注意事項

- `renderContent`を使う場合、`label`は検索用として残す必要があります
- 検索は日本語にも対応していますが、英語より若干遅い場合があります
- 大量のオプション（100個以上）の場合、仮想スクロールの実装を検討してください

