import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

// 統一スタイル
const labelStyle = "text-sm font-medium mb-1 block"
const inputStyle = "h-10 text-sm"
const rowStyle = "flex items-center gap-3"

interface ScenarioStats {
  performanceCount: number
  cancelledCount: number
  totalRevenue: number
  totalParticipants: number
  totalGmCost: number
  totalLicenseCost: number
  firstPerformanceDate: string | null
}

interface CostsPropsSectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
  scenarioStats?: ScenarioStats
}

export function CostsPropsSectionV2({ formData, setFormData, scenarioStats }: CostsPropsSectionV2Props) {
  const stats = scenarioStats || {
    performanceCount: 0,
    cancelledCount: 0,
    totalRevenue: 0,
    totalParticipants: 0,
    totalGmCost: 0,
    totalLicenseCost: 0,
    firstPerformanceDate: null
  }

  // 期間表示用のフォーマット
  const formatPeriod = () => {
    if (!stats.firstPerformanceDate) return null
    const startDate = new Date(stats.firstPerformanceDate)
    const now = new Date()
    const startStr = `${startDate.getFullYear()}.${String(startDate.getMonth() + 1).padStart(2, '0')}.${String(startDate.getDate()).padStart(2, '0')}`
    const months = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
    const years = Math.floor(months / 12)
    const remainingMonths = months % 12
    const durationStr = years > 0 
      ? `${years}年${remainingMonths > 0 ? remainingMonths + 'ヶ月' : ''}`
      : `${months}ヶ月`
    return { startStr, durationStr }
  }
  const period = formatPeriod()

  // 制作費の操作
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

  // 必要小道具の操作
  const handleAddRequiredProp = () => {
    setFormData(prev => ({
      ...prev,
      required_props: [...prev.required_props, { item: '', amount: 0, frequency: 'recurring' }]
    }))
  }

  const handleRemoveRequiredProp = (index: number) => {
    setFormData(prev => ({
      ...prev,
      required_props: prev.required_props.filter((_, i) => i !== index)
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

  // 制作費合計
  const totalProductionCost = formData.production_costs.reduce((sum, cost) => sum + (cost.amount || 0), 0)

  // 減価償却計算（制作費を超えないように制限）
  const depreciationPerPerformance = formData.depreciation_per_performance || 0
  const rawDepreciated = depreciationPerPerformance * stats.performanceCount
  const totalDepreciated = Math.min(rawDepreciated, totalProductionCost) // 制作費上限
  const depreciationRate = totalProductionCost > 0 
    ? Math.min(100, (totalDepreciated / totalProductionCost) * 100)
    : 0
  const remainingCost = Math.max(0, totalProductionCost - totalDepreciated)
  const remainingPerformances = depreciationPerPerformance > 0 
    ? Math.ceil(remainingCost / depreciationPerPerformance)
    : 0

  return (
    <div className="space-y-4">
      {/* 1. 公演実績・収益 */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <Label className={labelStyle}>公演実績</Label>
            {period && (
              <span className="text-xs text-muted-foreground">
                {period.startStr}〜（{period.durationStr}）
              </span>
            )}
          </div>
          
          {/* 1公演あたりの内訳（設定値ベース） */}
          {(() => {
            // 設定値を取得
            const maxPlayers = formData.player_count_max || 6
            const normalFee = formData.participation_costs?.find(c => c.time_slot === 'normal')?.amount || formData.participation_fee || 0
            const gmTestFee = formData.participation_costs?.find(c => c.time_slot === 'gmtest')?.amount || 0
            
            // GM報酬をカテゴリ別に集計
            const normalGmReward = formData.gm_assignments
              ?.filter(a => (a.category || 'normal') === 'normal')
              .reduce((sum, a) => sum + (a.reward || 0), 0) || 0
            const gmTestGmRewardRaw = formData.gm_assignments
              ?.filter(a => a.category === 'gmtest')
              .reduce((sum, a) => sum + (a.reward || 0), 0) || 0
            // GMテスト報酬が未設定の場合、通常報酬-2000円をデフォルトに
            const gmTestGmReward = gmTestGmRewardRaw > 0 ? gmTestGmRewardRaw : Math.max(0, normalGmReward - 2000)
            
            const normalLicense = formData.license_rewards?.find(r => r.item === 'normal')?.amount || 0
            const gmTestLicense = formData.license_rewards?.find(r => r.item === 'gmtest')?.amount || 0
            const depPerPerf = depreciationPerPerformance || 0
            
            // 売上 = 参加費 × 最大人数
            const normalRevenue = normalFee * maxPlayers
            const gmTestRevenue = gmTestFee * maxPlayers
            
            const normalProfit = normalRevenue - normalGmReward - normalLicense - depPerPerf
            const gmTestProfit = gmTestRevenue - gmTestGmReward - gmTestLicense - depPerPerf
            
            return (
              <div className="text-xs mt-2 space-y-1">
                {/* 通常公演 */}
                <div className="flex flex-wrap items-center gap-x-1 text-muted-foreground">
                  <span className="font-medium text-foreground">通常：</span>
                  <span>¥{normalFee.toLocaleString()}×{maxPlayers}人=¥{normalRevenue.toLocaleString()}</span>
                  <span>− GM¥{normalGmReward.toLocaleString()}</span>
                  <span>− ライセンス¥{normalLicense.toLocaleString()}</span>
                  {depPerPerf > 0 && <span>− 償却¥{depPerPerf.toLocaleString()}</span>}
                  <span>=</span>
                  <span className={normalProfit >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                    ¥{normalProfit.toLocaleString()}
                  </span>
                </div>
                {/* GMテスト公演 */}
                <div className="flex flex-wrap items-center gap-x-1 text-muted-foreground">
                  <span className="font-medium text-foreground">GMテスト：</span>
                  <span>¥{gmTestFee.toLocaleString()}×{maxPlayers}人=¥{gmTestRevenue.toLocaleString()}</span>
                  <span>− GM¥{gmTestGmReward.toLocaleString()}</span>
                  <span>− ライセンス¥{gmTestLicense.toLocaleString()}</span>
                  {depPerPerf > 0 && <span>− 償却¥{depPerPerf.toLocaleString()}</span>}
                  <span>=</span>
                  <span className={gmTestProfit >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                    ¥{gmTestProfit.toLocaleString()}
                  </span>
                </div>
                {/* 回収状況 */}
                {totalProductionCost > 0 && depreciationPerPerformance > 0 && (
                  <div className="text-muted-foreground">
                    {depreciationRate >= 100 ? (
                      <span className="text-green-600 font-medium">制作費回収済み ✓</span>
                    ) : (
                      <span>あと{remainingPerformances}回で制作費回収</span>
                    )}
                  </div>
                )}
              </div>
            )
          })()}
          
          {/* 公演回数 */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <div className="text-2xl font-bold">{stats.performanceCount}</div>
              <div className="text-xs text-muted-foreground">累計公演</div>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <div className={`text-2xl font-bold ${stats.cancelledCount > 0 ? 'text-orange-500' : ''}`}>
                {stats.cancelledCount}
              </div>
              <div className="text-xs text-muted-foreground">中止</div>
            </div>
          </div>

          {/* 収益情報（データがある場合） */}
          {stats.totalRevenue > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="grid grid-cols-2 gap-3">
                {/* 総売上 */}
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    ¥{stats.totalRevenue.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">総売上</div>
                </div>
                
                {/* 利益 */}
                <div className={`text-center p-3 rounded-lg ${
                  stats.totalRevenue - stats.totalGmCost - stats.totalLicenseCost - totalProductionCost >= 0 
                    ? 'bg-green-50 dark:bg-green-950/30' 
                    : 'bg-red-50 dark:bg-red-950/30'
                }`}>
                  <div className={`text-xl font-bold ${
                    stats.totalRevenue - stats.totalGmCost - stats.totalLicenseCost - totalProductionCost >= 0 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-500'
                  }`}>
                    ¥{(stats.totalRevenue - stats.totalGmCost - stats.totalLicenseCost - totalProductionCost).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">利益</div>
                </div>
              </div>
              
              {/* 内訳 */}
              <div className="mt-3 p-3 bg-muted/20 rounded-lg text-sm">
                <div className="text-xs text-muted-foreground mb-2">コスト内訳</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">GM報酬</span>
                    <span>−¥{stats.totalGmCost.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ライセンス料</span>
                    <span>−¥{stats.totalLicenseCost.toLocaleString()}</span>
                  </div>
                  {totalProductionCost > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">制作費</span>
                      <span>−¥{totalProductionCost.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 mt-1 border-t font-medium">
                    <span>合計コスト</span>
                    <span>−¥{(stats.totalGmCost + stats.totalLicenseCost + totalProductionCost).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {stats.performanceCount === 0 && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              まだ公演実績がありません
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. 制作費・減価償却 */}
      <Card>
        <CardContent className="p-5 space-y-5">
          {/* 制作費入力 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className={labelStyle}>制作費</Label>
              {totalProductionCost > 0 && (
                <span className="text-sm font-medium">
                  合計 ¥{totalProductionCost.toLocaleString()}
                </span>
              )}
            </div>
            <div className="space-y-2">
              {formData.production_costs.map((cost, index) => {
                // 項目に応じた単価設定
                const unitPrices: Record<string, number> = {
                  'キット': 30000,
                  'マニュアル': 10000,
                  'スライド': 10000,
                }
                const unitPrice = unitPrices[cost.item]
                const hasUnitPrice = unitPrice !== undefined
                const quantity = hasUnitPrice ? Math.round(cost.amount / unitPrice) || 1 : 1
                
                return (
                  <div key={index} className={rowStyle}>
                    <Input
                      value={cost.item}
                      onChange={(e) => handleUpdateProductionCost(index, 'item', e.target.value)}
                      placeholder="項目名"
                      className={`${inputStyle} flex-1`}
                    />
                    {hasUnitPrice ? (
                      <>
                        <Select
                          value={String(quantity)}
                          onValueChange={(val) => {
                            const newQuantity = parseInt(val)
                            handleUpdateProductionCost(index, 'amount', newQuantity * unitPrice)
                          }}
                        >
                          <SelectTrigger className={`${inputStyle} w-20 shrink-0`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                              <SelectItem key={n} value={String(n)}>{n}個</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="w-28 text-sm text-right shrink-0">
                          ¥{cost.amount.toLocaleString()}
                        </div>
                      </>
                    ) : (
                      <div className="w-32 relative shrink-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                        <Input
                          type="number"
                          value={cost.amount}
                          onChange={(e) => handleUpdateProductionCost(index, 'amount', parseInt(e.target.value) || 0)}
                          className={`${inputStyle} !pl-7`}
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveProductionCost(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleAddProductionCost}
              >
                <Plus className="h-4 w-4 mr-1" />
                追加
              </Button>
            </div>
          </div>

          {/* 減価償却（制作費がある場合のみ） */}
          {totalProductionCost > 0 && (
            <div className="pt-4 border-t">
              <Label className={labelStyle}>減価償却設定</Label>
              <div className="flex items-center gap-3 mt-2">
                <Select
                  value={depreciationPerPerformance > 0 
                    ? String(Math.round(totalProductionCost / depreciationPerPerformance))
                    : '50'
                  }
                  onValueChange={(val) => {
                    const targetPerformances = parseInt(val)
                    const perPerformance = Math.round(totalProductionCost / targetPerformances)
                    setFormData(prev => ({ 
                      ...prev, 
                      depreciation_per_performance: perPerformance
                    }))
                  }}
                >
                  <SelectTrigger className={`${inputStyle} w-28`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 40, 50, 100, 150, 200].map(n => (
                      <SelectItem key={n} value={String(n)}>{n}回</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">で償却</span>
                <span className="text-sm">
                  （1回 ¥{depreciationPerPerformance > 0 ? depreciationPerPerformance.toLocaleString() : Math.round(totalProductionCost / 50).toLocaleString()}）
                </span>
              </div>

              {/* 償却状況（設定されている場合） */}
              {depreciationPerPerformance > 0 && stats.performanceCount > 0 && (
                <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">償却進捗</span>
                    <span className={`text-sm font-medium ${depreciationRate >= 100 ? 'text-green-600' : ''}`}>
                      {depreciationRate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                    <div 
                      className={`h-full transition-all ${depreciationRate >= 100 ? 'bg-green-500' : 'bg-primary'}`}
                      style={{ width: `${Math.min(100, depreciationRate)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>償却済 ¥{totalDepreciated.toLocaleString()}</span>
                    <span>
                      {depreciationRate >= 100 
                        ? '完了' 
                        : `残 ¥${remainingCost.toLocaleString()}（${remainingPerformances}回）`
                      }
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. 必要小道具 */}
      <Card>
        <CardContent className="p-5">
          <Label className={labelStyle}>必要小道具</Label>
          <div className="space-y-2 mt-2">
            {formData.required_props.filter(prop => prop != null).map((prop, index) => (
              <div key={index} className={rowStyle}>
                <Input
                  value={prop.item}
                  onChange={(e) => handleUpdateRequiredProp(index, 'item', e.target.value)}
                  placeholder="項目名"
                  className={`${inputStyle} flex-1`}
                />
                <Input
                  type="number"
                  value={prop.amount}
                  onChange={(e) => handleUpdateRequiredProp(index, 'amount', parseInt(e.target.value) || 0)}
                  placeholder="数量"
                  className={`${inputStyle} w-16 shrink-0`}
                />
                <Select
                  value={prop.frequency || 'recurring'}
                  onValueChange={(value) => handleUpdateRequiredProp(index, 'frequency', value)}
                >
                  <SelectTrigger className={`${inputStyle} w-24 shrink-0`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recurring">毎回</SelectItem>
                    <SelectItem value="one-time">初回</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveRequiredProp(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleAddRequiredProp}
            >
              <Plus className="h-4 w-4 mr-1" />
              追加
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
