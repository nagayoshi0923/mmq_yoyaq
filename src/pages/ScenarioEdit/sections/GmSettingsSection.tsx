import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { StatusBadge } from '@/components/ui/status-badge'
import { Plus, Trash2 } from 'lucide-react'
import type { ScenarioFormData } from '@/components/modals/ScenarioEditModal/types'

interface GmSettingsSectionProps {
  formData: ScenarioFormData
  setFormData: React.Dispatch<React.SetStateAction<ScenarioFormData>>
}

export function GmSettingsSection({ 
  formData, 
  setFormData
}: GmSettingsSectionProps) {
  
  // 役割オプション
  const roleOptions = [
    { value: 'main', label: 'メインGM' },
    { value: 'sub', label: 'サブGM' },
    { value: 'gm3', label: 'GM3' },
    { value: 'gm4', label: 'GM4' },
    { value: 'gm5', label: 'GM5' }
  ]

  // カテゴリオプション
  const categoryOptions = [
    { value: 'normal', label: '通常公演' },
    { value: 'gmtest', label: 'GMテスト' }
  ]

  // 役割名の取得（表示用）
  const getRoleLabel = (role: string) => {
    const option = roleOptions.find(opt => opt.value === role)
    return option ? option.label : role
  }

  // カテゴリ名の取得（表示用）
  const getCategoryLabel = (category: string) => {
    const option = categoryOptions.find(opt => opt.value === category)
    return option ? option.label : category
  }

  // アイテムステータスの判定（開始日・終了日がない場合は「現行」=active）
  const getAssignmentStatus = (assignment: any): 'active' | 'ready' | 'legacy' => {
    // 開始日・終了日がない場合は「現行」（使用中）
    if (!assignment.startDate && !assignment.endDate) {
      return 'active'
    }
    
    const now = new Date()
    const start = assignment.startDate ? new Date(assignment.startDate) : null
    const end = assignment.endDate ? new Date(assignment.endDate) : null
    
    // 開始日が未来 → 待機中
    if (start && now < start) {
      return 'ready'
    }
    
    // 終了日が過去 → 過去の設定
    if (end && now > end) {
      return 'legacy'
    }
    
    // それ以外は使用中
    return 'active'
  }
  
  // ステータスバッジのラベル取得
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'active': return '使用中'
      case 'ready': return '待機中'
      case 'legacy': return '過去の設定'
      default: return status
    }
  }

  // GM報酬の追加
  const handleAddGmReward = () => {
    const newReward = {
      role: 'main',
      reward: 2000,
      category: 'normal' as const,
      status: 'active' as const,
      usageCount: 0
    }
    setFormData(prev => ({
      ...prev,
      gm_assignments: [...(prev.gm_assignments || []), newReward]
    }))
  }

  // GM報酬の削除
  const handleRemoveGmReward = (index: number) => {
    setFormData(prev => ({
      ...prev,
      gm_assignments: prev.gm_assignments?.filter((_, i) => i !== index) || []
    }))
  }

  // GM報酬の更新
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
      <h3 className="text-lg font-semibold mb-4 pb-2 border-b">GM設定</h3>
      <div className="space-y-6">
        {/* GM基本設定 */}
        <div>
          <Label htmlFor="gm_count">必要GM数</Label>
          <Input
            id="gm_count"
            type="number"
            min="1"
            max="5"
            value={formData.gm_count}
            onChange={(e) => setFormData(prev => ({ ...prev, gm_count: parseInt(e.target.value) || 1 }))}
            className="mt-1.5"
          />
          <p className="text-sm text-muted-foreground mt-1">
            このシナリオに必要なGMの人数
          </p>
        </div>

        {/* GM報酬設定 */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium">GM報酬設定</h4>
            <Button
              type="button"
              onClick={handleAddGmReward}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              報酬設定を追加
            </Button>
          </div>
          <div className="space-y-3">
          {(!formData.gm_assignments || formData.gm_assignments.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              <p>GM報酬設定がありません</p>
              <p className="text-sm mt-2">「報酬設定を追加」ボタンから追加してください</p>
            </div>
          ) : (
            formData.gm_assignments.map((assignment, index) => {
              const status = getAssignmentStatus(assignment)
              return (
                <div key={index} className="border-2 rounded-lg p-4 bg-card">
                    <div className="flex items-start gap-3">
                      {/* ステータスバッジ */}
                      <div className="pt-6">
                        <StatusBadge status={status} label={getStatusLabel(status)} />
                      </div>

                      {/* フォームフィールド */}
                      <div className="flex-1">
                        <div className="grid grid-cols-[1fr_1fr_1fr_0.8fr_0.8fr_auto] gap-3 items-end">
                          {/* 役割 */}
                          <div>
                            <Label className="text-xs">役割</Label>
                            <Select
                              value={assignment.role}
                              onValueChange={(value) => handleUpdateGmReward(index, 'role', value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {roleOptions.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* カテゴリ */}
                          <div>
                            <Label className="text-xs">公演カテゴリ</Label>
                            <Select
                              value={assignment.category || 'normal'}
                              onValueChange={(value) => handleUpdateGmReward(index, 'category', value)}
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

                          {/* 報酬額 */}
                          <div>
                            <Label className="text-xs">報酬額（円）</Label>
                            <Input
                              type="number"
                              min="0"
                              step="100"
                              value={assignment.reward}
                              onChange={(e) => handleUpdateGmReward(index, 'reward', parseInt(e.target.value) || 0)}
                              className="text-right"
                            />
                          </div>

                          {/* 開始日 */}
                          <div>
                            <Label className="text-xs">開始日（任意）</Label>
                            <Input
                              type="date"
                              value={assignment.startDate || ''}
                              onChange={(e) => handleUpdateGmReward(index, 'startDate', e.target.value || undefined)}
                              placeholder="未指定=現行"
                            />
                          </div>

                          {/* 終了日 */}
                          <div>
                            <Label className="text-xs">終了日（任意）</Label>
                            <Input
                              type="date"
                              value={assignment.endDate || ''}
                              onChange={(e) => handleUpdateGmReward(index, 'endDate', e.target.value || undefined)}
                              placeholder="未指定=無期限"
                            />
                          </div>

                          {/* 削除ボタン */}
                          <div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveGmReward(index)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* 期間表示（期間が設定されている場合のみ） */}
                        {(assignment.startDate || assignment.endDate) && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            <span className="font-medium">適用期間: </span>
                            {assignment.startDate && !assignment.endDate && `${assignment.startDate}から`}
                            {!assignment.startDate && assignment.endDate && `${assignment.endDate}まで`}
                            {assignment.startDate && assignment.endDate && `${assignment.startDate} 〜 ${assignment.endDate}`}
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
        <CardHeader>
          <CardTitle>担当GM設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isNewScenario ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>シナリオを保存後に担当GMを設定できます</p>
            </div>
          ) : staff.length > 0 ? (
            <>
              <div>
                <Label>このシナリオを担当できるGM</Label>
                <MultiSelect
                  options={staff.map(s => ({ id: s.id, name: s.name }))}
                  selectedValues={selectedStaffIds}
                  onSelectionChange={setSelectedStaffIds}
                  placeholder="GMを選択"
                  useIdAsValue={true}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  このシナリオをGMできるスタッフを選択してください
                </p>
              </div>

              {selectedStaffIds.length > 0 && (
                <div className="border rounded p-4 bg-slate-50">
                  <p className="text-sm font-medium mb-2">選択中のGM:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedStaffIds.map(id => {
                      const staffMember = staff.find(s => s.id === id)
                      return staffMember ? (
                        <span 
                          key={id}
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm"
                        >
                          {staffMember.name}
                        </span>
                      ) : null
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>スタッフデータを読み込んでいます...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

