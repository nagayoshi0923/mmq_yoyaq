import React from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

interface Store {
  id: string
  name: string
}

interface ScenarioPerformanceHeaderProps {
  selectedStore: string
  onStoreChange: (storeId: string) => void
  stores: Store[]
}

/**
 * シナリオパフォーマンスヘッダー
 */
export const ScenarioPerformanceHeader: React.FC<ScenarioPerformanceHeaderProps> = ({
  selectedStore,
  onStoreChange,
  stores
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">シナリオ分析</h1>
      </div>

      {/* 店舗選択 */}
      <div className="flex items-center gap-4">
        <Label htmlFor="scenarioStoreSelect">店舗選択</Label>
        <Select value={selectedStore} onValueChange={onStoreChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="店舗を選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全店舗</SelectItem>
            {stores.map((store) => (
              <SelectItem key={store.id} value={store.id}>
                {store.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
