import { MapPin } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Store {
  id: string
  name: string
  short_name?: string
}

interface StoreSelectorProps {
  stores: Store[]
  selectedStoreId: string
  onSelectStore: (storeId: string) => void
  requestedStores?: Array<{ storeId: string; storeName: string }>
}

/**
 * 店舗選択コンポーネント
 */
export const StoreSelector = ({
  stores,
  selectedStoreId,
  onSelectStore,
  requestedStores
}: StoreSelectorProps) => {
  return (
    <div>
      <h3 className="font-semibold mb-3 flex items-center gap-2 text-purple-800">
        <MapPin className="w-4 h-4" />
        開催店舗を選択
      </h3>
      
      {requestedStores && requestedStores.length > 0 && (
        <div className="text-sm text-muted-foreground mb-2">
          顧客希望店舗: {requestedStores.map(s => s.storeName).join(', ')}
        </div>
      )}
      
      <Select value={selectedStoreId} onValueChange={onSelectStore}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="店舗を選択してください" />
        </SelectTrigger>
        <SelectContent>
          {stores.map(store => (
            <SelectItem key={store.id} value={store.id}>
              {store.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

