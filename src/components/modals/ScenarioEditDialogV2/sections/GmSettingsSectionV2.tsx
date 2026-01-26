import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2 } from 'lucide-react'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import type { Staff } from '@/types'
import { useSalarySettings } from '@/hooks/useSalarySettings'
import { parseIntSafe } from '@/utils/number'

// 統一スタイル
const labelStyle = "text-[11px] font-medium mb-0.5 block"
const hintStyle = "text-[10px] text-muted-foreground mt-0.5"
const inputStyle = "h-6 text-[11px]"
const rowStyle = "flex items-center gap-3"

interface GmSettingsSectionV2Props {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
  staff: Staff[]
  loadingStaff?: boolean
  selectedStaffIds: string[]
  onStaffSelectionChange?: (ids: string[]) => void
  currentAssignments?: any[]
  onAssignmentUpdate?: (staffId: string, field: 'can_main_gm' | 'can_sub_gm', value: boolean) => void
}

// 時間フォーマット用ヘルパー
const formatDurationDisplay = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}分`
  if (mins === 0) return `${hours}時間`
  return `${hours}時間${mins}分`
}

export function GmSettingsSectionV2({ 
  formData, 
  setFormData,
  staff,
  loadingStaff,
  selectedStaffIds,
  onStaffSelectionChange,
  currentAssignments = [],
  onAssignmentUpdate
}: GmSettingsSectionV2Props) {
  // デフォルト報酬設定を取得
  const { settings: salarySettings, loading: salaryLoading, calculateGmWage } = useSalarySettings()

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

  // GMスタッフオプションを生成
  const gmOptions = React.useMemo(() => {
    const activeGMs = staff.filter(s => {
      const roles = Array.isArray(s.role) ? s.role : (s.role ? [s.role] : [])
      return roles.includes('gm') && s.status === 'active'
    })
    
    const assignedStaff = staff.filter(s => selectedStaffIds.includes(s.id))
    const allAvailableStaff = [...activeGMs]
    assignedStaff.forEach(assigned => {
      if (!allAvailableStaff.some(s => s.id === assigned.id)) {
        allAvailableStaff.push(assigned)
      }
    })
    
    return allAvailableStaff.map(staffMember => {
      const roles = Array.isArray(staffMember.role) ? staffMember.role : (staffMember.role ? [staffMember.role] : [])
      const isGm = roles.includes('gm')
      
      return {
        id: staffMember.id,
        name: staffMember.name,
        displayInfo: `経験値${staffMember.experience}${!isGm || staffMember.status !== 'active' ? ' (非アクティブ)' : ''}`
      }
    })
  }, [staff, selectedStaffIds])

  return (
    <div className="space-y-4">
      {/* 必要GM数 */}
      <Card>
        <CardContent className="p-2">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <Label className={labelStyle}>必要GM数</Label>
              <p className={hintStyle}>1公演に必要なGM人数。シフト調整時の人員計算に使用されます</p>
              <div className="relative mt-1.5">
                <Input
                  id="gm_count"
                  type="number"
                  min="1"
                  max="10"
                  value={formData.gm_count}
                  onChange={(e) => setFormData(prev => ({ ...prev, gm_count: parseIntSafe(e.target.value, 1) }))}
                  className={`${inputStyle} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">人</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 担当GM */}
      <Card>
        <CardContent className="p-2">
          <Label className={labelStyle}>担当GM</Label>
          <p className={hintStyle}>このシナリオのGMを担当できるスタッフ。メイン/サブの可否を個別に設定できます</p>
          {loadingStaff ? (
            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground bg-muted/30 rounded mt-1.5">
              スタッフデータを読み込み中...
            </div>
          ) : staff.length === 0 ? (
            <div className="text-sm text-destructive p-3 border border-destructive/30 rounded bg-destructive/10 mt-1.5">
              スタッフデータが見つかりません
            </div>
          ) : (
            <>
              <MultiSelect
                options={gmOptions}
                selectedValues={selectedStaffIds}
                onSelectionChange={onStaffSelectionChange || (() => {})}
                placeholder="担当GMを選択"
                showBadges={true}
                useIdAsValue={true}
                className="mt-1.5"
              />
              
              {/* 選択されたGMのリスト（メイン/サブ設定可能） */}
              {selectedStaffIds.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-4">
                    <span className="flex-1">スタッフ名</span>
                    <span className="w-20 text-center">メインGM</span>
                    <span className="w-20 text-center">サブGM</span>
                  </div>
                  {selectedStaffIds.map(staffId => {
                    const staffMember = staff.find(s => s.id === staffId)
                    const assignment = currentAssignments.find(a => a.staff_id === staffId)
                    const canMainGm = assignment?.can_main_gm ?? true
                    const canSubGm = assignment?.can_sub_gm ?? true
                    
                    if (!staffMember) return null
                    
                    return (
                      <div key={staffId} className="flex items-center gap-4 p-3 bg-muted/30 rounded text-sm">
                        <span className="font-medium flex-1">{staffMember.name}</span>
                        <div className="w-20 flex justify-center">
                          <Checkbox
                            checked={canMainGm}
                            onCheckedChange={(checked) => {
                              onAssignmentUpdate?.(staffId, 'can_main_gm', checked === true)
                            }}
                          />
                        </div>
                        <div className="w-20 flex justify-center">
                          <Checkbox
                            checked={canSubGm}
                            onCheckedChange={(checked) => {
                              onAssignmentUpdate?.(staffId, 'can_sub_gm', checked === true)
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                  <p className="text-xs text-muted-foreground mt-2">
                    ※ メインのみ可、サブのみ可、両方可を個別に設定できます
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* GM報酬 */}
      <Card>
        <CardContent className="p-2">
          <Label className={labelStyle}>GM報酬</Label>
          
          {/* 個別設定がない場合：デフォルトを使用 */}
          {(!formData.gm_assignments || formData.gm_assignments.length === 0) ? (
            <div className="space-y-3 mt-1.5">
              {/* デフォルト報酬表示 */}
              {!salaryLoading && formData.duration > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-blue-800 bg-blue-100 px-2 py-0.5 rounded">デフォルト使用中</span>
                    <span className="text-xs text-blue-600">
                      {salarySettings.use_hourly_table ? '時間別テーブル方式' : '計算式方式'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between items-center bg-white/70 rounded px-3 py-2">
                      <span className="text-blue-800">通常公演:</span>
                      <span className="font-bold text-blue-900">{calculateGmWage(formData.duration, false).toLocaleString()}円</span>
                    </div>
                    <div className="flex justify-between items-center bg-white/70 rounded px-3 py-2">
                      <span className="text-blue-800">GMテスト:</span>
                      <span className="font-bold text-blue-900">{calculateGmWage(formData.duration, true).toLocaleString()}円</span>
                    </div>
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    公演時間 {formatDurationDisplay(formData.duration)} に基づく
                    {salarySettings.effective_from && (
                      <span className="ml-2">
                        ・有効期間: {new Date(salarySettings.effective_from).toLocaleDateString('ja-JP')}
                        〜{salarySettings.effective_until 
                          ? new Date(salarySettings.effective_until).toLocaleDateString('ja-JP')
                          : '現在'}
                      </span>
                    )}
                  </p>
                </div>
              )}
              
              <p className={hintStyle}>個別設定を追加すると、デフォルトより優先されます</p>
              <Button
                type="button"
                variant="outline"
                className="w-full h-10"
                onClick={handleAddGmReward}
              >
                <Plus className="h-4 w-4 mr-2" />
                個別設定を追加
              </Button>
            </div>
          ) : (
            /* 個別設定がある場合 */
            <div className="space-y-3 mt-1.5">
              {/* 個別設定あり表示 */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded">個別設定あり</span>
                <span className="text-xs text-muted-foreground">デフォルトより優先</span>
              </div>
              
              {(formData.gm_assignments || []).map((assignment, index) => (
                <div key={index} className={rowStyle}>
                  <Select
                    value={assignment.role}
                    onValueChange={(value) => handleUpdateGmReward(index, 'role', value)}
                  >
                    <SelectTrigger className={`${inputStyle} w-32`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">メインGM</SelectItem>
                      <SelectItem value="sub">サブGM</SelectItem>
                      <SelectItem value="gm3">GM3</SelectItem>
                      <SelectItem value="gm4">GM4</SelectItem>
                      <SelectItem value="gm5">GM5</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={assignment.category || 'normal'}
                    onValueChange={(value) => handleUpdateGmReward(index, 'category', value)}
                  >
                    <SelectTrigger className={`${inputStyle} w-28`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">通常</SelectItem>
                      <SelectItem value="gmtest">GMテスト</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                    <Input
                      type="number"
                      value={assignment.reward}
                      onChange={(e) => handleUpdateGmReward(index, 'reward', parseIntSafe(e.target.value, 0))}
                      className={`${inputStyle} !pl-7`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveGmReward(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-full h-10"
                onClick={handleAddGmReward}
              >
                <Plus className="h-4 w-4 mr-2" />
                個別設定を追加
              </Button>
              
              {/* デフォルト参考表示（折りたたみ） */}
              {!salaryLoading && formData.duration > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    デフォルト報酬を参照
                  </summary>
                  <div className="mt-2 bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
                    <div className="grid grid-cols-2 gap-2">
                      <span>通常: {calculateGmWage(formData.duration, false).toLocaleString()}円</span>
                      <span>GMテスト: {calculateGmWage(formData.duration, true).toLocaleString()}円</span>
                    </div>
                    <p className="mt-1">
                      {formatDurationDisplay(formData.duration)}・{salarySettings.use_hourly_table ? 'テーブル方式' : '計算式方式'}
                      {salarySettings.effective_from && (
                        <span>
                          ・{new Date(salarySettings.effective_from).toLocaleDateString('ja-JP')}
                          〜{salarySettings.effective_until 
                            ? new Date(salarySettings.effective_until).toLocaleDateString('ja-JP')
                            : '現在'}
                        </span>
                      )}
                    </p>
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

