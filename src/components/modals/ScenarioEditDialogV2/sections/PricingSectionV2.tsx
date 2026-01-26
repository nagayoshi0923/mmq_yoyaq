import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DateRangePopover } from '@/components/ui/date-range-popover'
import { Plus, Trash2 } from 'lucide-react'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { parseIntSafe } from '@/utils/number'

interface PricingSectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

// 統一スタイル
const labelStyle = "text-xs font-medium mb-0.5 block"
const hintStyle = "text-[11px] text-muted-foreground"
const inputStyle = "h-7 text-xs"
const rowStyle = "flex items-center gap-3"

// 期間のステータスを判定
function getPeriodStatus(startDate?: string, endDate?: string): 'active' | 'ready' | 'legacy' {
  if (!startDate && !endDate) return 'active'
  const now = new Date()
  const start = startDate ? new Date(startDate) : null
  const end = endDate ? new Date(endDate) : null
  if (start && now < start) return 'ready'
  if (end && now > end) return 'legacy'
  return 'active'
}

function getStatusLabel(status: 'active' | 'ready' | 'legacy'): string {
  switch (status) {
    case 'active': return '適用中'
    case 'ready': return '待機中'
    case 'legacy': return '過去'
    default: return status
  }
}

function getStatusColor(status: 'active' | 'ready' | 'legacy'): string {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800'
    case 'ready': return 'bg-blue-100 text-blue-800'
    case 'legacy': return 'bg-gray-100 text-gray-500'
    default: return 'bg-gray-100'
  }
}

