import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select'
import { StoreMultiSelect } from '@/components/ui/store-multi-select'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Staff, Store, Scenario } from '@/types'
import { formatDateJST, getCurrentJST } from '@/utils/dateUtils'
import { assignmentApi } from '@/lib/assignmentApi'
import { logger } from '@/utils/logger'
import { showToast } from '@/utils/toast'

interface StaffEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (staff: Staff) => void
  staff: Staff | null
  stores: Store[]
  scenarios: Scenario[]
}

const roleOptions: MultiSelectOption[] = [
  { id: 'gm', name: 'GM', displayInfo: 'ゲームマスター' },
  { id: 'manager', name: 'マネージャー', displayInfo: '店舗管理' },
  { id: 'staff', name: 'スタッフ', displayInfo: '一般スタッフ' },
  { id: 'trainee', name: '研修生', displayInfo: '新人研修中' },
  { id: 'admin', name: '管理者', displayInfo: 'システム管理' }
]

const statusOptions = [
  { value: 'active', label: 'アクティブ', color: 'bg-green-100 text-green-800' },
  { value: 'inactive', label: '非アクティブ', color: 'bg-gray-100 text-gray-800' },
  { value: 'on_leave', label: '休職中', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'resigned', label: '退職', color: 'bg-red-100 text-red-800' }
]

interface ScenarioAssignment {
  scenarioId: string
  can_main_gm: boolean
  can_sub_gm: boolean
  is_experienced: boolean
  status: 'want_to_learn' | 'experienced' | 'can_gm'
}

