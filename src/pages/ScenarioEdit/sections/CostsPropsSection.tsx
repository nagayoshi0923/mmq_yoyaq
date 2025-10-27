import React from 'react'
import { ItemizedListWithDates, type ItemizedListColumn } from '@/components/ui/itemized-list-with-dates'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

interface CostsPropsSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function CostsPropsSection({ formData, setFormData }: CostsPropsSectionProps) {
  // 制作費のカラム定義
  const productionCostColumns: ItemizedListColumn[] = [
    {
      key: 'item',
      label: '項目名',
      type: 'text',
      width: '2fr',
      placeholder: '例: 印刷費'
    },
    {
      key: 'amount',
      label: '金額（円）',
      type: 'number',
      width: '1fr',
      placeholder: '0'
    }
  ]

  // 必要小道具のカラム定義
  const requiredPropColumns: ItemizedListColumn[] = [
    {
      key: 'item',
      label: '項目名',
      type: 'text',
      width: '2fr',
      placeholder: '例: プレイヤーシート'
    },
    {
      key: 'amount',
      label: '数量',
      type: 'number',
      width: '1fr',
      placeholder: '0'
    },
    {
      key: 'frequency',
      label: '頻度',
      type: 'select',
      width: '1fr',
      options: [
        { value: 'recurring', label: '毎回' },
        { value: 'one-time', label: '初回のみ' }
      ]
    }
  ]

  const handleAddProductionCost = () => {
    setFormData(prev => ({
      ...prev,
      production_costs: [...prev.production_costs, { item: '', amount: 0 }]
    }))
  }

  const handleRemoveProductionCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      production_costs: prev.production_costs.filter((_, i) => i !== index)
    }))
  }

  const handleUpdateProductionCost = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      production_costs: prev.production_costs.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  const handleAddRequiredProp = () => {
    setFormData(prev => ({
      ...prev,
      required_props: [...prev.required_props, { item: '', amount: 0, frequency: 'recurring' }]
    }))
  }

  const handleRemoveRequiredProp = (index: number) => {
    setFormData(prev => ({
      ...prev,
      required_props: prev.required_props.filter((_, i) => i !== index && prev.required_props[i] != null)
    }))
  }

  const handleUpdateRequiredProp = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      required_props: prev.required_props.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      )
    }))
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4 pb-2 border-b">制作費・道具</h3>
      <div className="space-y-6">
        {/* 制作費 */}
        <ItemizedListWithDates
          title="制作費"
          addButtonLabel="制作費を追加"
          emptyMessage="制作費が登録されていません"
          items={formData.production_costs}
          columns={productionCostColumns}
          defaultNewItem={() => ({ item: '', amount: 0 })}
          onAdd={handleAddProductionCost}
          onRemove={handleRemoveProductionCost}
          onUpdate={handleUpdateProductionCost}
          showDateRange={false}
        />

        {/* 制作費合計表示 */}
        {formData.production_costs.length > 0 && (
          <div className="text-sm font-medium text-right">
            合計: ¥{formData.production_costs.reduce((sum, cost) => sum + (cost.amount || 0), 0).toLocaleString()}
          </div>
        )}

        {/* 必要小道具 */}
        <div className="pt-6 border-t">
          <ItemizedListWithDates
            title="必要小道具"
            addButtonLabel="小道具を追加"
            emptyMessage="必要小道具が登録されていません"
            items={formData.required_props.filter(prop => prop != null)}
            columns={requiredPropColumns}
            defaultNewItem={() => ({ item: '', amount: 0, frequency: 'recurring' })}
            onAdd={handleAddRequiredProp}
            onRemove={handleRemoveRequiredProp}
            onUpdate={handleUpdateRequiredProp}
            showDateRange={false}
          />
        </div>
      </div>
    </div>
  )
}

