import React from 'react'
import { ItemizedListWithDates, type ItemizedListColumn } from '@/components/ui/itemized-list-with-dates'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

interface PricingSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function PricingSection({ formData, setFormData }: PricingSectionProps) {
  // 参加費のカラム定義
  const participationCostColumns: ItemizedListColumn[] = [
    {
      key: 'time_slot',
      label: '時間帯',
      type: 'select',
      width: '1.5fr',
      options: [
        { value: 'normal', label: '通常公演' },
        { value: 'gmtest', label: 'GMテスト' },
        { value: 'weekend', label: '週末' },
        { value: 'holiday', label: '祝日' },
        { value: 'late_night', label: '深夜' },
      ]
    },
    {
      key: 'amount',
      label: '金額（円）',
      type: 'number',
      width: '1fr',
      placeholder: '3000'
    }
  ]

  // ライセンス料のカラム定義
  const licenseRewardColumns: ItemizedListColumn[] = [
    {
      key: 'item',
      label: 'カテゴリ',
      type: 'select',
      width: '1.5fr',
      options: [
        { value: 'normal', label: '通常公演' },
        { value: 'gmtest', label: 'GMテスト' },
      ]
    },
    {
      key: 'amount',
      label: '金額（円）',
      type: 'number',
      width: '1fr',
      placeholder: '1500'
    }
  ]

  // 参加費の操作
  const handleAddParticipationCost = () => {
    setFormData(prev => ({
      ...prev,
      participation_costs: [...(prev.participation_costs || []), {
        time_slot: 'normal',
        amount: 3000,
        type: 'fixed' as const
      }]
    }))
  }

  const handleRemoveParticipationCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      participation_costs: prev.participation_costs?.filter((_, i) => i !== index) || []
    }))
  }

  const handleUpdateParticipationCost = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      participation_costs: prev.participation_costs?.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ) || []
    }))
  }

  // ライセンス料の操作
  const handleAddLicenseReward = () => {
    setFormData(prev => ({
      ...prev,
      license_rewards: [...(prev.license_rewards || []), {
        item: 'normal',
        amount: 1500,
        type: 'fixed' as const
      }]
    }))
  }

  const handleRemoveLicenseReward = (index: number) => {
    setFormData(prev => ({
      ...prev,
      license_rewards: prev.license_rewards?.filter((_, i) => i !== index) || []
    }))
  }

  const handleUpdateLicenseReward = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      license_rewards: prev.license_rewards?.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ) || []
    }))
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4 pb-2 border-b">
        <div>
          <h3 className="text-lg font-semibold">料金設定</h3>
          <p className="text-sm text-muted-foreground mt-1">
            参加費とライセンス料を設定できます
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* 参加費設定 */}
        <ItemizedListWithDates
          title="参加費設定"
          addButtonLabel="参加費を追加"
          emptyMessage="参加費設定がありません"
          items={formData.participation_costs || []}
          columns={participationCostColumns}
          defaultNewItem={() => ({
            time_slot: 'normal',
            amount: 3000,
            type: 'fixed' as const
          })}
          onAdd={handleAddParticipationCost}
          onRemove={handleRemoveParticipationCost}
          onUpdate={handleUpdateParticipationCost}
          showDateRange={true}
          dateRangeLabel="期間設定"
          enableStatusChange={true}
        />

        {/* ライセンス料設定 */}
        <div className="pt-6 border-t">
          <ItemizedListWithDates
            title="ライセンス料設定（自店用）"
            addButtonLabel="ライセンス料を追加"
            emptyMessage="ライセンス料設定がありません"
            items={formData.license_rewards || []}
            columns={licenseRewardColumns}
            defaultNewItem={() => ({
              item: 'normal',
              amount: 1500,
              type: 'fixed' as const
            })}
            onAdd={handleAddLicenseReward}
            onRemove={handleRemoveLicenseReward}
            onUpdate={handleUpdateLicenseReward}
            showDateRange={true}
            dateRangeLabel="期間設定"
            enableStatusChange={true}
          />
        </div>

        {/* 他店用（フランチャイズ）ライセンス料設定 */}
        <div className="pt-6 border-t">
          <h4 className="text-md font-semibold mb-4">他店用（フランチャイズ）ライセンス料設定</h4>
          <p className="text-sm text-muted-foreground mb-4">
            フランチャイズ店で使用する際のライセンス金額を設定します。未設定の場合は自店用ライセンス金額が使用されます。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="franchise_license_amount">他店用通常公演ライセンス料（円）</Label>
              <Input
                id="franchise_license_amount"
                type="number"
                value={formData.franchise_license_amount ?? ''}
                onChange={(e) => setFormData(prev => ({ ...prev, franchise_license_amount: parseInt(e.target.value) || undefined }))}
                min={0}
                placeholder="未設定の場合は自店用を使用"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="franchise_gm_test_license_amount">他店用GMテストライセンス料（円）</Label>
              <Input
                id="franchise_gm_test_license_amount"
                type="number"
                value={formData.franchise_gm_test_license_amount ?? ''}
                onChange={(e) => setFormData(prev => ({ ...prev, franchise_gm_test_license_amount: parseInt(e.target.value) || undefined }))}
                min={0}
                placeholder="未設定の場合は自店用を使用"
                className="mt-1.5"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
