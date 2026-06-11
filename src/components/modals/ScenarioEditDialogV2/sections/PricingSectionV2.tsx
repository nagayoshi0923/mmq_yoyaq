import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DateRangePopover } from '@/components/ui/date-range-popover'
import { Plus, Trash2, Coins, Building2 } from 'lucide-react'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditDialogV2/types'
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

// プリセットの time_slot 一覧（カスタムはこれ以外の文字列）
const PRESET_SLOTS = ['normal', 'gmtest', 'weekend', 'holiday', 'late_night'] as const

function getSlotLabel(timeSlot: string): string {
  switch (timeSlot) {
    case 'normal': return '通常公演'
    case 'gmtest': return 'GMテスト'
    case 'weekend': return '土日祝'
    case 'holiday': return '祝日'
    case 'late_night': return '深夜'
    default: return timeSlot  // カスタムはそのまま表示
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
    setFormData(prev => {
      const removedSlot = prev.participation_costs?.[index]?.time_slot
      // カスタム種別が削除されたら対応するlicense_rewardsも削除
      const newRewards = removedSlot && !PRESET_SLOTS.includes(removedSlot as typeof PRESET_SLOTS[number])
        ? (prev.license_rewards || []).filter(r => r.item !== removedSlot)
        : prev.license_rewards
      return {
        ...prev,
        participation_costs: prev.participation_costs?.filter((_, i) => i !== index) || [],
        license_rewards: newRewards
      }
    })
  }

  const handleUpdateParticipationCost = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      participation_costs: prev.participation_costs?.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ) || []
    }))
  }

  // カスタム公演種別のライセンス料を更新（participation_costs の licenseAmount フィールドに保存）
  // license_rewards は 'normal'/'gmtest' の2項目しか保存されないため、カスタムは participation_costs に直接格納
  const handleUpdateCustomLicenseAmount = (timeSlot: string, amount: number) => {
    setFormData(prev => ({
      ...prev,
      participation_costs: (prev.participation_costs || []).map(c =>
        c.time_slot === timeSlot ? { ...c, licenseAmount: amount } : c
      )
    }))
  }

  // ライセンス料の操作（プリセット用）
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
      {/* ── 参加費 ── */}
      <div className="rounded-lg border bg-slate-50/70 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
          <Coins className="h-3.5 w-3.5" />参加費
        </p>
        <p className="text-[11px] text-muted-foreground -mt-1">時間帯別のお客様参加料金。期間を設定すると価格改定に対応できます</p>
          <div className="space-y-1.5">
            {(formData.participation_costs || []).map((cost, index) => {
              const status = getPeriodStatus(cost.startDate, cost.endDate)
              const isCustom = !PRESET_SLOTS.includes(cost.time_slot as typeof PRESET_SLOTS[number])
              return (
                <div key={index} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                  {/* 種別 */}
                  {isCustom ? (
                    <Input value={cost.time_slot}
                      onChange={(e) => handleUpdateParticipationCost(index, 'time_slot', e.target.value)}
                      placeholder="項目名" className="h-7 text-xs w-28" />
                  ) : (
                    <Select value={cost.time_slot} onValueChange={(value) => {
                      handleUpdateParticipationCost(index, 'time_slot', value === '__custom__' ? '' : value)
                    }}>
                      <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">通常公演</SelectItem>
                        <SelectItem value="gmtest">GMテスト</SelectItem>
                        <SelectItem value="weekend">土日祝</SelectItem>
                        <SelectItem value="holiday">祝日</SelectItem>
                        <SelectItem value="late_night">深夜</SelectItem>
                        <SelectItem value="__custom__">カスタム…</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {/* 金額 */}
                  <div className="relative w-28">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                    <Input type="number" value={cost.amount}
                      onChange={(e) => handleUpdateParticipationCost(index, 'amount', parseIntSafe(e.target.value, 0))}
                      className="h-7 text-xs pl-5" />
                  </div>
                  {/* 期間 */}
                  <DateRangePopover startDate={cost.startDate} endDate={cost.endDate}
                    onDateChange={(start, end) => {
                      handleUpdateParticipationCost(index, 'startDate', start)
                      handleUpdateParticipationCost(index, 'endDate', end)
                    }}
                    label={cost.startDate || cost.endDate ? `${cost.startDate || ''}〜${cost.endDate || ''}` : '期間（任意）'}
                    buttonClassName="h-7 text-xs" />
                  {/* ステータス */}
                  <Badge className={`${getStatusColor(status)} text-[10px] px-1.5 py-0 shrink-0`}>
                    {getStatusLabel(status)}
                  </Badge>
                  {/* 削除 */}
                  <Button type="button" variant="ghost" size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive ml-auto"
                    onClick={() => handleRemoveParticipationCost(index)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
            <Button type="button" variant="outline" className="w-full h-7 text-xs mt-1"
              onClick={handleAddParticipationCost}>
              <Plus className="h-3.5 w-3.5 mr-1" />参加費を追加
            </Button>
          </div>
      </div>

      {/* ── ライセンス料（自店用） ── */}
      <div className="rounded-lg border bg-slate-50/70 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
          <Coins className="h-3.5 w-3.5" />ライセンス料（自店用）
        </p>
        <p className="text-[11px] text-muted-foreground -mt-1">自店で公演した場合に作者に支払う金額</p>
          <div className="space-y-2">
            {/* プリセット（通常・GMテスト）*/}
            {(formData.license_rewards || [])
              .filter(r => PRESET_SLOTS.includes(r.item as typeof PRESET_SLOTS[number]))
              .map((reward, _) => {
                const idx = (formData.license_rewards || []).indexOf(reward)
                return (
                  <div key={reward.item} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right">{getSlotLabel(reward.item)}</span>
                    <div className="relative w-32">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                      <Input type="number" value={reward.amount}
                        onChange={(e) => handleUpdateLicenseReward(idx, 'amount', parseIntSafe(e.target.value, 0))}
                        className="h-7 text-xs pl-5" />
                    </div>
                  </div>
                )
              })
            }
            {(formData.participation_costs || [])
              .filter((c, i, arr) =>
                c.time_slot &&
                !PRESET_SLOTS.includes(c.time_slot as typeof PRESET_SLOTS[number]) &&
                arr.findIndex(x => x.time_slot === c.time_slot) === i
              )
              .map(c => (
                <div key={c.time_slot} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-[72px] shrink-0 text-right truncate" title={c.time_slot}>{c.time_slot}</span>
                  <div className="relative w-32">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                    <Input type="number" value={c.licenseAmount ?? 0}
                      onChange={(e) => handleUpdateCustomLicenseAmount(c.time_slot, parseIntSafe(e.target.value, 0))}
                      className="h-7 text-xs pl-5" />
                  </div>
                </div>
              ))
            }
          </div>
      </div>

      {/* ── 他店公演時 ── */}
      <div className="rounded-lg border bg-slate-50/70 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
          <Building2 className="h-3.5 w-3.5" />他店公演時
        </p>
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
                const fcReceive = formData.fc_receive_license_amount
                const fcAuthor = formData.fc_author_license_amount
                // フォールバック: 未設定(null/undefined)なら他店公演時の値を使用
                const effectiveReceive = fcReceive ?? formData.external_license_amount ?? 0
                const effectiveAuthor = fcAuthor ?? formData.franchise_license_rewards?.find(r => r.item === 'normal')?.amount ?? 0
                const margin = effectiveReceive - effectiveAuthor
                const hasReceive = fcReceive !== null && fcReceive !== undefined
                const hasAuthor = fcAuthor !== null && fcAuthor !== undefined
                return (
                  <div className="grid grid-cols-4 gap-2 px-3 py-2 border-t items-center">
                    <div className="text-sm font-medium">通常公演</div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={hasReceive ? fcReceive : ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          fc_receive_license_amount: e.target.value !== '' ? parseIntSafe(e.target.value, 0) : undefined
                        }))}
                        placeholder={String(formData.external_license_amount ?? 0)}
                        className={`${inputStyle} !pl-5 text-center ${!hasReceive ? 'text-muted-foreground' : ''}`}
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                      <Input
                        type="number"
                        min="0"
                        value={hasAuthor ? fcAuthor : ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          fc_author_license_amount: e.target.value !== '' ? parseIntSafe(e.target.value, 0) : undefined
                        }))}
                        placeholder={String(formData.franchise_license_rewards?.find(r => r.item === 'normal')?.amount ?? 0)}
                        className={`${inputStyle} !pl-5 text-center ${!hasAuthor ? 'text-muted-foreground' : ''}`}
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
                const fcReceive = formData.fc_receive_gm_test_license_amount
                const fcAuthor = formData.fc_author_gm_test_license_amount
                // フォールバック: 未設定(null/undefined)なら他店公演時の値を使用
                const effectiveReceive = fcReceive ?? formData.external_gm_test_license_amount ?? 0
                const effectiveAuthor = fcAuthor ?? formData.franchise_license_rewards?.find(r => r.item === 'gmtest')?.amount ?? 0
                const margin = effectiveReceive - effectiveAuthor
                const hasReceive = fcReceive !== null && fcReceive !== undefined
                const hasAuthor = fcAuthor !== null && fcAuthor !== undefined
                return (
                  <div className="grid grid-cols-4 gap-2 px-3 py-2 border-t items-center">
                    <div className="text-sm font-medium">GMテスト</div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={hasReceive ? fcReceive : ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          fc_receive_gm_test_license_amount: e.target.value !== '' ? parseIntSafe(e.target.value, 0) : undefined
                        }))}
                        placeholder={String(formData.external_gm_test_license_amount ?? 0)}
                        className={`${inputStyle} !pl-5 text-center ${!hasReceive ? 'text-muted-foreground' : ''}`}
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">¥</span>
                      <Input
                        type="number"
                        min="0"
                        value={hasAuthor ? fcAuthor : ''}
                        onChange={(e) => setFormData(prev => ({ 
                          ...prev, 
                          fc_author_gm_test_license_amount: e.target.value !== '' ? parseIntSafe(e.target.value, 0) : undefined
                        }))}
                        placeholder={String(formData.franchise_license_rewards?.find(r => r.item === 'gmtest')?.amount ?? 0)}
                        className={`${inputStyle} !pl-5 text-center ${!hasAuthor ? 'text-muted-foreground' : ''}`}
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
      </div>
    </div>
  )
}