export function PricingSectionV2({ formData, setFormData }: PricingSectionV2Props) {
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
  const handleUpdateLicenseReward = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      license_rewards: prev.license_rewards?.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ) || []
    }))
  }

  const handleUpdateFranchiseLicenseReward = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      franchise_license_rewards: prev.franchise_license_rewards?.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ) || []
    }))
  }

  return (
    <div className="space-y-4">
      {/* 参加費 */}
      <Card>
        <CardContent className="p-2">
          <Label className={labelStyle}>参加費</Label>
          <p className={hintStyle}>時間帯別のお客様参加料金。期間を設定すると、その期間のみ適用されます（価格改定対応）</p>
          <div className="space-y-4 mt-3">
            {(formData.participation_costs || []).map((cost, index) => {
              const status = getPeriodStatus(cost.startDate, cost.endDate)
              return (
                <div key={index} className="p-3 border rounded-lg bg-muted/20 space-y-3">
                  {/* 1行目: 時間帯・金額・削除 */}
                  <div className={rowStyle}>
                    <Select
                      value={cost.time_slot}
                      onValueChange={(value) => handleUpdateParticipationCost(index, 'time_slot', value)}
                    >
                      <SelectTrigger className={`${inputStyle} w-36`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">通常公演</SelectItem>
                        <SelectItem value="gmtest">GMテスト</SelectItem>
                        <SelectItem value="weekend">週末</SelectItem>
                        <SelectItem value="holiday">祝日</SelectItem>
                        <SelectItem value="late_night">深夜</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                      <Input
                        type="number"
                        value={cost.amount}
                        onChange={(e) => handleUpdateParticipationCost(index, 'amount', parseIntSafe(e.target.value, 0))}
                        className={`${inputStyle} !pl-7`}
                      />
                    </div>
                    <Badge className={`${getStatusColor(status)} text-xs shrink-0`}>
                      {getStatusLabel(status)}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveParticipationCost(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* 2行目: 期間設定 */}
                  <div className="flex items-center gap-2 text-sm">
                    <DateRangePopover
                      startDate={cost.startDate}
                      endDate={cost.endDate}
                      onDateChange={(start, end) => {
                        handleUpdateParticipationCost(index, 'startDate', start)
                        handleUpdateParticipationCost(index, 'endDate', end)
                      }}
                      label={
                        cost.startDate || cost.endDate
                          ? `${cost.startDate || ''}〜${cost.endDate || ''}`
                          : '期間設定（任意）'
                      }
                      buttonClassName="w-auto"
                    />
                    {!cost.startDate && !cost.endDate && (
                      <span className="text-xs text-muted-foreground">(無期限=常に適用)</span>
                    )}
                  </div>
                </div>
              )
            })}
            <Button
              type="button"
              variant="outline"
              className="w-full h-10"
              onClick={handleAddParticipationCost}
            >
              <Plus className="h-4 w-4 mr-2" />
              参加費を追加
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ライセンス料（自店用） */}
      <Card>
        <CardContent className="p-2">
          <Label className={labelStyle}>ライセンス料（自店用）</Label>
          <p className={hintStyle}>自店で公演した場合に作者に支払う金額</p>
          <div className="grid grid-cols-2 gap-5 mt-1.5">
            {(formData.license_rewards || []).map((reward, index) => (
              <div key={index} className={rowStyle}>
                <span className="text-sm w-20 shrink-0">
                  {reward.item === 'normal' ? '通常公演' : 'GMテスト'}
                </span>
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                  <Input
                    type="number"
                    value={reward.amount}
                    onChange={(e) => handleUpdateLicenseReward(index, 'amount', parseIntSafe(e.target.value, 0))}
                    className={`${inputStyle} !pl-7`}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 他店公演時（フランチャイズ対応） */}
      <Card>
        <CardContent className="p-2">
          <Label className={labelStyle}>他店公演時</Label>
          <p className={hintStyle}>フランチャイズ店舗が公演した場合の金額設定</p>
          
          {/* テーブル形式で表示 */}
          <div className="mt-3 border rounded-lg overflow-hidden">
            {/* ヘッダー */}
            <div className="grid grid-cols-4 gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
              <div></div>
              <div className="text-center">受取金額</div>
              <div className="text-center">作者支払</div>
              <div className="text-center">マージン</div>
            </div>
            
            {/* 通常公演 */}
            {(() => {
              const externalAmount = formData.external_license_amount || 0
              const authorPayment = formData.franchise_license_rewards?.find(r => r.item === 'normal')?.amount ?? 
                                    formData.license_rewards?.find(r => r.item === 'normal')?.amount ?? 0
              const margin = externalAmount - authorPayment
              return (
                <div className="grid grid-cols-4 gap-2 px-3 py-2 border-t items-center">
                  <div className="text-sm font-medium">通常公演</div>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      value={externalAmount}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        external_license_amount: parseIntSafe(e.target.value, 0)
                      }))}
                      className={`${inputStyle} !pl-5 text-center`}
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                    <Input
                      type="number"
                      value={formData.franchise_license_rewards?.find(r => r.item === 'normal')?.amount ?? 0}
                      onChange={(e) => handleUpdateFranchiseLicenseReward(
                        formData.franchise_license_rewards?.findIndex(r => r.item === 'normal') ?? 0, 
                        'amount', 
                        parseIntSafe(e.target.value, 0)
                      )}
                      placeholder="自店用と同額"
                      className={`${inputStyle} !pl-5 text-center`}
                    />
                  </div>
                  <div className={`text-center text-sm font-medium ${margin > 0 ? 'text-green-600' : margin < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {externalAmount > 0 ? `¥${margin.toLocaleString()}` : '-'}
                  </div>
                </div>
              )
            })()}
            
            {/* GMテスト */}
            {(() => {
              const externalAmount = formData.external_gm_test_license_amount || 0
              const authorPayment = formData.franchise_license_rewards?.find(r => r.item === 'gmtest')?.amount ?? 
                                    formData.license_rewards?.find(r => r.item === 'gmtest')?.amount ?? 0
              const margin = externalAmount - authorPayment
              return (
                <div className="grid grid-cols-4 gap-2 px-3 py-2 border-t items-center">
                  <div className="text-sm font-medium">GMテスト</div>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      value={externalAmount}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        external_gm_test_license_amount: parseIntSafe(e.target.value, 0)
                      }))}
                      className={`${inputStyle} !pl-5 text-center`}
                    />
                  </div>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                    <Input
                      type="number"
                      value={formData.franchise_license_rewards?.find(r => r.item === 'gmtest')?.amount ?? 0}
                      onChange={(e) => handleUpdateFranchiseLicenseReward(
                        formData.franchise_license_rewards?.findIndex(r => r.item === 'gmtest') ?? 0, 
                        'amount', 
                        parseIntSafe(e.target.value, 0)
                      )}
                      placeholder="自店用と同額"
                      className={`${inputStyle} !pl-5 text-center`}
                    />
                  </div>
                  <div className={`text-center text-sm font-medium ${margin > 0 ? 'text-green-600' : margin < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {externalAmount > 0 ? `¥${margin.toLocaleString()}` : '-'}
                  </div>
                </div>
              )
            })()}
          </div>
          
          <p className={`${hintStyle} mt-3`}>
            受取金額が未設定（0円）の場合は自店用ライセンス料と同額になります
          </p>
          
          {/* フランチャイズ公演時 */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <Label className={labelStyle}>フランチャイズ公演時</Label>
              <span className="text-[10px] text-muted-foreground">未設定の場合は他店公演時の設定を使用</span>
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              {/* ヘッダー */}
              <div className="grid grid-cols-4 gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div></div>
                <div className="text-center">受取金額</div>
                <div className="text-center">作者支払</div>
                <div className="text-center">マージン</div>
              </div>
              
              {/* 通常公演 */}
              {(() => {
                const fcReceive = formData.fc_receive_license_amount || 0
                const fcAuthor = formData.fc_author_license_amount || 0
                // フォールバック: 未設定なら他店公演時の値を表示
                const effectiveReceive = fcReceive || formData.external_license_amount || 0
                const effectiveAuthor = fcAuthor || formData.franchise_license_rewards?.find(r => r.item === 'normal')?.amount || 0
                const margin = effectiveReceive - effectiveAuthor
                return (
                  <div className="grid grid-cols-4 gap-2 px-3 py-2 border-t items-center">
                    <div className="text-sm font-medium">通常公演</div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={fcReceive || ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          fc_receive_license_amount: e.target.value ? parseIntSafe(e.target.value, 0) : undefined
                        }))}
                        placeholder={String(formData.external_license_amount || 0)}
                        className={`${inputStyle} !pl-5 text-center ${!fcReceive ? 'text-muted-foreground' : ''}`}
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                      <Input
                        type="number"
                        value={fcAuthor || ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          fc_author_license_amount: e.target.value ? parseIntSafe(e.target.value, 0) : undefined
                        }))}
                        placeholder={String(formData.franchise_license_rewards?.find(r => r.item === 'normal')?.amount || 0)}
                        className={`${inputStyle} !pl-5 text-center ${!fcAuthor ? 'text-muted-foreground' : ''}`}
                      />
                    </div>
                    <div className={`text-center text-sm font-medium ${margin > 0 ? 'text-green-600' : margin < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {effectiveReceive > 0 ? `¥${margin.toLocaleString()}` : '-'}
                    </div>
                  </div>
                )
              })()}
              
              {/* GMテスト */}
              {(() => {
                const fcReceive = formData.fc_receive_gm_test_license_amount || 0
                const fcAuthor = formData.fc_author_gm_test_license_amount || 0
                // フォールバック: 未設定なら他店公演時の値を表示
                const effectiveReceive = fcReceive || formData.external_gm_test_license_amount || 0
                const effectiveAuthor = fcAuthor || formData.franchise_license_rewards?.find(r => r.item === 'gmtest')?.amount || 0
                const margin = effectiveReceive - effectiveAuthor
                return (
                  <div className="grid grid-cols-4 gap-2 px-3 py-2 border-t items-center">
                    <div className="text-sm font-medium">GMテスト</div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={fcReceive || ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          fc_receive_gm_test_license_amount: e.target.value ? parseIntSafe(e.target.value, 0) : undefined
                        }))}
                        placeholder={String(formData.external_gm_test_license_amount || 0)}
                        className={`${inputStyle} !pl-5 text-center ${!fcReceive ? 'text-muted-foreground' : ''}`}
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                      <Input
                        type="number"
                        value={fcAuthor || ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          fc_author_gm_test_license_amount: e.target.value ? parseIntSafe(e.target.value, 0) : undefined
                        }))}
                        placeholder={String(formData.franchise_license_rewards?.find(r => r.item === 'gmtest')?.amount || 0)}
                        className={`${inputStyle} !pl-5 text-center ${!fcAuthor ? 'text-muted-foreground' : ''}`}
                      />
                    </div>
                    <div className={`text-center text-sm font-medium ${margin > 0 ? 'text-green-600' : margin < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {effectiveReceive > 0 ? `¥${margin.toLocaleString()}` : '-'}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

