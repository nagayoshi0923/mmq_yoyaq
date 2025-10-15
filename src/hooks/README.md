# カスタムフック

## usePageState

ページの状態（スクロール位置、フィルタ、検索条件など）を自動的に保存・復元するカスタムフックです。

### 機能

- ✅ スクロール位置の自動保存・復元
- ✅ フィルタや検索条件などの状態の自動保存・復元
- ✅ ローディング状態の管理
- ✅ ページ固有のキーで状態を分離
- ✅ sessionStorageを使用（タブを閉じるとクリア）
- ✅ 10秒以内のスクロール位置のみ復元（古いデータは無視）

### 基本的な使い方

```tsx
import { usePageState } from '@/hooks/usePageState'

function MyPage() {
  // ページ状態管理フックを初期化
  const { restoreState, saveState, setLoading, loading } = usePageState({
    pageKey: 'mypage', // ページを識別するユニークなキー
    scrollRestoration: true // スクロール位置の復元を有効化（デフォルト: true）
  })

  // 状態を復元して初期化
  const [searchTerm, setSearchTerm] = useState(() => 
    restoreState('searchTerm', '') // キー, デフォルト値
  )
  const [statusFilter, setStatusFilter] = useState(() => 
    restoreState('statusFilter', 'all')
  )

  // 状態が変更されたら自動保存
  useEffect(() => {
    saveState('searchTerm', searchTerm)
  }, [searchTerm, saveState])

  useEffect(() => {
    saveState('statusFilter', statusFilter)
  }, [statusFilter, saveState])

  // データ読み込み時にloadingを更新
  async function loadData() {
    setLoading(true)
    try {
      // データ取得処理
    } finally {
      setLoading(false)
    }
  }

  return (
    // JSX
  )
}
```

### 高度な使い方

#### オブジェクトや配列の保存

```tsx
const [selectedItems, setSelectedItems] = useState(() => 
  restoreState<string[]>('selectedItems', [])
)

useEffect(() => {
  saveState('selectedItems', selectedItems) // 自動的にJSON形式で保存
}, [selectedItems, saveState])
```

#### タブの状態保存

```tsx
const [activeTab, setActiveTab] = useState(() => 
  restoreState('activeTab', 'overview')
)

useEffect(() => {
  saveState('activeTab', activeTab)
}, [activeTab, saveState])
```

#### 日付範囲の保存

```tsx
const [dateRange, setDateRange] = useState(() => ({
  start: restoreState('dateRangeStart', ''),
  end: restoreState('dateRangeEnd', '')
}))

useEffect(() => {
  saveState('dateRangeStart', dateRange.start)
  saveState('dateRangeEnd', dateRange.end)
}, [dateRange, saveState])
```

### スクロール位置のみ復元する場合

スクロール位置だけを復元したい場合は、簡易版のフックを使用できます：

```tsx
import { useScrollRestoration } from '@/hooks/usePageState'

function MyPage() {
  const [loading, setLoading] = useState(true)
  
  // スクロール位置のみ自動復元
  useScrollRestoration('mypage', loading)

  return (
    // JSX
  )
}
```

### API

#### usePageState(options)

**オプション:**

- `pageKey: string` - ページを識別するユニークなキー（必須）
- `scrollRestoration?: boolean` - スクロール位置の復元を有効にするか（デフォルト: true）

**戻り値:**

- `restoreState<T>(key: string, defaultValue: T): T` - 保存された状態を復元
- `saveState(key: string, value: any): void` - 状態を保存
- `clearState(): void` - そのページの全ての状態をクリア
- `setLoading(loading: boolean): void` - ローディング状態を設定
- `loading: boolean` - 現在のローディング状態
- `initialLoadComplete: boolean` - 初期ロードが完了したかどうか

### 実装例

#### スタッフ管理ページ

```tsx
export function StaffManagement() {
  const { restoreState, saveState, setLoading, loading } = usePageState({
    pageKey: 'staff',
    scrollRestoration: true
  })

  const [staff, setStaff] = useState<Staff[]>([])
  const [searchTerm, setSearchTerm] = useState(() => restoreState('searchTerm', ''))
  const [statusFilter, setStatusFilter] = useState(() => restoreState('statusFilter', 'all'))

  useEffect(() => { saveState('searchTerm', searchTerm) }, [searchTerm, saveState])
  useEffect(() => { saveState('statusFilter', statusFilter) }, [statusFilter, saveState])

  async function loadStaff() {
    setLoading(true)
    try {
      const data = await staffApi.getAll()
      setStaff(data)
    } finally {
      setLoading(false)
    }
  }

  return (/* JSX */)
}
```

#### 売上管理ページ（タブ付き）

```tsx
export function SalesManagement() {
  const { restoreState, saveState } = usePageState({
    pageKey: 'sales',
    scrollRestoration: true
  })

  const [activeTab, setActiveTab] = useState(() => restoreState('activeTab', 'overview'))
  const [selectedPeriod, setSelectedPeriod] = useState(() => restoreState('period', 'thisMonth'))
  const [selectedStore, setSelectedStore] = useState(() => restoreState('store', 'all'))

  useEffect(() => { saveState('activeTab', activeTab) }, [activeTab, saveState])
  useEffect(() => { saveState('period', selectedPeriod) }, [selectedPeriod, saveState])
  useEffect(() => { saveState('store', selectedStore) }, [selectedStore, saveState])

  return (/* JSX */)
}
```

### 注意事項

1. **ページキーはユニークに**: 各ページで異なる`pageKey`を使用してください
2. **sessionStorageを使用**: ブラウザタブを閉じると状態はクリアされます
3. **10秒ルール**: 10秒以上前のスクロール位置は復元されません
4. **型安全性**: `restoreState<Type>()`で型を指定できます

### トラブルシューティング

#### スクロール位置が復元されない

- `setLoading(false)`を呼び出しているか確認
- ページのコンテンツが完全にロードされているか確認
- 10秒以内にページをリロードしているか確認

#### 状態が保存されない

- `saveState()`が正しく呼ばれているか確認
- `useEffect`の依存配列に`saveState`を含めているか確認

#### 複数のタブで状態が混在する

- 各ページで異なる`pageKey`を使用しているか確認