export function StaffEditModal({ isOpen, onClose, onSave, staff, stores, scenarios }: StaffEditModalProps) {
  const [formData, setFormData] = useState<Partial<Staff>>({
    name: '',
    x_account: '',
    discord_id: '',
    discord_channel_id: '',
    email: '',
    phone: '',
    role: [],
    stores: [],
    status: 'active',
    special_scenarios: [],
    notes: '',
    avatar_color: undefined,
    avatar_url: ''
  })
  
  // シナリオ担当詳細設定
  const [scenarioAssignments, setScenarioAssignments] = useState<ScenarioAssignment[]>([])
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false)
  // アサインメントが正常に読み込まれたかどうか（保存時の判定に使用）
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false)
  // アサインメントが変更されたかどうか（変更がない場合は更新をスキップ）
  const [assignmentsChanged, setAssignmentsChanged] = useState(false)

  // スタッフデータが変更されたときにフォームを初期化
  useEffect(() => {
    if (staff) {
      setFormData({
        ...staff,
        role: Array.isArray(staff.role) ? staff.role : [staff.role],
        stores: staff.stores || [],
        special_scenarios: staff.special_scenarios || [],
        x_account: staff.x_account || '',
        discord_id: staff.discord_id || '',
        discord_channel_id: staff.discord_channel_id || '',
        email: staff.email || '',
        phone: staff.phone || '',
        notes: staff.notes || '',
        avatar_url: staff.avatar_url || ''
      })
      
      // 担当シナリオ詳細を取得
      setAssignmentsLoaded(false)
      setAssignmentsChanged(false)
      loadAssignments(staff.id)
    } else {
      setFormData({
        name: '',
        x_account: '',
        discord_id: '',
        discord_channel_id: '',
        email: '',
        phone: '',
        role: [],
        stores: [],
        status: 'active',
        special_scenarios: [],
        notes: '',
        avatar_color: undefined,
        avatar_url: ''
      })
      setScenarioAssignments([])
      setAssignmentsLoaded(true) // 新規作成時は読み込み完了扱い
      setAssignmentsChanged(false)
    }
  }, [staff])

  const loadAssignments = async (staffId: string) => {
    try {
      setIsLoadingAssignments(true)
      setAssignmentsLoaded(false)
      const assignments = await assignmentApi.getAllStaffAssignments(staffId)
      
      // APIレスポンスをUI用ステートに変換
      const formattedAssignments: ScenarioAssignment[] = assignments.map((a: any) => ({
        scenarioId: a.scenario_id,
        can_main_gm: a.can_main_gm ?? false,
        can_sub_gm: a.can_sub_gm ?? false,
        is_experienced: a.is_experienced ?? false,
        status: a.status || (a.can_main_gm ? 'can_gm' : a.is_experienced ? 'experienced' : 'want_to_learn')
      }))
      
      setScenarioAssignments(formattedAssignments)
      setAssignmentsLoaded(true)
    } catch (error) {
      logger.error('Failed to load assignments:', error)
      // エラー時はロード失敗として扱い、保存時にアサインメントを更新しない
      setAssignmentsLoaded(false)
    } finally {
      setIsLoadingAssignments(false)
    }
  }

  const handleSave = async (closeAfterSave: boolean = true) => {
    if (!formData.name) {
      showToast.warning('スタッフ名を入力してください')
      return
    }

    // ローディング中は保存を許可しない
    if (isLoadingAssignments) {
      showToast.info('担当シナリオを読み込み中です', 'しばらくお待ちください')
      return
    }

    try {
      // アサインメントが読み込まれている場合のみ、special_scenariosとexperienced_scenariosを更新
      // 読み込み失敗時は元のデータを維持
      const specialScenarios = assignmentsLoaded
        ? scenarioAssignments
            .filter(a => a.can_main_gm || a.can_sub_gm)
            .map(a => a.scenarioId)
        : formData.special_scenarios || []

      // 体験済みシナリオ（GM不可で体験済みのみ）を抽出
      // 注意: GM可能なシナリオは体験済みリストに含めない（GM可能 = 自動的に体験済み）
      const experiencedScenarios = assignmentsLoaded
        ? scenarioAssignments
            .filter(a => {
              // is_experiencedがtrueで、かつGM不可（can_main_gm=false AND can_sub_gm=false）のもののみ
              return a.is_experienced === true && !a.can_main_gm && !a.can_sub_gm
            })
            .map(a => a.scenarioId)
        : (staff as Staff & { experienced_scenarios?: string[] })?.experienced_scenarios || []

      // デバッグログ
      logger.log('💾 保存時のアサインメント状態:', {
        total: scenarioAssignments.length,
        gmScenarios: specialScenarios.length,
        experiencedScenarios: experiencedScenarios.length,
        assignments: scenarioAssignments.map(a => ({
          scenarioId: a.scenarioId,
          can_main_gm: a.can_main_gm,
          can_sub_gm: a.can_sub_gm,
          is_experienced: a.is_experienced,
          status: a.status
        }))
      })

      const staffData: Staff & { experienced_scenarios?: string[] } = {
        id: staff?.id || '',
        name: formData.name!,
        line_name: '', // 削除された項目はデフォルト値
        x_account: formData.x_account || '',
        discord_id: formData.discord_id || '',
        discord_channel_id: formData.discord_channel_id || '',
        email: formData.email!,
        phone: formData.phone || '',
        role: formData.role!,
        stores: formData.stores!,
        status: formData.status!,
        experience: 0, // 削除された項目はデフォルト値
        availability: [], // 削除された項目はデフォルト値
        ng_days: [], // 削除された項目はデフォルト値
        want_to_learn: [], // 削除された項目はデフォルト値
        available_scenarios: [], // 削除された項目はデフォルト値
        // special_scenariosは後方互換性のために保持
        special_scenarios: specialScenarios,
        // experienced_scenariosを追加（useStaffMutationで使用される）
        experienced_scenarios: experiencedScenarios,
        notes: formData.notes || '',
        avatar_color: formData.avatar_color || null,
        created_at: staff?.created_at || formatDateJST(getCurrentJST()),
        updated_at: formatDateJST(getCurrentJST())
      }

      // スタッフ情報を保存
      // onSave内でuseStaffMutationが実行され、special_scenariosとexperienced_scenariosから
      // アサインメントが自動的に更新されるため、ここでの追加更新は不要
      await onSave(staffData)
      
      if (closeAfterSave) {
        onClose()
      }
    } catch (error) {
      logger.error('Error saving staff:', error)
      showToast.error('保存中にエラーが発生しました')
    }
  }

  // シナリオ選択状態の変更ハンドラ
  const handleScenarioSelectionChange = (selectedIds: string[]) => {
    setAssignmentsChanged(true) // 変更フラグを立てる
    setScenarioAssignments(prev => {
      // 削除されたものを除外
      const updated = prev.filter(a => selectedIds.includes(a.scenarioId))
      
      // 追加されたものを初期値で追加
      selectedIds.forEach(id => {
        if (!updated.some(a => a.scenarioId === id)) {
          updated.push({
            scenarioId: id,
            can_main_gm: true,
            can_sub_gm: true,
            is_experienced: false,
            status: 'can_gm'
          })
        }
      })
      
      return updated
    })
  }

  // 個別シナリオの権限変更ハンドラ
  const handleAssignmentUpdate = (scenarioId: string, updates: Partial<ScenarioAssignment>) => {
    setAssignmentsChanged(true) // 変更フラグを立てる
    setScenarioAssignments(prev => prev.map(a => {
      if (a.scenarioId !== scenarioId) return a
      
      const updated = { ...a, ...updates }
      
      // ステータスとフラグの整合性を保つ
      if (updates.status) {
        switch (updates.status) {
          case 'can_gm':
            updated.can_main_gm = true
            updated.can_sub_gm = true
            updated.is_experienced = false
            break
          case 'experienced':
            updated.can_main_gm = false
            updated.can_sub_gm = false
            updated.is_experienced = true
            break
          case 'want_to_learn':
            updated.can_main_gm = false
            updated.can_sub_gm = false
            updated.is_experienced = false
            break
        }
      } else if (updates.is_experienced !== undefined) {
        // is_experiencedが直接変更された場合
        if (updated.is_experienced) {
          updated.can_main_gm = false
          updated.can_sub_gm = false
          updated.status = 'experienced'
        } else if (updated.can_main_gm || updated.can_sub_gm) {
          updated.status = 'can_gm'
        } else {
          updated.status = 'want_to_learn'
        }
      } else if (updates.can_main_gm !== undefined || updates.can_sub_gm !== undefined) {
         if (updated.can_main_gm || updated.can_sub_gm) {
           updated.status = 'can_gm'
           updated.is_experienced = false
         } else if (updated.is_experienced) {
           updated.status = 'experienced'
         } else {
           updated.status = 'want_to_learn'
         }
      }
      
      logger.log('🔄 アサインメント更新:', {
        scenarioId,
        updates,
        result: updated
      })
      
      return updated
    }))
  }


  const storeOptions: MultiSelectOption[] = stores.map(store => ({
    id: store.id,
    name: store.name,
    displayInfo: store.short_name
  }))

  const scenarioOptions: MultiSelectOption[] = scenarios.map(scenario => ({
    id: scenario.id,
    name: scenario.title,
    displayInfo: `${scenario.duration}分 | ${scenario.player_count_min}-${scenario.player_count_max}人`
  }))

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[480px] max-h-[85vh] overflow-y-auto p-3">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-sm">{staff ? 'スタッフ編集' : 'スタッフ新規作成'}</DialogTitle>
          <DialogDescription className="text-[11px]">
            基本情報・役割・勤務可能日を設定
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {/* 基本情報 */}
          <div>
            <Label htmlFor="name">名前 *</Label>
            <Input
              id="name"
              value={formData.name || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="田中 太郎"
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="tanaka@example.com"
              />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="phone">電話番号</Label>
              <Input
                id="phone"
                value={formData.phone || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="090-1234-5678"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5">
              <Label htmlFor="x_account">X(Twitter)</Label>
              <Input
                id="x_account"
                value={formData.x_account || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, x_account: e.target.value }))}
                placeholder="@tanaka_gm"
              />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="discord_id">Discord ID</Label>
              <Input
                id="discord_id"
                value={formData.discord_id || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, discord_id: e.target.value }))}
                placeholder="1427064798650040472"
              />
              <p className="text-[9px] text-muted-foreground">
                通知機能で使用
              </p>
            </div>
          </div>

          <div className="space-y-0.5">
            <Label htmlFor="discord_channel_id">Discord チャンネルID</Label>
            <Input
              id="discord_channel_id"
              value={formData.discord_channel_id || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, discord_channel_id: e.target.value }))}
              placeholder="1234567890123456789"
            />
            <p className="text-[9px] text-muted-foreground">
              個別通知用チャンネル
            </p>
          </div>

          {/* アバター色選択 */}
          <div className="space-y-0.5">
            <Label>アバター色</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {[
                { bg: '#EFF6FF', text: '#2563EB', name: '青' },
                { bg: '#F0FDF4', text: '#16A34A', name: '緑' },
                { bg: '#FFFBEB', text: '#D97706', name: '黄' },
                { bg: '#FEF2F2', text: '#DC2626', name: '赤' },
                { bg: '#F5F3FF', text: '#7C3AED', name: '紫' },
                { bg: '#FDF2F8', text: '#DB2777', name: 'ピンク' }
              ].map((color) => (
                <Badge
                  key={color.bg}
                  variant="outline"
                  className={`cursor-pointer px-1.5 py-0.5 text-[11px] font-normal transition-all border ${
                    formData.avatar_color === color.bg 
                      ? 'ring-1 ring-offset-1' 
                      : 'hover:scale-105'
                  }`}
                  style={{
                    backgroundColor: color.bg,
                    color: color.text,
                    borderColor: color.text + '40'
                  }}
                  onClick={() => setFormData(prev => ({ ...prev, avatar_color: color.bg }))}
                >
                  {color.name}
                </Badge>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFormData(prev => ({ ...prev, avatar_color: undefined }))}
                className="text-[11px] h-5 px-1.5"
              >
                自動に戻す
              </Button>
            </div>
          </div>

          {/* 役割・ステータス */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-0.5">
              <Label htmlFor="role">役割</Label>
              <MultiSelect
                options={roleOptions}
                selectedValues={formData.role || []}
                onSelectionChange={(values) => setFormData(prev => ({ ...prev, role: values }))}
                placeholder="役割"
                showBadges={true}
                useIdAsValue={true}
              />
            </div>
            <div className="space-y-0.5">
              <Label htmlFor="status">ステータス</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value as 'active' | 'inactive' | 'on-leave' }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータス" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <Badge size="sm" className={option.color}>
                        {option.label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 担当店舗 */}
          <div className="space-y-0.5">
            <Label htmlFor="stores">担当店舗</Label>
            <StoreMultiSelect
              stores={stores}
              selectedStoreIds={formData.stores || []}
              onStoreIdsChange={(storeIds) => {
                setFormData(prev => ({ ...prev, stores: storeIds }))
              }}
              hideLabel={true}
              placeholder="全店舗担当"
            />
          </div>

          {/* 担当シナリオ */}
          <div className="space-y-1">
            <Label htmlFor="special_scenarios">担当シナリオ</Label>
            
            {isLoadingAssignments ? (
              <div className="flex items-center justify-center p-2 text-[11px] text-muted-foreground bg-gray-50 rounded border">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-1.5"></div>
                読み込み中...
              </div>
            ) : (
            <MultiSelect
              options={scenarioOptions}
              selectedValues={scenarioAssignments.map(a => a.scenarioId)}
              onSelectionChange={handleScenarioSelectionChange}
              placeholder="シナリオ"
              showBadges={true}
              useIdAsValue={true}
            />
            )}
            
            {/* シナリオ詳細設定リスト */}
            {!isLoadingAssignments && scenarioAssignments.length > 0 && (
              <ScrollArea className="h-[140px] border rounded p-1.5 mt-1">
                <div className="space-y-1">
                  {scenarioAssignments.map(assignment => {
                    const scenario = scenarios.find(s => s.id === assignment.scenarioId)
                    if (!scenario) return null
                    
                    return (
                      <div key={assignment.scenarioId} className="flex items-center justify-between p-1 bg-gray-50 rounded text-[11px]">
                        <div className="font-medium truncate flex-1 mr-1.5">
                          {scenario.title}
                        </div>
                        <div className="flex items-center gap-1">
                          <Select 
                            value={assignment.status} 
                            onValueChange={(val: any) => handleAssignmentUpdate(assignment.scenarioId, { status: val })}
                          >
                            <SelectTrigger className="h-5 w-[80px] text-[11px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="can_gm">GM可</SelectItem>
                              <SelectItem value="experienced">通過済</SelectItem>
                              <SelectItem value="want_to_learn">覚えたい</SelectItem>
                            </SelectContent>
                          </Select>
                          
                          {assignment.status === 'can_gm' && (
                            <div className="flex gap-1 border-l pl-1 ml-0.5">
                                <div className="flex items-center space-x-0.5">
                                    <Checkbox 
                                        id={`main-${assignment.scenarioId}`}
                                        checked={assignment.can_main_gm}
                                        onCheckedChange={(checked) => handleAssignmentUpdate(assignment.scenarioId, { can_main_gm: !!checked })}
                                        className="h-3 w-3"
                                    />
                                    <Label htmlFor={`main-${assignment.scenarioId}`} className="text-[9px] cursor-pointer">メイン</Label>
                                </div>
                                <div className="flex items-center space-x-0.5">
                                    <Checkbox 
                                        id={`sub-${assignment.scenarioId}`}
                                        checked={assignment.can_sub_gm}
                                        onCheckedChange={(checked) => handleAssignmentUpdate(assignment.scenarioId, { can_sub_gm: !!checked })}
                                        className="h-3 w-3"
                                    />
                                    <Label htmlFor={`sub-${assignment.scenarioId}`} className="text-[9px] cursor-pointer">サブ</Label>
                                </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* 備考 */}
          <div className="space-y-0.5">
            <Label htmlFor="notes">備考</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="特記事項"
              rows={2}
            />
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex justify-between gap-1.5 pt-2 border-t mt-2">
          <Button variant="outline" onClick={onClose} size="sm">
            キャンセル
          </Button>
          <div className="flex gap-1.5">
            <Button 
              variant="outline" 
              onClick={() => handleSave(false)}
              disabled={isLoadingAssignments}
              size="sm"
            >
              {staff ? '保存' : '作成'}
            </Button>
            <Button 
              onClick={() => handleSave(true)}
              disabled={isLoadingAssignments}
              size="sm"
            >
              {isLoadingAssignments ? '読込中...' : (staff ? '保存して閉じる' : '作成して閉じる')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
