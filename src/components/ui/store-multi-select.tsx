import { memo, useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  className?: string
}

/**
 * 店舗複数選択コンポーネント (Radix Popover ベース、地域グループ化)
 *
 * Popover.Portal で body 直下に render するため、 親要素の overflow:hidden
 * に影響されず、 画面端で自動的に位置調整される。 a11y / キーボード対応も
 * Radix 側に任せる。
 */
export const StoreMultiSelect = memo(function StoreMultiSelect({
  stores,
  selectedStoreIds,
  onStoreIdsChange,
  label = '店舗を選択',
  placeholder = '店舗を選択してください',
  hideLabel = false,
  className = ''
}: StoreMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)

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

  // 選択中ラベル
  const triggerLabel = useMemo(() => {
    const selectedStores = stores.filter(s => selectedStoreIds.includes(s.id))
    const validCount = selectedStores.length
    if (validCount === 0) return placeholder
    if (validCount <= 5) {
      return selectedStores.map(s => s.short_name || s.name).join(', ')
    }
    return `${validCount}店舗選択中`
  }, [stores, selectedStoreIds, placeholder])

  return (
    <div className={className}>
      {!hideLabel && (
        <div className="ts-label">{label}</div>
      )}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn("w-full justify-between font-normal bg-white")}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={4}
          collisionPadding={8}
          style={{ width: 'var(--radix-popover-trigger-width)', minWidth: 240, maxHeight: '60vh' }}
          className="p-0 overflow-y-auto z-[100] bg-white border border-gray-200 shadow-lg"
        >
          {storesByRegion.sortedRegions.length === 0 && (
            <div className="px-3 py-4 text-center ts-caption">
              店舗が登録されていません
            </div>
          )}

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
                  <span className={cn(
                    "w-4 h-4 border flex items-center justify-center text-xs",
                    isAllSelected ? 'bg-primary border-primary text-white'
                      : isPartialSelected ? 'bg-red-200 border-red-400'
                      : 'border-gray-300'
                  )}>
                    {isAllSelected && '✓'}
                    {isPartialSelected && '−'}
                  </span>
                  <span className="ts-body font-medium flex-1">{region}</span>
                  <span className="ts-caption">
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
                        <span className={cn(
                          "w-4 h-4 border flex items-center justify-center text-xs",
                          isSelected ? 'bg-primary border-primary text-white' : 'border-gray-300'
                        )}>
                          {isSelected && '✓'}
                        </span>
                        <span className="ts-body">{store.name}</span>
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
                className="ts-caption hover:text-red-600"
              >
                選択をクリア
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
})
