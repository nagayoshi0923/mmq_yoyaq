import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface StoreSelectorProps {
  stores: { id: string; name: string }[]
  selectedStoreId: string
  onStoreChange: (storeId: string) => void
  allowAll?: boolean
}

export function StoreSelector({ stores, selectedStoreId, onStoreChange, allowAll = false }: StoreSelectorProps) {
  if (!stores.length) return null
  return (
    <div className="space-y-2">
      <Label htmlFor="settings-store">設定する店舗</Label>
      <Select value={selectedStoreId} onValueChange={onStoreChange}>
        <SelectTrigger id="settings-store" className="max-w-md"><SelectValue placeholder="店舗を選択してください" /></SelectTrigger>
        <SelectContent>
          {stores.map(store => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}
          {allowAll && <SelectItem value="all">全店舗へ一括設定</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  )
}
