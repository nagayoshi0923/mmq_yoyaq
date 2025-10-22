import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from '@/components/ui/status-badge'
import { Plus, Trash2 } from 'lucide-react'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

interface PricingSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function PricingSection({ formData, setFormData }: PricingSectionProps) {
  // 時間帯オプション
  const timeSlotOptions = [
    { value: 'normal', label: '通常公演' },
    { value: 'gmtest', label: 'GMテスト' },
    { value: 'weekend', label: '週末' },
    { value: 'holiday', label: '祝日' },
    { value: 'late_night', label: '深夜' },
  ]

  // カテゴリオプション（ライセンス用）
  const categoryOptions = [
    { value: 'normal', label: '通常公演' },
    { value: 'gmtest', label: 'GMテスト' },
  ]

  // ステータス判定
  const getItemStatus = (item: any): 'active' | 'ready' | 'legacy' => {
    if (!item.startDate && !item.endDate) return 'active'
    const now = new Date()
    const start = item.startDate ? new Date(item.startDate) : null
    const end = item.endDate ? new Date(item.endDate) : null
    if (start && now < start) return 'ready'
    if (end && now > end) return 'legacy'
    return 'active'
  }

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'active': return '使用中'
      case 'ready': return '待機中'
      case 'legacy': return '過去の設定'
      default: return status
    }
  }

  // 参加費の追加
  const handleAddParticipationCost = () => {
    const newCost = {
      time_slot: 'normal',
      amount: 3000,
      type: 'fixed' as const,
      status: 'active' as const,
      usageCount: 0
    }
    setFormData(prev => ({
      ...prev,
      participation_costs: [...(prev.participation_costs || []), newCost]
    }))
  }

  // 参加費の削除
  const handleRemoveParticipationCost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      participation_costs: prev.participation_costs?.filter((_, i) => i !== index) || []
    }))
  }

  // 参加費の更新
  const handleUpdateParticipationCost = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      participation_costs: prev.participation_costs?.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ) || []
    }))
  }

  // ライセンス料の追加
  const handleAddLicenseReward = () => {
    const newReward = {
      item: 'normal',
      amount: 1500,
      type: 'fixed' as const,
      status: 'active' as const,
      usageCount: 0
    }
    setFormData(prev => ({
      ...prev,
      license_rewards: [...(prev.license_rewards || []), newReward]
    }))
  }

  // ライセンス料の削除
  const handleRemoveLicenseReward = (index: number) => {
    setFormData(prev => ({
      ...prev,
      license_rewards: prev.license_rewards?.filter((_, i) => i !== index) || []
    }))
  }

  // ライセンス料の更新
  const handleUpdateLicenseReward = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      license_rewards: prev.license_rewards?.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ) || []
    }))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>参加費設定</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              時間帯ごとに異なる参加費を設定できます。<br />
              開始日・終了日を設定しない場合は、現行設定（使用中）として扱われます。
            </p>
          </div>
          <Button
            type="button"
            onClick={handleAddParticipationCost}
            size="sm"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            参加費を追加
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {(!formData.participation_costs || formData.participation_costs.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              <p>参加費設定がありません</p>
              <p className="text-sm mt-2">「参加費を追加」ボタンから追加してください</p>
            </div>
          ) : (
            formData.participation_costs.map((cost, index) => {
              const status = getItemStatus(cost)
              return (
                <Card key={index} className="border-2">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="pt-6">
                        <StatusBadge status={status} label={getStatusLabel(status)} />
                      </div>

                      <div className="flex-1">
                        <div className="grid grid-cols-[1fr_1fr_0.8fr_0.8fr_auto] gap-3 items-end">
                          {/* 時間帯 */}
                          <div>
                            <Label className="text-xs">時間帯</Label>
                            <Select
                              value={cost.time_slot}
                              onValueChange={(value) => handleUpdateParticipationCost(index, 'time_slot', value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {timeSlotOptions.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* 金額 */}
                          <div>
                            <Label className="text-xs">参加費（円）</Label>
                            <Input
                              type="number"
                              min="0"
                              step="100"
                              value={cost.amount}
                              onChange={(e) => handleUpdateParticipationCost(index, 'amount', parseInt(e.target.value) || 0)}
                              className="text-right"
                            />
                          </div>

                          {/* 開始日 */}
                          <div>
                            <Label className="text-xs">開始日（任意）</Label>
                            <Input
                              type="date"
                              value={cost.startDate || ''}
                              onChange={(e) => handleUpdateParticipationCost(index, 'startDate', e.target.value || undefined)}
                            />
                          </div>

                          {/* 終了日 */}
                          <div>
                            <Label className="text-xs">終了日（任意）</Label>
                            <Input
                              type="date"
                              value={cost.endDate || ''}
                              onChange={(e) => handleUpdateParticipationCost(index, 'endDate', e.target.value || undefined)}
                            />
                          </div>

                          {/* 削除ボタン */}
                          <div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveParticipationCost(index)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* 期間表示 */}
                        {(cost.startDate || cost.endDate) && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <span className="font-medium">適用期間: </span>
                            {cost.startDate && !cost.endDate && `${cost.startDate}から`}
                            {!cost.startDate && cost.endDate && `${cost.endDate}まで`}
                            {cost.startDate && cost.endDate && `${cost.startDate} 〜 ${cost.endDate}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>ライセンス料設定</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              公演カテゴリごとに異なるライセンス料を設定できます。<br />
              開始日・終了日を設定しない場合は、現行設定（使用中）として扱われます。
            </p>
          </div>
          <Button
            type="button"
            onClick={handleAddLicenseReward}
            size="sm"
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            ライセンス料を追加
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {(!formData.license_rewards || formData.license_rewards.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              <p>ライセンス料設定がありません</p>
              <p className="text-sm mt-2">「ライセンス料を追加」ボタンから追加してください</p>
            </div>
          ) : (
            formData.license_rewards.map((reward, index) => {
              const status = getItemStatus(reward)
              return (
                <Card key={index} className="border-2">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="pt-6">
                        <StatusBadge status={status} label={getStatusLabel(status)} />
                      </div>

                      <div className="flex-1">
                        <div className="grid grid-cols-[1fr_1fr_0.8fr_0.8fr_auto] gap-3 items-end">
                          {/* カテゴリ */}
                          <div>
                            <Label className="text-xs">公演カテゴリ</Label>
                            <Select
                              value={reward.item}
                              onValueChange={(value) => handleUpdateLicenseReward(index, 'item', value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {categoryOptions.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* 金額 */}
                          <div>
                            <Label className="text-xs">ライセンス料（円）</Label>
                            <Input
                              type="number"
                              min="0"
                              step="100"
                              value={reward.amount}
                              onChange={(e) => handleUpdateLicenseReward(index, 'amount', parseInt(e.target.value) || 0)}
                              className="text-right"
                            />
                          </div>

                          {/* 開始日 */}
                          <div>
                            <Label className="text-xs">開始日（任意）</Label>
                            <Input
                              type="date"
                              value={reward.startDate || ''}
                              onChange={(e) => handleUpdateLicenseReward(index, 'startDate', e.target.value || undefined)}
                            />
                          </div>

                          {/* 終了日 */}
                          <div>
                            <Label className="text-xs">終了日（任意）</Label>
                            <Input
                              type="date"
                              value={reward.endDate || ''}
                              onChange={(e) => handleUpdateLicenseReward(index, 'endDate', e.target.value || undefined)}
                            />
                          </div>

                          {/* 削除ボタン */}
                          <div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveLicenseReward(index)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* 期間表示 */}
                        {(reward.startDate || reward.endDate) && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <span className="font-medium">適用期間: </span>
                            {reward.startDate && !reward.endDate && `${reward.startDate}から`}
                            {!reward.startDate && reward.endDate && `${reward.endDate}まで`}
                            {reward.startDate && reward.endDate && `${reward.startDate} 〜 ${reward.endDate}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}

