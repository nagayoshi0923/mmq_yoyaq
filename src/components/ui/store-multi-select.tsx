import { memo, useState, useMemo, useRef, useEffect } from 'react'

// 都道府県の表示順序（47都道府県 + 未分類）
const REGION_ORDER = [
  // 北海道・東北
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  // 関東
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  // 中部
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県',
  // 近畿
  '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
  // 中国
  '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  // 四国
  '徳島県', '香川県', '愛媛県', '高知県',
  // 九州・沖縄
  '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
  // その他（旧データ互換）
  '東京', '埼玉', '神奈川', '千葉', 'その他',
  // 未分類
  '未分類'
]

interface Store {
  id: string
  name: string
  short_name?: string
  region?: string
}

interface StoreMultiSelectProps {
  stores: Store[]
  selectedStoreIds: string[]
  onStoreIdsChange: (storeIds: string[]) => void
  label?: string
  placeholder?: string
  hideLabel?: boolean
  emptyText?: string
  className?: string
}

/**
 * 店舗複数選択コンポーネント（折りたたみ式ドロップダウン、地域グループ化）
 * 
 * 使い方:
 * ```tsx
 * <StoreMultiSelect
 *   stores={stores}
 *   selectedStoreIds={selectedIds}
 *   onStoreIdsChange={setSelectedIds}
 *   label="公演可能店舗"
 *   placeholder="全店舗で公演可能"
 * />
 * ```
 */
export const StoreMultiSelect = memo(function StoreMultiSelect({
  stores,
  selectedStoreIds,
  onStoreIdsChange,
  label = '店舗を選択',
  placeholder = '全店舗',
  hideLabel = false,
  emptyText = '未選択の場合は全店舗が対象です',
  className = ''
}: StoreMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 外側クリックで閉じる
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // 店舗を地域ごとにグループ化
  const storesByRegion = useMemo(() => {
    const grouped: Record<string, Store[]> = {}
    
    stores.forEach(store => {
      const region = store.region || '未分類'
      if (!grouped[region]) {
        grouped[region] = []
      }
      grouped[region].push(store)
    })
    
    const sortedRegions = Object.keys(grouped).sort((a, b) => {
      const indexA = REGION_ORDER.indexOf(a)
      const indexB = REGION_ORDER.indexOf(b)
      if (indexA === -1 && indexB === -1) return a.localeCompare(b)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
    
    return { grouped, sortedRegions }
  }, [stores])

  // 選択中の店舗の地域ごとの内訳を取得
  const selectedRegionSummary = useMemo(() => {
    if (selectedStoreIds.length === 0) return ''
    
    const counts: Record<string, number> = {}
    selectedStoreIds.forEach(id => {
      const store = stores.find(s => s.id === id)
      if (store) {
        const region = store.region || '未分類'
        counts[region] = (counts[region] || 0) + 1
      }
    })
    
    // REGION_ORDERに従ってソート
    const sortedRegions = Object.keys(counts).sort((a, b) => {
      const indexA = REGION_ORDER.indexOf(a)
      const indexB = REGION_ORDER.indexOf(b)
      if (indexA === -1 && indexB === -1) return a.localeCompare(b)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })
    
    return sortedRegions.map(r => `${r}${counts[r]}`).join('/')
  }, [selectedStoreIds, stores])

  // 地域一括選択
  const handleSelectRegion = (region: string) => {
    const regionStores = storesByRegion.grouped[region] || []
    const regionStoreIds = regionStores.map(s => s.id)
    const allSelected = regionStoreIds.every(id => selectedStoreIds.includes(id))
    
    if (allSelected) {
      onStoreIdsChange(selectedStoreIds.filter(id => !regionStoreIds.includes(id)))
    } else {
      const newIds = [...new Set([...selectedStoreIds, ...regionStoreIds])]
      onStoreIdsChange(newIds)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {!hideLabel && (
        <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
          {label}
          {emptyText && (
            <span className="text-xs font-normal ml-2 text-gray-500">
              （{emptyText}）
            </span>
          )}
        </label>
      )}
      
      {/* ドロップダウントリガー - MultiSelectのButtonと完全に同じスタイル */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-between w-full h-8 px-3 text-xs font-normal bg-white border border-input rounded-md shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="truncate">
          {selectedStoreIds.length === 0 
            ? placeholder 
            : `${selectedStoreIds.length}店舗`}
        </span>
        <svg className="ml-1 h-3 w-3 shrink-0 opacity-50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
      
      {/* 展開時のチェックリスト */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 border border-t-0 max-h-[200px] overflow-y-auto bg-white shadow-lg">
          {storesByRegion.sortedRegions.map((region, regionIndex) => {
            const regionStores = storesByRegion.grouped[region] || []
            const selectedCount = regionStores.filter(s => selectedStoreIds.includes(s.id)).length
            const isAllSelected = selectedCount === regionStores.length && regionStores.length > 0
            const isPartialSelected = selectedCount > 0 && selectedCount < regionStores.length
            
            return (
              <div key={region} className={regionIndex > 0 ? 'border-t' : ''}>
                {/* 地域ヘッダー（クリックで全選択/解除） */}
                <button
                  type="button"
                  onClick={() => handleSelectRegion(region)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  <span className={`w-4 h-4 border flex items-center justify-center text-xs ${
                    isAllSelected 
                      ? 'bg-primary border-primary text-white' 
                      : isPartialSelected
                      ? 'bg-red-200 border-red-400'
                      : 'border-gray-300'
                  }`}>
                    {isAllSelected && '✓'}
                    {isPartialSelected && '−'}
                  </span>
                  <span className="text-sm font-medium flex-1">{region}</span>
                  <span className="text-xs text-gray-500">
                    {selectedCount > 0 && `${selectedCount}/`}{regionStores.length}店舗
                  </span>
                </button>
                
                {/* 個別店舗 */}
                <div className="pl-4">
                  {regionStores.map((store) => {
                    const isSelected = selectedStoreIds.includes(store.id)
                    return (
                      <button
                        key={store.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            onStoreIdsChange(selectedStoreIds.filter(id => id !== store.id))
                          } else {
                            onStoreIdsChange([...selectedStoreIds, store.id])
                          }
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 transition-colors text-left"
                      >
                        <span className={`w-4 h-4 border flex items-center justify-center text-xs ${
                          isSelected 
                            ? 'bg-primary border-primary text-white' 
                            : 'border-gray-300'
                        }`}>
                          {isSelected && '✓'}
                        </span>
                        <span className="text-sm">{store.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          
          {/* クリアボタン（選択時のみ表示） */}
          {selectedStoreIds.length > 0 && (
            <div className="border-t p-2 flex justify-end">
              <button
                type="button"
                onClick={() => onStoreIdsChange([])}
                className="text-xs text-gray-500 hover:text-red-600"
              >
                選択をクリア
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

