import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ScenarioPerformanceHeader } from './ScenarioPerformanceHeader'

interface Store {
  id: string
  name: string
  short_name: string
}

interface ScenarioPerformanceProps {
  stores: Store[]
  selectedStore: string
  onStoreChange: (store: string) => void
}

/**
 * シナリオパフォーマンスセクション
 * TODO: 将来的に詳細な分析機能を実装
 */
export const ScenarioPerformance: React.FC<ScenarioPerformanceProps> = ({
  stores,
  selectedStore,
  onStoreChange
}) => {
  return (
    <div className="space-y-6">
      <ScenarioPerformanceHeader
        stores={stores}
        selectedStore={selectedStore}
        onStoreChange={onStoreChange}
      />

      <Card>
        <CardContent className="p-8">
          <div className="text-center text-muted-foreground">
            <p className="mb-2">シナリオパフォーマンス機能</p>
            <p className="text-sm">詳細な分析機能は今後実装予定です</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
