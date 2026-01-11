import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ItemizedListWithDates, type ItemizedListColumn } from '@/components/ui/itemized-list-with-dates'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'
import { MultiSelect } from '@/components/ui/multi-select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import type { Staff } from '@/types'

interface GmSettingsSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
  staff: Staff[]
  loadingStaff?: boolean
  selectedStaffIds: string[]
  setSelectedStaffIds?: React.Dispatch<React.SetStateAction<string[]>>
  onStaffSelectionChange?: (ids: string[]) => void
  currentAssignments?: any[]
  isNewScenario?: boolean
}

export function GmSettingsSection({ 
  formData, 
  setFormData,
  staff,
  loadingStaff,
  selectedStaffIds,
  setSelectedStaffIds,
  onStaffSelectionChange,
  currentAssignments,
  isNewScenario
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
      <h3 className="text-sm sm:text-lg font-medium mb-2 sm:mb-3 pb-1.5 sm:pb-2 border-b">GM設定</h3>
      <div className="space-y-3 sm:space-y-4">
        {/* GM基本設定 */}
        <div>
          <h4 className="text-sm mb-3">GM基本設定</h4>
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
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

        {/* 担当GM設定 (追加) */}
        <div className="pt-4 border-t">
          <h4 className="text-sm mb-3">担当GM</h4>
          <div className="text-xs text-muted-foreground mb-2">
            担当開始時期は自動的に記録されます
          </div>
          
          {loadingStaff ? (
            <div className="flex items-center justify-center p-4 text-sm text-muted-foreground bg-gray-50 rounded border">
              スタッフデータを読み込み中...
            </div>
          ) : staff.length === 0 ? (
            <div className="text-sm text-red-500 p-2 border border-red-200 rounded bg-red-50">
              スタッフデータが見つかりません。
            </div>
          ) : (() => {
            // 通常のGMスタッフ（安全なフィルタリング）
            const activeGMs = staff.filter(s => {
              const roles = Array.isArray(s.role) ? s.role : (s.role ? [s.role] : [])
              return roles.includes('gm') && s.status === 'active'
            })
            
            // 既に担当GMとして設定されているスタッフ（role/statusに関係なく含める）
            const assignedStaff = staff.filter(s => selectedStaffIds.includes(s.id))
            
            // 重複を除いて結合
            const allAvailableStaff = [...activeGMs]
            assignedStaff.forEach(assignedStaff => {
              if (!allAvailableStaff.some(s => s.id === assignedStaff.id)) {
                allAvailableStaff.push(assignedStaff)
              }
            })
            
            const gmOptions = allAvailableStaff.map(staffMember => {
              const roles = Array.isArray(staffMember.role) ? staffMember.role : (staffMember.role ? [staffMember.role] : [])
              const isGm = roles.includes('gm')
              
              return {
                id: staffMember.id,
                name: staffMember.name,
                displayInfo: `経験値${staffMember.experience} | ${staffMember.line_name || ''}${
                  !isGm || staffMember.status !== 'active' 
                    ? ' (非アクティブGM)' 
                    : ''
                }`
              }
            })
            
            return (
              <MultiSelect
                options={gmOptions}
                selectedValues={selectedStaffIds}
                onSelectionChange={onStaffSelectionChange || (() => {})}
                placeholder="担当GMを選択してください"
                showBadges={true}
                useIdAsValue={true}
              />
            )
          })()}

          {/* 選択されたGMの詳細表示エリア（簡易版） */}
          {selectedStaffIds.length > 0 && (
            <ScrollArea className="h-[200px] border rounded-md p-2 mt-2">
              <div className="space-y-2">
                {selectedStaffIds.map(staffId => {
                  const staffMember = staff.find(s => s.id === staffId)
                  // 現在のアサインメント情報を探す
                  const assignment = currentAssignments?.find(a => a.staff_id === staffId) || {
                    can_main_gm: true,
                    can_sub_gm: true,
                    status: 'can_gm'
                  }
                  
                  if (!staffMember) return null
                  
                  return (
                    <div key={staffId} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                      <div className="font-medium truncate flex-1 mr-2">
                        {staffMember.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                         <Badge variant="outline" className="text-xs font-normal">
                            {assignment.can_main_gm ? 'メイン可' : ''}
                            {assignment.can_main_gm && assignment.can_sub_gm ? ' / ' : ''}
                            {assignment.can_sub_gm ? 'サブ可' : ''}
                            {!assignment.can_main_gm && !assignment.can_sub_gm ? '権限なし' : ''}
                         </Badge>
                         {assignment.status === 'want_to_learn' && <Badge variant="secondary" className="text-xs">修行中</Badge>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="text-xs text-muted-foreground mt-2 text-right">
                ※ 詳細な権限設定はスタッフ管理ページで行ってください
              </div>
            </ScrollArea>
          )}
        </div>

        {/* GM報酬設定 */}
        <div className="pt-4 border-t">
          <ItemizedListWithDates
            title="GM報酬設定"
            addButtonLabel="GM報酬を追加"
            emptyMessage="GM報酬設定がありません"
            items={(formData.gm_assignments || []) as any[]}
            columns={gmRewardColumns}
            defaultNewItem={() => ({
              role: 'main',
              reward: 2000,
              amount: 2000, // 型定義の互換性のため追加（実態はrewardを使用）
              category: 'normal' as const
            } as any)}
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
