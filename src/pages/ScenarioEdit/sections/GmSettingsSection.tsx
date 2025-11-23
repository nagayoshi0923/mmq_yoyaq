import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ItemizedListWithDates, type ItemizedListColumn } from '@/components/ui/itemized-list-with-dates'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

interface GmSettingsSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function GmSettingsSection({ 
  formData, 
  setFormData
}: GmSettingsSectionProps) {
  // GM報酬のカラム定義
  const gmRewardColumns: ItemizedListColumn[] = [
    {
      key: 'role',
      label: '役割',
      type: 'select',
      width: '1fr',
      options: [
        { value: 'main', label: 'メインGM' },
        { value: 'sub', label: 'サブGM' },
        { value: 'gm3', label: 'GM3' },
        { value: 'gm4', label: 'GM4' },
        { value: 'gm5', label: 'GM5' }
      ]
    },
    {
      key: 'category',
      label: 'カテゴリ',
      type: 'select',
      width: '1fr',
      options: [
        { value: 'normal', label: '通常公演' },
        { value: 'gmtest', label: 'GMテスト' }
      ]
    },
    {
      key: 'reward',
      label: '報酬（円）',
      type: 'number',
      width: '1fr',
      placeholder: '2000'
    }
  ]

  // GM報酬の操作
  const handleAddGmReward = () => {
    setFormData(prev => ({
      ...prev,
      gm_assignments: [...(prev.gm_assignments || []), {
        role: 'main',
        reward: 2000,
        category: 'normal' as const
      }]
    }))
  }

  const handleRemoveGmReward = (index: number) => {
    setFormData(prev => ({
      ...prev,
      gm_assignments: prev.gm_assignments?.filter((_, i) => i !== index) || []
    }))
  }

  const handleUpdateGmReward = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      gm_assignments: prev.gm_assignments?.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ) || []
    }))
  }

  return (
    <div>
      <h3 className="text-lg mb-4 pb-2 border-b">GM設定</h3>
      <div className="space-y-6">
        {/* GM基本設定 */}
        <div>
          <h4 className="text-sm mb-3">GM基本設定</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="gm_count">必要GM数</Label>
              <Input
                id="gm_count"
                type="number"
                min="1"
                max="10"
                value={formData.gm_count}
                onChange={(e) => setFormData(prev => ({ ...prev, gm_count: parseInt(e.target.value) || 1 }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                この公演に必要なGMの人数
              </p>
            </div>
          </div>
        </div>

        {/* GM報酬設定 */}
        <div className="pt-4 border-t">
          <ItemizedListWithDates
            title="GM報酬設定"
            addButtonLabel="GM報酬を追加"
            emptyMessage="GM報酬設定がありません"
            items={formData.gm_assignments || []}
            columns={gmRewardColumns}
            defaultNewItem={() => ({
              role: 'main',
              reward: 2000,
              category: 'normal' as const
            })}
            onAdd={handleAddGmReward}
            onRemove={handleRemoveGmReward}
            onUpdate={handleUpdateGmReward}
            showDateRange={true}
            dateRangeLabel="期間設定"
            enableStatusChange={true}
          />
        </div>
      </div>
    </div>
  )
}
